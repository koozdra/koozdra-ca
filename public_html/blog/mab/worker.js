self.addEventListener("message", function (e) {
  runSimulation(e.data);
});

const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

function selectVariantEGreedy(model) {
  return randomElement(model);
}

function runSimulation({ variantProbabilities, horizon }) {
  const model = variantProbabilities.map((variantProbability, index) => ({
    id: index,
    probability: variantProbability,
    pulls: 0,
    rewards: 0,
  }));
  const windowChunkSize = 10;
  const windowDistributions = Array.from({ length: 4 }, () => []);

  const selections = new Array(horizon);
  const occurrence = new Array(4).fill(0);
  let occurrenceCount = 0;

  for (let iteration = 0; iteration < horizon; iteration++) {
    const selectedVariant = selectVariantEGreedy(model);

    const selectedId = selectedVariant.id;
    selections[iteration] = selectedId;
    model[selectedId].pulls += 1;
    if (Math.random() < selectedVariant.probability) {
      model[selectedId].rewards += 1;
    }

    occurrence[selectedId] += 1;
    occurrenceCount += 1;

    occurrence
      .map((d) => Math.round((d / occurrenceCount) * 100))
      .forEach((d, index) => {
        windowDistributions[index].push(d);
      });
  }

  self.postMessage({
    windowDistributions,
    occurrence,
  });
}
