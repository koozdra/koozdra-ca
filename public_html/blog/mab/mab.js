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

const variantProbabilities = [0.1, 0.3, 0.7, 0.9];
const horizon = 1000;
const variantsSchedule = [[horizon, variantProbabilities]];
const startingDollars = 1000;
const selectionStrategies = ["random", "e_greedy", "ucb"];

const getContext = (elementId) =>
  document.getElementById(elementId).getContext("2d");

const runSimulation = async (config) =>
  new Promise((resolve) => {
    const worker = new Worker("/blog/lib/mab/worker.js");
    worker.postMessage(config);

    worker.addEventListener("message", function (e) {
      worker.terminate();
      resolve(e.data);
    });
  });

const windowSmooth = (windowSize, arr) => {
  let sum = 0;

  return arr.map((value, index) => {
    sum += value;

    if (index >= windowSize) {
      sum -= arr[index - windowSize];
    }

    const currentWindowSize = Math.min(index + 1, windowSize);
    return sum / currentWindowSize;
  });
};

const scanAverage = (arr) => {
  let sum = 0;
  return arr.map((value, index) => {
    sum += value;
    return sum / (index + 1);
  });
};

const setupCharts = async (
  selectionStrategy,
  useOverTimeCanvasId,
  pieCanvasId,
  totalElementId,
  conversionChart,
  selectionStrategyIndex
) => {
  const timeChart = new Chart(getContext(useOverTimeCanvasId), {
    type: "line",
    data: {
      labels: Array.from({ length: horizon }, (_, i) => i + 1),
      datasets: variantProbabilities.map((prob, index) => ({
        label: `V${index} (${prob})`,
        data: [],
        backgroundColor: `rgba(${colors[index % colors.length]}, 0.5)`,
        borderColor: `rgba(${colors[index % colors.length]}, 1)`,
        fill: true,
        lineTension: 0,
      })),
    },
    options: {
      animation: false,
      plugins: {
        tooltip: {
          mode: "index",
          intersect: false,
        },
      },
      scales: {
        x: {
          stacked: true,
        },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 100,
        },
      },
    },
  });

  const pieChart = new Chart(getContext(pieCanvasId), {
    type: "pie",
    data: {
      labels: variantProbabilities.map((prob, index) => `V${index} (${prob})`),
      datasets: [
        {
          data: [],
          backgroundColor: variantProbabilities.map(
            (_, index) => `rgba(${colors[index % colors.length]}, 0.5)`
          ),
          borderColor: variantProbabilities.map(
            (_, index) => `rgba(${colors[index % colors.length]}, 1)`
          ),
          borderWidth: 1,
        },
      ],
    },
    options: {
      animation: false,
    },
  });

  const { distributions, occurrence, currentDollars, conversions } =
    await runSimulation({
      variantsSchedule,
      maxNumVariants: variantProbabilities.length,
      horizon,
      startingDollars,
      selectionStrategy,
    });

  distributions.forEach((series, index) => {
    timeChart.config.data.datasets[index].data = series;
  });

  pieChart.config.data.datasets[0].data = occurrence;

  conversions.forEach((series, index) => {
    const insertionIndex =
      selectionStrategyIndex * selectionStrategies.length +
      index +
      selectionStrategyIndex;
    conversionChart.config.data.datasets[insertionIndex].data = series;
  });

  timeChart.update();
  pieChart.update();
  conversionChart.update();

  document.getElementById(totalElementId).innerHTML = currentDollars;
};

