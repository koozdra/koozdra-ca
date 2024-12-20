const stateValueKey = (state) => state.join(",");
const stateActionValueKey = (state) => state.join(",");

function getColorFromValue(value) {
  // Ensure the value is clamped between -1 and 1
  value = Math.max(-1, Math.min(1, value));

  // Calculate the red, green, and blue components
  let red, green, blue;

  if (value < 0) {
    // Interpolate between red (-1) and white (0)
    red = 255;
    green = 255 * (1 + value); // value is negative, so 1 + value is between 0 and 1
    blue = 255 * (1 + value);
  } else {
    // Interpolate between white (0) and blue (1)
    red = 255 * (1 - value);
    green = 255 * (1 - value);
    blue = 255;
  }

  // Convert the RGB values to a CSS color string
  return `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
}

const writeTable = (stateValues, table) => {
  // console.log(table);

  let tableHTML = `
    <tr>
        <th>Player Total</th>
        <th colspan="10">Usable Ace</th>
        <th colspan="10">No Usable Ace</th>
    </tr>
    <tr>
        <th></th>
        ${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join("")}
        ${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join("")}
    </tr>
  `;

  for (let i = 12; i <= 21; i++) {
    tableHTML += `
          <tr>
              <td><strong>${i}</strong></td>
              ${Array.from({ length: 20 }, (_, colIndex) => {
                const usableAce = colIndex < 10;
                const playerTotal = i;
                const dealerCard = (colIndex % 10) + 1;
                const state = [playerTotal, dealerCard, usableAce];
                const key = stateValueKey(state);
                const value = stateValues.get(key);
                const [count, total] = value ? value : [0, 0];
                const average = count > 0 ? total / count : 0;
                return `<td style="background-color:${getColorFromValue(
                  average
                )}">${average.toFixed(2)}</td>`;
              }).join("")}
          </tr>
      `;
  }

  table.innerHTML = tableHTML;
};

const writeStateActionValueTable = (data, table) => {
  let tableHTML = `
          <tr>
              <th>Action</th>
              <th>Player Total</th>
              <th colspan="10">Usable Ace</th>
              <th colspan="10">Non-Usable Ace</th>
          </tr>
          <tr>
              <th></th>
              <th></th>
              ${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join(
                ""
              )}
              ${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join(
                ""
              )}
          </tr>
        `;
  for (let i = 0; i < 20; i++) {
    const playerTotal = (i % 10) + 12;
    const action = i < 10 ? "hit" : "stick";
    tableHTML += `
                  <tr>
                      ${
                        i === 0 || i === 10
                          ? `<td rowspan=10>${action}</td>`
                          : ``
                      }
                      <td><strong>${playerTotal}</strong></td>
                      ${Array.from({ length: 20 }, (_, colIndex) => {
                        const usableAce = colIndex < 10;
                        const dealerCard = (colIndex % 10) + 1;

                        const stateAction = [
                          [playerTotal, dealerCard, usableAce],
                          action,
                        ];

                        const key = stateActionValueKey(stateAction);
                        const value = data.get(key);
                        const [count, total] = value ? value : [0, 0];
                        const average = count > 0 ? total / count : 0;
                        return `<td style="background-color:${getColorFromValue(
                          average
                        )}">${average.toFixed(2)}</td>`;
                      }).join("")}
                  </tr>
              `;
  }

  table.innerHTML = tableHTML;
};

const writeStateOptimalActionTable = (data, table) => {
  let tableHTML = `
          <tr>
              <th>Player Total</th>
              <th colspan="10">Usable Ace</th>
              <th colspan="10">Non-Usable Ace</th>
          </tr>
          <tr>
              <th></th>
              ${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join(
                ""
              )}
              ${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join(
                ""
              )}
          </tr>
        `;

  for (let i = 12; i <= 21; i++) {
    tableHTML += `
            <tr>
                <td><strong>${i}</strong></td>
                ${Array.from({ length: 20 }, (_, colIndex) => {
                  const usableAce = colIndex < 10;
                  const playerTotal = i;
                  const dealerCard = (colIndex % 10) + 1;
                  const state = [playerTotal, dealerCard, usableAce];
                  const key = stateValueKey(state);
                  const value = data.get(key);
                  switch (value) {
                    case "hit":
                      return `<td style="background-color:rgb(255, 182, 193)">H</td>`;
                    case "stick":
                      return `<td style="background-color:rgb(173, 216, 230)">S</td>`;
                    case undefined:
                      return "<td>-</td>";
                  }
                }).join("")}
            </tr>
        `;
  }

  table.innerHTML = tableHTML;
};

let running = false;
let iterRunning = false;
let playerHitMax = 19;

document.addEventListener("DOMContentLoaded", async () => {
  let stateValues = new Map();
  let iterStateValues = new Map();
  let stateActionValues = new Map();
  const dealerHitMax = 16;

  const policyEvalWorker = new Worker(
    "/blog/rl/blackjackvalue/policyevalworker.js"
  );
  const workerConfig = {
    stateValues,
    numSimulations: 10,
    playerHitMax,
    dealerHitMax,
  };
  const policyIterWorker = new Worker(
    "/blog/rl/blackjackvalue/policyiterworker.js"
  );

  writeTable(stateValues, document.getElementById("table_state_values"));
  writeStateOptimalActionTable(
    iterStateValues,
    document.getElementById("table_state_best_action")
  );
  writeStateActionValueTable(
    stateActionValues,
    document.getElementById("table_state_action_values")
  );

  policyEvalWorker.addEventListener("message", function (e) {
    const { stateValues: _stateValues, numTotalTrials } = e.data;
    stateValues = _stateValues;
    // console.log(stateValues);
    writeTable(stateValues, document.getElementById("table_state_values"));
    document.getElementById("span_total_trials").innerHTML = numTotalTrials;
    if (running) {
      policyEvalWorker.postMessage({
        ...workerConfig,
        stateValues,
        playerHitMax,
      });
    }
  });

  document.getElementById("button_start").addEventListener("click", () => {
    if (!running) {
      running = true;
      policyEvalWorker.postMessage({
        ...workerConfig,
        stateValues,
        playerHitMax,
      });
    }
  });

  document.getElementById("button_stop").addEventListener("click", () => {
    running = false;
  });

  document.getElementById("button_clear").addEventListener("click", () => {
    running = false;
    stateValues = new Map();
    writeTable(stateValues, document.getElementById("table_state_values"));
  });

  Array.from({ length: 9 }, (_, i) => {
    const hitMax = i + 11;
    document
      .getElementById(`button_strat_max_hit_${hitMax}`)
      .addEventListener("click", () => {
        playerHitMax = hitMax;
        document.getElementById("span_strategy_hit_max").innerHTML = hitMax;
      });
  });

  policyIterWorker.addEventListener("message", function (e) {
    const { stateValues: sv, stateActionValues: sav } = e.data;

    iterStateValues = sv;
    stateActionValues = sav;

    writeStateOptimalActionTable(
      sv,
      document.getElementById("table_state_best_action")
    );

    writeStateActionValueTable(
      sav,
      document.getElementById("table_state_action_values")
    );

    if (iterRunning) {
      policyIterWorker.postMessage({
        numTrials: 100000,
        stateValues: iterStateValues,
        stateActionValues,
      });
    }
  });

  document
    .getElementById("button_policy_improvement_start")
    .addEventListener("click", () => {
      if (!iterRunning) {
        iterRunning = true;
        policyIterWorker.postMessage({
          numTrials: 100000,
          stateValues: iterStateValues,
          stateActionValues,
        });
      }
    });

  document
    .getElementById("button_policy_improvement_stop")
    .addEventListener("click", () => {
      iterRunning = false;
    });
});
