const colors = [
  "255, 179, 186", // Pastel Red
  "186, 255, 255", // Pastel Cyan
  "223, 255, 186", // Pastel Lime
  "255, 186, 255", // Pastel Magenta
  "255, 223, 186", // Pastel Orange
  "255, 255, 186", // Pastel Yellow
  "186, 255, 201", // Pastel Green
  "186, 225, 255", // Pastel Blue
  "255, 223, 255", // Pastel Pink
  "223, 223, 255", // Pastel Lavender
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
  totalElementId
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
      responsive: false,
    },
  });

  const { windowDistributions, occurrence, currentDollars } =
    await runSimulation({
      variantProbabilities,
      horizon,
      startingDollars,
      selectionStrategy,
    });

  windowDistributions.forEach((series, index) => {
    timeChart.config.data.datasets[index].data = series;
  });
  pieChart.config.data.datasets[0].data = occurrence;

  timeChart.update();
  pieChart.update();

  document.getElementById(totalElementId).innerHTML = currentDollars;
};

document.addEventListener("DOMContentLoaded", function () {
  selectionStrategies.map((strat) => {
    setupCharts(
      strat,
      `decision_distribution_over_time_${strat}`,
      `decision_distribution_${strat}`,
      `total_${strat}`
    );
  });

  clickGenerateSimulationAverages();
});

const clickGenerateSimulationAverages = async (button) => {
  if (button) button.blur();
  const numTrials = 100;
  const simulationAverageChart = new Chart(getContext("simulation_averages"), {
    type: "line",
    data: {
      labels: Array.from({ length: numTrials }, (_, i) => i + 1),
      datasets: ["Random", "E-Greedy", "UCB"].map((label, index) => ({
        label,
        data: [],
        borderColor: `rgba(${colors[index % colors.length]}, 1)`,
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
    },
  });

  const totals = [];

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
      simulationAverageChart.config.data.datasets[index].data.push(
        totals[index] / (counter + 1)
      );
    });

    simulationAverageChart.update();

    if (counter < max) {
      setTimeout(generateDataPoint, 0, counter + 1, max);
    }
  };

  generateDataPoint(0, numTrials);
};
