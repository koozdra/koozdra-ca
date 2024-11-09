const colors = [
  "255, 179, 186", // Pastel Red
  "186, 255, 255", // Pastel Cyan
  "186, 255, 201", // Pastel Green
  "255, 186, 255", // Pastel Magenta
  "255, 255, 186", // Pastel Yellow
  "223, 223, 255", // Pastel Lavender
  "223, 255, 186", // Pastel Lime
  "255, 223, 255", // Pastel Pink
  "255, 223, 186", // Pastel Orange
  "186, 223, 255", // Pastel Blue
  "255, 186, 223", // Pastel Rose
  "223, 255, 223", // Pastel Mint
  "255, 255, 223", // Pastel Cream
  "223, 186, 255", // Pastel Purple
  "186, 255, 223", // Pastel Aqua
  "255, 223, 223", // Pastel Peach
  "223, 255, 255", // Pastel Sky
  "255, 223, 186", // Pastel Apricot
  "223, 186, 223", // Pastel Mauve
  "186, 223, 186", // Pastel Moss
];

// Array.from({length: 26}, (v, i) => [(Math.random() * (0.9 - 0.5) + 0.5).toFixed(2), (Math.random() * (0.9 - 0.5) + 0.5).toFixed(2), (Math.random() * (0.9 - 0.5) + 0.5).toFixed(2), (Math.random() * (0.9 - 0.5) + 0.5).toFixed(2)])
const conversions = [
  ["0.69", "0.69", "0.53", "0.53"],
  ["0.61", "0.73", "0.66", "0.53"],
  ["0.72", "0.60", "0.68", "0.75"],
  ["0.70", "0.82", "0.82", "0.63"],
  ["0.57", "0.84", "0.52", "0.79"],
  ["0.70", "0.52", "0.75", "0.77"],
  ["0.51", "0.82", "0.61", "0.62"],
  ["0.74", "0.74", "0.80", "0.55"],
  ["0.82", "0.63", "0.61", "0.63"],
  ["0.72", "0.68", "0.90", "0.80"],
  ["0.66", "0.73", "0.69", "0.70"],
  ["0.82", "0.70", "0.78", "0.82"],
  ["0.53", "0.66", "0.60", "0.72"],
  ["0.81", "0.84", "0.78", "0.73"],
  ["0.87", "0.51", "0.56", "0.82"],
  ["0.55", "0.62", "0.70", "0.83"],
  ["0.71", "0.51", "0.53", "0.61"],
  ["0.75", "0.58", "0.90", "0.71"],
  ["0.52", "0.54", "0.56", "0.53"],
  ["0.77", "0.55", "0.78", "0.60"],
  ["0.62", "0.82", "0.88", "0.53"],
  ["0.74", "0.89", "0.68", "0.88"],
  ["0.69", "0.57", "0.76", "0.87"],
  ["0.60", "0.69", "0.57", "0.61"],
  ["0.61", "0.55", "0.78", "0.84"],
  ["0.83", "0.61", "0.51", "0.79"],
];

const provinces = [
  "AB", // Alberta
  "BC", // British Columbia
  "MB", // Manitoba
  "NB", // New Brunswick
  "NL", // Newfoundland and Labrador
  "NS", // Nova Scotia
  "NT", // Northwest Territories
  "NU", // Nunavut
  "ON", // Ontario
  "PE", // Prince Edward Island
  "QC", // Quebec
  "SK", // Saskatchewan
  "YT", // Yukon
];

const regions = ["rural", "urban"];

const numVariants = 4;

const getContext = (elementId) => {
  return document.getElementById(elementId).getContext("2d");
};

const zipAllWith = (arrays) => {
  const length = arrays[0].length;

  // Create the result array
  const result = [];

  for (let i = 0; i < length; i++) {
    // Collect elements from each array at the current index i
    const zipGroup = arrays.map((arr) => arr[i]);
    result.push(zipGroup);
  }

  return result;
};

const runSimulation = async (config) =>
  new Promise((resolve) => {
    const worker = new Worker("/blog/lib/mab/worker2.js");
    worker.postMessage(config);

    worker.addEventListener("message", function (e) {
      worker.terminate();
      resolve(e.data);
    });
  });

