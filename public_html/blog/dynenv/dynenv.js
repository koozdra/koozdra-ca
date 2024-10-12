const colors = [
  "186, 255, 255", // Pastel Cyan
  "186, 255, 201", // Pastel Green
  "255, 223, 186", // Pastel Orange
  "255, 179, 186", // Pastel Red
  "223, 186, 255", // Pastel Purple
  "223, 255, 255", // Pastel Sky
  "223, 223, 255", // Pastel Lavender
  "255, 255, 186", // Pastel Yellow

  "223, 255, 186", // Pastel Lime
  "255, 223, 255", // Pastel Pink

  "186, 223, 255", // Pastel Blue
  "255, 186, 223", // Pastel Rose
  "223, 255, 223", // Pastel Mint
  "255, 255, 223", // Pastel Cream
  "186, 255, 223", // Pastel Aqua
  "255, 223, 223", // Pastel Peach
  "255, 186, 255", // Pastel Magenta\

  "255, 223, 186", // Pastel Apricot
  "223, 186, 223", // Pastel Mauve
  "186, 223, 186", // Pastel Moss
];

const horizon = 5000;
const variantsSchedule = [
  [horizon / 2, [0.25, 0.4, 0.5, 0.7]],
  [horizon, [0.25, 0.4, 0.5, 0.7, 0.5, 0.6, 0.9]],
];
const maxNumVariants = 7;
const startingDollars = 1000;
const selectionStrategies = ["e_greedy", "ucb"];

const scanAverage = (arr) => {
  let sum = 0;
  return arr.map((value, index) => {
    sum += value;
    return sum / (index + 1);
  });
};

const movingAverage = (n, arr) => {
  let sum = 0;
  const result = [];

  // Pre-calculate the sum of the first window
  for (let i = 0; i < n; i++) {
    sum += arr[i];
  }

  // Use map to iterate over the array starting from the n-th element
  arr.map((value, index) => {
    if (index >= n) {
      // Slide the window: add the current element and remove the element that is sliding out
      sum += value - arr[index - n];
    }

    // Start adding averages to the result once we have the first complete window
    if (index >= n - 1) {
      result.push(sum / n);
    }
  });

  return result;
};

const averageAdjacent = (arr) => {
  const result = [...arr];
  for (let i = 1; i < arr.length - 1; i++) {
    const average = arr[i - 1] + arr[i] + arr[i + 1] / 3;
    result[i - 1] = average;
    result[i] = average;
    result[i + 1] = average;
  }
  return result;
};
const getContext = (elementId) => {
  return document.getElementById(elementId).getContext("2d");
};

const runSimulation = async (config) =>
  new Promise((resolve) => {
    const worker = new Worker("/blog/lib/mab/worker.js");
    worker.postMessage(config);

    worker.addEventListener("message", function (e) {
      worker.terminate();
      resolve(e.data);
    });
  });

const findMaxNumVariants = (variantsSchedule) =>
  Math.max(...variantsSchedule.map((t) => t.at(1)).map((t) => t.length));

const setupCharts = (scenarioIndex, maxNumVariants) => {
  const simulationAverageChart = new Chart(
    getContext(`regret_over_time_${scenarioIndex}`),
    {
      type: "line",
      data: {
        labels: Array.from({ length: horizon }, (_, i) => i + 1),
        datasets: selectionStrategies.map((strat, strategyIndex) => ({
          label: strat,
          data: [],
          borderColor: `rgba(${colors[strategyIndex % colors.length]}, 1)`,
        })),
      },
      options: {
        animation: false,
      },
    }
  );

  const selectionsCharts = selectionStrategies.map(
    (selectionStrategy) =>
      new Chart(
        getContext(`selection_over_time_${selectionStrategy}_${scenarioIndex}`),
        {
          type: "line",
          data: {
            labels: Array.from({ length: horizon }, (_, i) => i + 1),
            datasets: Array.from({ length: maxNumVariants }, (_, index) => ({
              label: `V${index}`,
              data: [],
              backgroundColor: `rgba(${colors[index % colors.length]}, 0.5)`,
              borderColor: `rgba(${colors[index % colors.length]}, 1)`,
              fill: true,
            })),
          },
          options: {
            animation: false,
            scales: {
              x: {
                stacked: true,
              },
              y: {
                stacked: true,
                beginAtZero: true,
                max: 100,
                min: 0,
              },
            },
          },
        }
      )
  );

  return {
    simulationAverageChart,
    selectionsCharts,
  };
};

