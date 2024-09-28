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
const startingDollars = 1000;
const selectionStrategies = ["random", "e_greedy", "ucb"];

const getContext = (elementId) =>
  document.getElementById(elementId).getContext("2d");

const runSimulation = async (config) =>
  new Promise((resolve) => {
    const worker = new Worker("worker.js");
    worker.postMessage(config);

    worker.addEventListener("message", function (e) {
      worker.terminate();
      resolve(e.data);
    });
  });

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
      labels: Array.from({ length: 1000 }, (_, i) => i + 1),
      datasets: variantProbabilities.map((prob, index) => ({
        label: `V${index} (${prob})`,
        data: [],
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
      variantProbabilities,
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

const generateSimulationAverages = async (button) => {
  if (button) button.blur();
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

  const totals = [];
  const maxes = [];
  const mins = [];

  const generateDataPoint = async (counter, max) => {
    const results = await Promise.all(
      selectionStrategies.map((selectionStrategy) =>
        runSimulation({
          variantProbabilities,
          horizon,
          startingDollars,
          selectionStrategy,
        })
      )
    );

    results.map(({ currentDollars }, index) => {
      totals[index] = (totals[index] || 0) + currentDollars;
      maxes[index] = Math.max(maxes[index] || 0, currentDollars);
      mins[index] = Math.min(mins[index] || 10000000, currentDollars);

      simulationAverageChart.config.data.datasets[index].data.push(
        totals[index] / (counter + 1)
      );

      simulationAverageChart.config.data.datasets[
        index + selectionStrategies.length
      ].data.push(maxes[index]);

      simulationAverageChart.config.data.datasets[
        index + selectionStrategies.length * 2
      ].data.push(mins[index]);
    });

    simulationAverageChart.update();

    if (counter < max) {
      setTimeout(generateDataPoint, 0, counter + 1, max);
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
