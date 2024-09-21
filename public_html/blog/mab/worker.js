self.addEventListener("message", function (e) {
  if (e.data === "start") {
    runSimulation();
  }
});

const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

function selectVariantEGreedy(model) {
  return randomElement(model);
}

function testVariant(variant) {}

function runSimulation() {
  const variantProbabilities = [0.6, 0.7, 0.8, 0.9];
  const horizon = 10;
  const model = variantProbabilities.map((variantProbability, index) => ({
    id: index,
    probability: variantProbability,
    pulls: 0,
    rewards: 0,
  }));

  console.log(model);

  const selections = new Array(horizon);

  for (let iteration = 0; iteration < horizon; iteration++) {
    const selectedVariant = selectVariantEGreedy(model);
    selections[iteration] = selectedVariant.id;
    model[selectedVariant.id].pulls += 1;
    if (Math.random() < selectedVariant.probability) {
      model[selectedVariant.id].rewards += 1;
    }
  }

  console.log(selections, model);
  // Send the new data back to the main thread
  // self.postMessage({
  //   rightDecisions: newRightDecisions,
  // });
}