const generateSimulationAverages = async () => {
  const numTrials = 100;
  const simulationAverageChart = new Chart(getContext("simulation_averages"), {
    type: "line",
    data: {
      labels: Array.from({ length: numTrials }, (_, i) => i + 1),
      datasets: [
        ...["Random", "E-Greedy", "UCB"].map((label, index) => ({
          label,
          data: [],
          borderColor: `rgba(${colors[index % colors.length]}, 1)`,
        })),
        ...["Random max", "E-Greedy max", "UCB max"].map((label, index) => ({
          label,
          data: [],
          borderColor: `rgba(${colors[index % colors.length]}, 1)`,
        })),
        ...["Random min", "E-Greedy min", "UCB min"].map((label, index) => ({
          label,
          data: [],
          borderColor: `rgba(${colors[index % colors.length]}, 1)`,
        })),
      ],
    },
    options: {
      animation: false,
    },
  });

  const selectionAverageCharts = selectionStrategies.map(
    (selectionStrategy) =>
      new Chart(getContext(`simulation_average_${selectionStrategy}`), {
        type: "line",
        data: {
          labels: Array.from({ length: horizon }, (_, i) => i + 1),
          datasets: variantProbabilities.map((prob, index) => ({
            label: `V${index} (${prob})`,
            data: Array.from({ length: horizon }, () => 25),
            backgroundColor: `rgba(${colors[index % colors.length]}, 0.5)`,
            borderColor: `rgba(${colors[index % colors.length]}, 1)`,
            fill: true,
          })),
        },
        options: {
          animation: false,
          plugins: {
            tooltip: {
              mode: "index",
              intersect: false,
            },
          },
          scales: {
            x: {
              stacked: true,
            },
            y: {
              stacked: true,
              beginAtZero: true,
              max: 100,
            },
          },
        },
      })
  );

  const conversionAverageChart = new Chart(
    getContext("simulation_average_conversion_rates"),
    {
      type: "line",
      data: {
        labels: Array.from({ length: horizon }, (_, i) => i + 1),
        datasets: [`Random`, `E-Greedy`, `UCB`].flatMap((label, index) =>
          variantProbabilities.map((prob, labelIndex) => ({
            label: `${label} V${index} (${prob})`,
            data: [],
            borderColor: `rgba(${colors[index % colors.length]}, 1)`,
          }))
        ),
      },
      options: {
        animation: false,
      },
    }
  );

  const totals = [];
  const maxes = [];
  const mins = [];

  const selectionsAgg = Array.from({ length: selectionStrategies.length }, () =>
    Array.from({ length: horizon }, () => [
      Array.from({ length: variantProbabilities.length }, () => 0), // counter per variant
      0, // total
    ])
  );

  const selectionsAggSeries = Array.from(
    { length: selectionStrategies.length },
    () =>
      Array.from({ length: variantProbabilities.length }, () =>
        Array.from({ length: horizon })
      )
  );

  const conversionRatesAggSeries = Array.from(
    { length: selectionStrategies.length },
    () =>
      Array.from({ length: variantProbabilities.length }, () =>
        Array.from({ length: horizon }, () => [
          0, // sum
          0, // count
        ])
      )
  );

  const generateDataPoint = async (simulationCounter, max) => {
    const selectionStrategyResults = await Promise.all(
      selectionStrategies.map((selectionStrategy) =>
        runSimulation({
          variantsSchedule,
          maxNumVariants: variantProbabilities.length,
          horizon,
          startingDollars,
          selectionStrategy,
        })
      )
    );

    selectionStrategyResults.forEach(
      ({ currentDollars, selections, conversions }, stratIndex) => {
        totals[stratIndex] = (totals[stratIndex] || 0) + currentDollars;
        maxes[stratIndex] = Math.max(maxes[stratIndex] || 0, currentDollars);
        mins[stratIndex] = Math.min(
          mins[stratIndex] || 10000000,
          currentDollars
        );

        simulationAverageChart.config.data.datasets[stratIndex].data.push(
          totals[stratIndex] / (simulationCounter + 1)
        );
        simulationAverageChart.config.data.datasets[
          stratIndex + selectionStrategies.length
        ].data.push(maxes[stratIndex]);
        simulationAverageChart.config.data.datasets[
          stratIndex + selectionStrategies.length * 2
        ].data.push(mins[stratIndex]);

        selections.forEach((selection, selectionIndex) => {
          selectionsAgg[stratIndex][selectionIndex][0][selection] += 1;
          selectionsAgg[stratIndex][selectionIndex][1] += 1;

          variantProbabilities.forEach((_, variantIndex) => {
            const variantCount =
              selectionsAgg[stratIndex][selectionIndex][0][variantIndex];
            const total = selectionsAgg[stratIndex][selectionIndex][1];

            selectionsAggSeries[stratIndex][variantIndex][selectionIndex] =
              total > 0 ? (variantCount / total) * 100 : 0;
          });
        });

        conversions.forEach((variantSeries, variantIndex) => {
          variantSeries.forEach((value, seriesIndex) => {
            conversionRatesAggSeries[stratIndex][variantIndex][
              seriesIndex
            ][0] += value;
            conversionRatesAggSeries[stratIndex][variantIndex][
              seriesIndex
            ][1] += 1;
          });
        });
      }
    );

    simulationAverageChart.update();

    selectionAverageCharts.forEach((chart, chartIndex) => {
      variantProbabilities.forEach((_, variantIndex) => {
        chart.config.data.datasets[variantIndex].data = scanAverage(
          selectionsAggSeries[chartIndex][variantIndex]
        );
      });
      chart.update();
    });

    conversionRatesAggSeries.forEach((selectionStrategy, strategyIndex) => {
      selectionStrategy.forEach((variantSeries, variantIndex) => {
        const insertionIndex =
          strategyIndex * selectionStrategies.length +
          variantIndex +
          strategyIndex;

        conversionAverageChart.config.data.datasets[insertionIndex].data =
          conversionRatesAggSeries[strategyIndex][variantIndex].map(
            ([sum, count]) => sum / count
          );
      });
    });

    conversionAverageChart.update();

    if (simulationCounter < max) {
      setTimeout(generateDataPoint, 0, simulationCounter + 1, max);
    }
  };

  generateDataPoint(0, numTrials);
};

document.addEventListener("DOMContentLoaded", function () {
  const conversionChart = new Chart(getContext("conversion_over_time"), {
    type: "line",
    data: {
      labels: Array.from({ length: horizon }, (_, i) => i + 1),
      datasets: [`Random`, `E-Greedy`, `UCB`].flatMap((label, index) =>
        variantProbabilities.map((prob, labelIndex) => ({
          label: `${label} V${index} (${prob})`,
          data: [],
          borderColor: `rgba(${colors[index % colors.length]}, 1)`,
        }))
      ),
    },
    options: {
      animation: false,
    },
  });

  selectionStrategies.map((strat, index) => {
    // split up setupCharts into running the simulations and then setting up the charts
    setupCharts(
      strat,
      `decision_distribution_over_time_${strat}`,
      `decision_distribution_${strat}`,
      `total_${strat}`,
      conversionChart,
      index
    );
  });

  generateSimulationAverages();
});
