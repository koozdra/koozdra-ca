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

// variantsSchedule example: [sectionMax, variants][]
// [
//   [500, [0.25, 0.4, 0.5, 0.7]],
//   [1000, [0.25, 0.4, 0.5, 0.7, 0.5, 0.6, 0.9]],
// ], maxNumVariants: 7
function runSimulation({
  variantsSchedule,
  maxNumVariants,
  horizon,
  selectionStrategy,
  startingDollars,
}) {
  const model = Array.from({ length: maxNumVariants }, (_, index) => ({
    id: index,
    pulls: 0,
    rewards: 0,
  }));

  const distributions = Array.from({ length: maxNumVariants }, () =>
    Array.from({ length: horizon })
  );
  const windowedDistributions = Array.from({ length: maxNumVariants }, () =>
    Array.from({ length: horizon })
  );

  const selections = new Array(horizon);
  const occurrence = new Array(maxNumVariants).fill(0);
  let occurrenceCount = 0;

  let currentDollars = startingDollars;

  const conversions = Array.from({ length: maxNumVariants }, () =>
    Array.from({ length: horizon })
  );

  let bestVariantProbability = Math.max(...variantsSchedule[0][1]);

  const regret = Array.from({ length: horizon });
  let variantsCounter = 0;

  for (let iteration = 0; iteration < horizon; iteration++) {
    const [sectionMax, variantProbabilities] =
      variantsSchedule[variantsCounter];

    if (iteration >= sectionMax) {
      variantsCounter += 1;
      bestVariantProbability = Math.max(
        ...variantProbabilities[variantsCounter][1]
      );
    }

    const subModel = model.slice(0, variantProbabilities.length);

    const selectedVariant = selectionStrategies[selectionStrategy](subModel);

    currentDollars -= 1;

    const selectedId = selectedVariant.id;
    const selectedProb = variantProbabilities[selectedId];
    selections[iteration] = selectedId;
    model[selectedId].pulls += 1;
    if (Math.random() < selectedProb) {
      model[selectedId].rewards += 1;

      currentDollars += 2;
    }

    regret[iteration] = bestVariantProbability - selectedProb;

    occurrence[selectedId] += 1;
    occurrenceCount += 1;

    occurrence
      .map((d) => Math.round((d / occurrenceCount) * 100))
      .forEach((d, index) => {
        distributions[index][iteration] = d;

        const { pulls, rewards } = model.at(index);
        conversions[index][iteration] = pulls > 0 ? rewards / pulls : 0;
      });
  }

  self.postMessage({
    selections,
    distributions,
    occurrence,
    conversions,
    currentDollars,
    cumulativeRegret: scanSum(regret),
  });
}
