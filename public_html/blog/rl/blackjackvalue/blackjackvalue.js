// const stateValueKey = (state) => state.join(",");
// const stateActionValueKey = (state) => state.join(",");

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

const writePolicyEval = (id, stateValues, container) => {
  container.innerHTML = `
    <table id="table_state_values_${id}">
    </table>

     <p>
      Total Trials: <span id="span_total_trials_${id}">0</span>
    </p>
    <p>
      Total Wins: <span id="span_total_wins_${id}">0</span>
    </p>
    <p>
      Total Losses: <span id="span_total_losses_${id}">0</span>
    </p>
    <p>
      Total Draws: <span id="span_total_draws_${id}">0</span>
    </p>
    <p>
      Win Rate: <span id="span_total_win_rate_${id}">0</span>
    </p>
    <p>
      Cumulative Reward: <span id="span_cumulative_reward_${id}">0</span>
    </p>
    `;

  writeTable(stateValues, document.getElementById(`table_state_values_${id}`));
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

const writeBestStateAction = (stateActionValues) => {
  const table = document.getElementById("table_state_best_state_action");

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

                  const hitStateActionValue = stateActionValues.get(
                    stateActionValueKey([state, "hit"])
                  );
                  const stickStateActionValue =
                    stateActionValues.get(
                      stateActionValueKey([state, "stick"])
                    ) || 0;

                  let maxValue = 0;

                  if (hitStateActionValue) {
                    const [count, total] = hitStateActionValue;
                    maxValue = total / count;
                  }

                  if (stickStateActionValue) {
                    const [count, total] = stickStateActionValue;
                    maxValue = Math.max(maxValue, total / count);
                  }

                  return `<td style="background-color:${getColorFromValue(
                    maxValue
                  )}">${maxValue.toFixed(2)}</td>`;
                }).join("")}
            </tr>
        `;
  }

  table.innerHTML = tableHTML;
};

const writeStateOptimalActionTable = (
  stateActions,
  stateActionValues,
  table
) => {
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
                  const value = stateActions.get(key);

                  // const stateActionValue =

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
let runningOptimal = false;
let iterRunning = false;
let playerHitMax = 19;

const handleMaxHitInputChange = (event) => {
  const value = event.target.value;
  playerHitMax = value;
  document.getElementById("span_strategy_hit_max").innerHTML = value;
};

document.addEventListener("DOMContentLoaded", async () => {
  let stateValues = new Map();
  let iterStateValues = new Map();
  let stateValuesEvalOptimal = new Map();
  let stateActionValues = new Map();
  const dealerHitMax = 16;

  const policyEvalWorker = new Worker(
    "/blog/rl/blackjackvalue/policyevalworker.js"
  );
  const policyEvalOptimalWorker = new Worker(
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

  writePolicyEval(
    "policy_eval_hit_19",
    stateValues,
    document.getElementById("policy_eval_hit_19")
  );
  writePolicyEval(
    "policy_eval_optimal",
    stateValues,
    document.getElementById("policy_eval_optimal")
  );
  writeStateOptimalActionTable(
    iterStateValues,
    stateActionValues,
    document.getElementById("table_state_best_action")
  );
  writeStateActionValueTable(
    stateActionValues,
    document.getElementById("table_state_action_values")
  );

  writeBestStateAction(stateActionValues);

  let totalWins = 0;
  let totalLosses = 0;
  let totalDraws = 0;
  let totalTrials = 0;

  const updatePolicyEvalCounters = (
    id,
    totalTrials,
    totalWins,
    totalLosses,
    totalDraws,
    stateValues
  ) => {
    document.getElementById(`span_total_trials_${id}`).innerHTML = totalTrials;
    document.getElementById(`span_total_wins_${id}`).innerHTML = totalWins;
    document.getElementById(`span_total_losses_${id}`).innerHTML = totalLosses;
    document.getElementById(`span_total_draws_${id}`).innerHTML = totalDraws;
    document.getElementById(`span_total_win_rate_${id}`).innerHTML =
      totalTrials > 0 ? ((totalWins / totalTrials) * 100).toFixed(2) : 0;

    // console.log(stateValues.values());

    const cumulativeReward = stateValues
      .values()
      .map(([num, total]) => total / num)
      .reduce((a, b) => a + b, 0);
    document.getElementById(`span_cumulative_reward_${id}`).innerHTML =
      cumulativeReward.toFixed(2);
  };
  policyEvalWorker.addEventListener("message", function (e) {
    const {
      stateValues: _stateValues,
      counters: { wins, losses, draws },
    } = e.data;
    stateValues = _stateValues;
    // console.log(stateValues);

    writePolicyEval(
      "policy_eval_hit_19",
      stateValues,
      document.getElementById("policy_eval_hit_19")
    );

    updatePolicyEvalCounters(
      "policy_eval_hit_19",
      totalTrials,
      totalWins,
      totalLosses,
      totalDraws,
      stateValues
    );

    totalWins += wins;
    totalLosses += losses;
    totalDraws += draws;
    totalTrials += workerConfig.numSimulations;
    if (running) {
      policyEvalWorker.postMessage({
        ...workerConfig,
        stateValues,
        playerHitMax,
      });
    }
  });

  let totalWinsOptimal = 0;
  let totalLossesOptimal = 0;
  let totalDrawsOptimal = 0;
  let totalTrialsOptimal = 0;

  policyEvalOptimalWorker.addEventListener("message", function (e) {
    const {
      stateValues: _stateValues,
      counters: { wins, losses, draws },
    } = e.data;
    stateValuesEvalOptimal = _stateValues;

    writePolicyEval(
      "policy_eval_optimal",
      stateValuesEvalOptimal,
      document.getElementById("policy_eval_optimal")
    );

    updatePolicyEvalCounters(
      "policy_eval_optimal",
      totalTrialsOptimal,
      totalWinsOptimal,
      totalLossesOptimal,
      totalDrawsOptimal,
      stateValuesEvalOptimal
    );
    totalWinsOptimal += wins;
    totalLossesOptimal += losses;
    totalDrawsOptimal += draws;
    totalTrialsOptimal += workerConfig.numSimulations;
    if (runningOptimal) {
      policyEvalOptimalWorker.postMessage({
        ...workerConfig,
        stateValues: stateValuesEvalOptimal,
        stateActionPolicy: iterStateValues,
        playerHitMax,
      });
    }
  });

  document
    .getElementById("button_start_eval_optimal")
    .addEventListener("click", () => {
      if (!runningOptimal) {
        runningOptimal = true;
        policyEvalOptimalWorker.postMessage({
          ...workerConfig,
          stateValues: stateValuesEvalOptimal,
          stateActionPolicy: iterStateValues,
          playerHitMax,
        });
      }
    });

  document
    .getElementById("button_stop_eval_optimal")
    .addEventListener("click", () => {
      runningOptimal = false;
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
    totalDraws = 0;
    totalLosses = 0;
    totalWins = 0;
    totalTrials = 0;
    updatePolicyEvalCounters(
      "policy_eval_hit_19",
      totalTrials,
      totalWins,
      totalLosses,
      totalDraws,
      stateValues
    );
    writeTable(
      stateValues,
      document.getElementById("table_state_values_policy_eval_hit_19")
    );
  });

  // Array.from({ length: 9 }, (_, i) => {
  //   const hitMax = i + 11;
  //   document
  //     .getElementById(`button_strat_max_hit_${hitMax}`)
  //     .addEventListener("click", () => {
  //       playerHitMax = hitMax;
  //       document.getElementById("span_strategy_hit_max").innerHTML = hitMax;
  //     });
  // });

  policyIterWorker.addEventListener("message", function (e) {
    const { stateValues: sv, stateActionValues: sav } = e.data;

    iterStateValues = sv;
    stateActionValues = sav;

    writeStateOptimalActionTable(
      sv,
      sav,
      document.getElementById("table_state_best_action")
    );

    writeStateActionValueTable(
      sav,
      document.getElementById("table_state_action_values")
    );

    writeBestStateAction(sav);

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

  blackjackTest();
});

const blackjackTest = () => {
  const assertEqual = (a, b, description) => {
    if (a === b) {
      console.log(`✅ ${description}`);
    } else {
      console.error(`❌ ${description} (Expected: ${b}, Got: ${a})`);
    }
  };

  // Test handTotal function
  const testHandTotal = () => {
    assertEqual(handTotal([1, 10]), 21, "Hand total with natural blackjack");
    assertEqual(
      handTotal([1, 1, 9]),
      21,
      "Hand total with two aces and a nine"
    );
    assertEqual(handTotal([5, 5, 5]), 15, "Hand total with three fives");
    assertEqual(handTotal([10, 6, 7]), 23, "Hand total with bust");
    assertEqual(handTotal([10, 5, 6]), 21, "Hand total with 10, 5, 6");
    assertEqual(
      handTotal([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      21,
      "Hand total with multiple aces"
    );
  };

  // Test isHandWin function
  const testIsHandWin = () => {
    assertEqual(isHandWin([1, 10]), true, "Natural blackjack is a win");
    assertEqual(isHandWin([10, 5, 6]), true, "Hand totaling 21 is a win");
    assertEqual(isHandWin([10, 5, 5]), false, "Non-21 hand is not a win");
  };

  // Test isHandBust function
  const testIsHandBust = () => {
    assertEqual(isHandBust([10, 6, 7]), true, "Hand total over 21 is a bust");
    assertEqual(
      isHandBust([10, 6, 4]),
      false,
      "Hand total under 21 is not a bust"
    );
    assertEqual(
      isHandBust([10, 10, 2]),
      true,
      "Hand total exactly 22 is a bust"
    );
  };

  // Test hasUsableAce function
  const testHasUsableAce = () => {
    assertEqual(hasUsableAce([1, 9]), true, "Hand with usable ace");
    assertEqual(hasUsableAce([1, 10, 5]), false, "Hand with non-usable ace");
    assertEqual(hasUsableAce([2, 3, 4]), false, "Hand without ace");
    assertEqual(
      hasUsableAce([1, 1, 8]),
      true,
      "Hand with two aces, one usable"
    );
  };

  // Test rewardAfterDealer function
  const testRewardAfterDealer = () => {
    assertEqual(
      rewardAfterDealer([10, 7], [10, 6, 10]),
      1,
      "Dealer busts, player wins"
    );
    assertEqual(rewardAfterDealer([10, 7], [10, 7]), 0, "Tie game");
    assertEqual(rewardAfterDealer([10, 6], [10, 7]), -1, "Dealer wins");
    assertEqual(
      rewardAfterDealer([10, 10], [10, 9]),
      1,
      "Player wins with higher total"
    );
  };

  // Run all tests
  console.log("Running Blackjack Tests...");
  testHandTotal();
  testIsHandWin();
  testIsHandBust();
  testHasUsableAce();
  testRewardAfterDealer();
  console.log("Tests completed.");
};