document.addEventListener("DOMContentLoaded", async () => {
  const numTrials = 300;

  const scenarios = [
    [
      [1000, [0.25, 0.4, 0.5, 0.7]],
      [horizon, [0.7, 0.5, 0.4, 0.25]],
    ],
    [
      [1000, [0.25, 0.4, 0.5, 0.7]],
      [horizon, [0.25, 0.4, 0.5, 0.7, 0.4, 0.4, 0.9]],
    ],
    [
      [1000, [0.25, 0.4, 0.5, 0.7]],
      [horizon, [0.25, 0.4, 0.5, 0.7, 0.3, 0.3, 0.2]],
    ],
    [
      [1000, [0.25, 0.4, 0.5, 0.7]],
      [horizon, [0.25, 0.4, 0.5, 0.7, 0.6, 0.6, 0.6]],
    ],
  ];

  scenarios.forEach((variantsSchedule, scenarioIndex) => {
    const maxNumVariants = findMaxNumVariants(variantsSchedule);
    const { simulationAverageChart, selectionsCharts } = setupCharts(
      scenarioIndex,
      maxNumVariants
    );

    const regretAverages = Array.from(
      { length: selectionStrategies.length },
      () => Array.from({ length: horizon }, () => ({ count: 0, sum: 0 }))
    );

    const selectionsAggSeries = Array.from(
      { length: selectionStrategies.length },
      () =>
        Array.from({ length: horizon }, () => ({
          timesSelected: Array.from({ length: maxNumVariants }, () => 0),
          total: 0,
        }))
    );
    const selectionsAggChartSeries = Array.from(
      { length: selectionStrategies.length },
      () =>
        Array.from({ length: maxNumVariants }, () =>
          Array.from({ length: horizon })
        )
    );

    const runTrial = (counter, maxCounter) => {
      selectionStrategies.forEach(async (selectionStrategy, strategyIndex) => {
        const { selections, cumulativeRegret } = await runSimulation({
          variantsSchedule,
          maxNumVariants,
          horizon,
          startingDollars,
          selectionStrategy,
        });

        selections.forEach((value, seriesIndex) => {
          const averageContainer =
            selectionsAggSeries[strategyIndex][seriesIndex];
          averageContainer.timesSelected[value] += 1;
          averageContainer.total += 1;

          Array.from({ length: maxNumVariants }).forEach((_, variantIndex) => {
            selectionsAggChartSeries[strategyIndex][variantIndex][seriesIndex] =
              (averageContainer.timesSelected[variantIndex] /
                averageContainer.total) *
              100;
          });
        });

        cumulativeRegret.forEach((value, seriesIndex) => {
          const averageContainer = regretAverages[strategyIndex][seriesIndex];
          averageContainer.sum += value;
          averageContainer.count += 1;
        });

        if (counter % 100 === 0) {
          simulationAverageChart.config.data.datasets[strategyIndex].data =
            regretAverages[strategyIndex].map(({ count, sum }) => sum / count);

          const selectionStrategyChart = selectionsCharts[strategyIndex];
          Array.from({ length: maxNumVariants }).forEach((_, variantIndex) => {
            selectionStrategyChart.config.data.datasets[variantIndex].data =
              movingAverage(
                10,
                selectionsAggChartSeries[strategyIndex][variantIndex]
              );
          });

          simulationAverageChart.update();
          selectionStrategyChart.update();
        }
      });

      if (counter < maxCounter) {
        setTimeout(runTrial, 0, counter + 1, maxCounter);
      }
    };

    runTrial(0, numTrials);
  });
});
