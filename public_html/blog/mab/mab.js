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

const getContext = (elementId) =>
  document.getElementById(elementId).getContext("2d");

const setupCharts = (
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

  const worker = new Worker("worker.js");

  worker.postMessage({
    variantProbabilities,
    horizon,
    startingDollars,
    selectionStrategy,
  });

  worker.addEventListener("message", function (e) {
    const { windowDistributions, occurrence, currentDollars } = e.data;
    windowDistributions.forEach((series, index) => {
      timeChart.config.data.datasets[index].data = series;
    });
    console.log(occurrence);
    pieChart.config.data.datasets[0].data = occurrence;

    timeChart.update();
    pieChart.update();

    // const bestVariant

    document.getElementById(totalElementId).innerHTML = currentDollars;
  });
};

document.addEventListener("DOMContentLoaded", function () {
  setupCharts(
    "random",
    "decision_distribution_over_time_random",
    "decision_distribution_random",
    "total_random"
  );

  setupCharts(
    "e_greedy",
    "decision_distribution_over_time_e_greedy",
    "decision_distribution_e_greedy",
    "total_e_greedy"
  );

  setupCharts(
    "ucb",
    "decision_distribution_over_time_ucb",
    "decision_distribution_ucb",
    "total_ucb"
  );
});