const cumulativeSum = (arr) => {
  const result = [];
  let total = 0;

  arr.forEach((value, i) => {
    total += value;

    result[i] = total;
  });

  return result;
};

function getColor(value) {
  // Convert string to number
  const num = parseFloat(value);

  // Normalize the value between 0 and 1 based on range 0.6 to 0.9
  const normalized = (num - 0.5) / (0.9 - 0.5);

  // Create a light blue to dark blue gradient
  // Light blue RGB: 173, 216, 230
  // Dark blue RGB: 0, 0, 139

  const red = Math.round(173 * (1 - normalized));
  const green = Math.round(216 * (1 - normalized));
  const blue = Math.round(230 - (230 - 139) * normalized);

  return `rgb(${red}, ${green}, ${blue})`;
}

function createTable(divId, data) {
  const table = document.createElement("table");

  data.forEach((row) => {
    const tr = document.createElement("tr");

    row.forEach((cell, cellIndex) => {
      const td = document.createElement("td");
      td.textContent = cell;
      if (cellIndex > 0) {
        td.style.backgroundColor = getColor(cell);

        // Set text color based on background brightness
        const value = parseFloat(cell);
        td.style.color = value < 0.75 ? "black" : "white";
      }

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });

  document.getElementById(divId).appendChild(table);
}

const contextDescription = (index) => {
  const provinceIndex = Math.floor(index / regions.length);
  const regionIndex = index % regions.length;
  return `${provinces[provinceIndex]} - ${regions[regionIndex]}`;
};

const findBestAverageConversions = (conversions) =>
  conversions
    .map((conversion) => Math.max(...conversion.map((a) => parseFloat(a))))
    .reduce((sum, num) => sum + parseFloat(num), 0) / conversions.length;

document.addEventListener("DOMContentLoaded", async () => {
  const numTrials = 10; // todo add average charts
  const horizon = 10000;
  const numVariants = 4;
  const selectionStrategies = ["e_greedy", "ucb"];

  const conversionAverages = zipAllWith(conversions)
    .map((variantConversions) =>
      variantConversions.reduce((sum, num) => sum + parseFloat(num), 0)
    )
    .map((total) => (total / conversions.length).toFixed(2));

  const bestAverageConversion = findBestAverageConversions(conversions);

  console.log(`best average conversion: ${bestAverageConversion}`);

  for (let i = 0; i < numVariants; i++) {
    const variantRemovedConversions = conversions.map((conversion) => {
      const a = [...conversion];
      a[i] = 0;
      return a;
    });

    const t = findBestAverageConversions(variantRemovedConversions);
    console.log(`V${i}: ${t.toFixed(2)}`);
  }

  for (let i = 0; i < numVariants - 1; i++) {
    for (let j = i + 1; j < numVariants; j++) {
      const variantRemovedConversions = conversions.map((conversion) => {
        const a = [...conversion];
        a[i] = 0;
        a[j] = 0;
        return a;
      });

      const t = findBestAverageConversions(variantRemovedConversions);
      console.log(`V${i} V${j}: ${t.toFixed(2)}`);
    }
  }

  for (let i = 0; i < numVariants; i++) {
    const q = conversions
      .map((conversion) => {
        const a = [...conversion.map(parseFloat)];
        a[i] = 0;
        return Math.max(parseFloat(conversion[i]) - Math.max(...a), 0);
      })
      .reduce((sum, num) => sum + num, 0);

    console.log(`V${i}: ${q.toFixed(2)}`);
  }

  createTable(
    "variantTableContainer",
    conversions.map((conversion, conversionIndex) => [
      contextDescription(conversionIndex),
      ...conversion,
    ])
  );

  createTable("variantAveragesTableContainer", [
    ["National", ...conversionAverages],
  ]);

  const nationalResults = await Promise.all(
    selectionStrategies.map((selectionStrategy) =>
      runSimulation({
        numVariants,
        horizon,
        selectionStrategy,
        aggregationLevel: "national",
        environment: { conversions, provinces, regions },
      })
    )
  );

  nationalResults.forEach((result, selectionStrategyIndex) => {
    const selectionStrategy = selectionStrategies[selectionStrategyIndex];
    const conversionOverTimeChart = new Chart(
      getContext(`conversions_over_time_${selectionStrategy}`),
      {
        type: "line",
        data: {
          labels: Array.from({ length: horizon }, (_, i) => i + 1),
          datasets: Array.from({ length: numVariants }, (_, variantIndex) => ({
            label: `V${variantIndex} (${conversionAverages[variantIndex]})`,
            data: [],
            borderColor: `rgba(${colors[variantIndex % colors.length]}, 1)`,
          })),
        },
        options: {
          animation: false,
        },
      }
    );

    Array.from({ length: numVariants }, (_, variantIndex) => {
      conversionOverTimeChart.config.data.datasets[variantIndex].data =
        result.variantConversionSeries[variantIndex];
    });

    conversionOverTimeChart.update();
  });

  const contextualResults = await Promise.all(
    selectionStrategies.map((selectionStrategy) =>
      runSimulation({
        numVariants,
        horizon,
        selectionStrategy,
        aggregationLevel: "context",
        environment: { conversions, provinces, regions },
      })
    )
  );

  const actualConversionRate = contextualResults[0].totalReward / horizon;

  console.log("actual conversion rate: " + actualConversionRate);

  const cumulativeRegret = new Chart(getContext(`cumulative_regret`), {
    type: "line",
    data: {
      labels: Array.from({ length: horizon }, (_, i) => i + 1),
      datasets: [
        {
          label: "National e-greedy",
          data: cumulativeSum(nationalResults[0].regretSeries),
          borderColor: `rgba(${colors[0]}, 1)`,
        },
        {
          label: "Contextual e-greedy",
          data: cumulativeSum(contextualResults[0].regretSeries),
          borderColor: `rgba(${colors[1]}, 1)`,
        },
        {
          label: "National UCB",
          data: cumulativeSum(nationalResults[1].regretSeries),
          borderColor: `rgba(${colors[2]}, 1)`,
        },
        {
          label: "Contextual UCB",
          data: cumulativeSum(contextualResults[1].regretSeries),
          borderColor: `rgba(${colors[3]}, 1)`,
        },
      ],
    },
    options: {
      animation: false,
    },
  });

  const cumulativeReward = new Chart(getContext(`cumulative_reward`), {
    type: "line",
    data: {
      labels: Array.from({ length: horizon }, (_, i) => i + 1),
      datasets: [
        {
          label: "National e-greedy",
          data: cumulativeSum(nationalResults[0].rewardSeries),
          borderColor: `rgba(${colors[0]}, 1)`,
        },
        {
          label: "Contextual e-greedy",
          data: cumulativeSum(contextualResults[0].rewardSeries),
          borderColor: `rgba(${colors[1]}, 1)`,
        },
        {
          label: "National UCB",
          data: cumulativeSum(nationalResults[1].rewardSeries),
          borderColor: `rgba(${colors[2]}, 1)`,
        },
        {
          label: "Contextual UCB",
          data: cumulativeSum(contextualResults[1].rewardSeries),
          borderColor: `rgba(${colors[3]}, 1)`,
        },
      ],
    },
    options: {
      animation: false,
    },
  });

  const conversionsChart = new Chart(getContext(`conversions`), {
    type: "line",
    data: {
      labels: Array.from({ length: horizon }, (_, i) => i + 1),
      datasets: [
        {
          label: "Best (0.79)",
          data: Array.from({ length: horizon }, () => 0.79),
          borderColor: `rgba(${colors[0]}, 1)`,
        },
        {
          label: "National Best (0.70)",
          data: Array.from({ length: horizon }, () => 0.7),
          borderColor: `rgba(${colors[1]}, 1)`,
        },
        {
          label: "National E-greedy",
          data: nationalResults[0].conversionSeries,
          borderColor: `rgba(${colors[2]}, 1)`,
        },
        {
          label: "National UCB",
          data: nationalResults[1].conversionSeries,
          borderColor: `rgba(${colors[3]}, 1)`,
        },
        {
          label: "Contextual E-greedy",
          data: contextualResults[0].conversionSeries,
          borderColor: `rgba(${colors[4]}, 1)`,
        },
        {
          label: "Contextual UCB",
          data: contextualResults[1].conversionSeries,
          borderColor: `rgba(${colors[5]}, 1)`,
        },
      ],
    },
    options: {
      animation: false,
      scales: {
        y: {
          min: 0.65,
          max: 0.82,
        },
      },
    },
  });
});
