self.addEventListener("message", function (e) {
  runSimulation(e.data);
});

const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const maxBy = (items, compareMapper) =>
  items.reduce(
    (max, item) => (compareMapper(item) > compareMapper(max) ? item : max),
    items[0]
  );

const eGreedySelectionStrategy = (model) => {
  const unvisitedVariant = model.find(({ pulls }) => pulls === 0);
  if (unvisitedVariant) return unvisitedVariant;

  const isExplore = Math.random() < 0.1;
  return isExplore
    ? randomElement(model)
    : maxBy(model, ({ pulls, rewards }) => rewards / pulls);
};

const ucbSelectionStrategy = (model) => {
  const unvisitedVariant = model.find(({ pulls }) => pulls === 0);
  if (unvisitedVariant) return unvisitedVariant;

  const totalPulls = model
    .map(({ pulls }) => pulls)
    .reduce((sum, num) => sum + num, 0);

  return maxBy(
    model,
    ({ pulls, rewards }) =>
      // expected value + ucb boost
      rewards / pulls + Math.sqrt((2 * Math.log(totalPulls)) / pulls)
  );
};

const selectionStrategies = {
  random: randomElement,
  e_greedy: eGreedySelectionStrategy,
  ucb: ucbSelectionStrategy,
};

const scanSum = (arr) => {
  let sum = 0;
  return arr.map((value, index) => {
    sum += value;
    return sum;
  });
};

function runSimulation({
  variantProbabilities,
  horizon,
  selectionStrategy,
  startingDollars,
}) {
  const numVariants = variantProbabilities.length;
  const model = variantProbabilities.map((variantProbability, index) => ({
    id: index,
    probability: variantProbability,
    pulls: 0,
    rewards: 0,
  }));
  const distributions = Array.from({ length: numVariants }, () =>
    Array.from({ length: horizon })
  );
  const windowedDistributions = Array.from({ length: numVariants }, () =>
    Array.from({ length: horizon })
  );

  const selections = new Array(horizon);
  const occurrence = new Array(4).fill(0);
  let occurrenceCount = 0;

  const windowSize = 300;
  const windowedOccurrence = new Array(4).fill(0);
  let windowedOccurrenceCount = 0;

  let currentDollars = startingDollars;

  const conversions = Array.from({ length: numVariants }, () =>
    Array.from({ length: horizon })
  );

  const bestVariantProbability = Math.max(...variantProbabilities);

  const regret = Array.from({ length: horizon });

  for (let iteration = 0; iteration < horizon; iteration++) {
    const selectedVariant = selectionStrategies[selectionStrategy](model);

    currentDollars -= 1;

    const selectedId = selectedVariant.id;
    selections[iteration] = selectedId;
    model[selectedId].pulls += 1;
    if (Math.random() < selectedVariant.probability) {
      model[selectedId].rewards += 1;

      currentDollars += 2;
    }

    regret[iteration] = bestVariantProbability - selectedVariant.probability;

    occurrence[selectedId] += 1;
    occurrenceCount += 1;

    windowedOccurrence[selectedId] += 1;
    if (windowedOccurrenceCount < windowSize) {
      windowedOccurrenceCount += 1;
    } else {
      windowedOccurrence[selections[iteration - windowSize]] -= 1;
    }

    // console.log(windowedOccurrenceCount);

    windowedOccurrence
      .map((d) => Math.round((d / windowedOccurrenceCount) * 100))
      .forEach((d, index) => {
        windowedDistributions[index][iteration] = d;
      });

    occurrence
      .map((d) => Math.round((d / occurrenceCount) * 100))
      .forEach((d, index) => {
        distributions[index][iteration] = d;

        const { pulls, rewards } = model.at(index);
        conversions[index][iteration] = pulls > 0 ? rewards / pulls : 0;
      });
  }

  // console.log(conversions);

  self.postMessage({
    selections,
    distributions,
    occurrence,
    windowedDistributions,
    conversions,
    currentDollars,
    cumulativeRegret: scanSum(regret),
  });
}
