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
const horizon = 3000;
const variantsSchedule = [[horizon, variantProbabilities]];
const startingDollars = 1000;
const selectionStrategies = ["e_greedy", "ucb"];

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

document.addEventListener("DOMContentLoaded", async () => {
  const numTrials = 200;

  const simulationAverageChart = new Chart(getContext(`regret_over_time`), {
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
  });

  const regretAverages = Array.from(
    { length: selectionStrategies.length },
    () => Array.from({ length: horizon }, () => ({ count: 0, sum: 0 }))
  );

  const runTrial = (counter, maxCounter) => {
    selectionStrategies.forEach(async (selectionStrategy, strategyIndex) => {
      const {
        distributions,
        occurrence,
        windowedDistributions,
        currentDollars,
        conversions,
        cumulativeRegret,
      } = await runSimulation({
        variantsSchedule,
        maxNumVariants: variantProbabilities.length,
        horizon,
        startingDollars,
        selectionStrategy,
      });

      cumulativeRegret.forEach((value, seriesIndex) => {
        const averageContainer = regretAverages[strategyIndex][seriesIndex];
        averageContainer.sum += value;
        averageContainer.count += 1;
      });

      simulationAverageChart.config.data.datasets[strategyIndex].data =
        regretAverages[strategyIndex].map(({ count, sum }) => sum / count);
      simulationAverageChart.update();
    });

    if (counter < maxCounter) {
      setTimeout(runTrial, 0, counter + 1, maxCounter);
    }
  };

  runTrial(0, numTrials);
});
