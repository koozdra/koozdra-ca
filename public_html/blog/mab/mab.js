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

const getContext = (elementId) =>
  document.getElementById(elementId).getContext("2d");

document.addEventListener("DOMContentLoaded", function () {
  const variantProbabilities = [0.6, 0.7, 0.8, 0.9];
  const horizon = 1000;

  const timeChart = new Chart(getContext("decision_distribution_over_time"), {
    type: "line", // Specify the type of chart
    data: {
      labels: Array.from({ length: 1000 }, (_, i) => i + 1), // X-axis labels
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

  const pieChart = new Chart(getContext("decision_distribution"), {
    type: "pie",
    data: {
      labels: variantProbabilities.map((prob, index) => `V${index} (${prob})`),
      datasets: [
        {
          data: [10, 20, 30, 40],
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

  const worker = new Worker("worker.js");

  worker.postMessage({ variantProbabilities, horizon });

  worker.addEventListener("message", function (e) {
    const { windowDistributions, occurrence } = e.data;
    windowDistributions.forEach((series, index) => {
      timeChart.config.data.datasets[index].data = series;
    });
    console.log(occurrence);
    pieChart.config.data.datasets[0].data = occurrence;

    timeChart.update();
    pieChart.update();
  });
});
