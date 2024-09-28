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
  const unvisetedVariant = model.find(({ pulls }) => pulls === 0);
  if (unvisetedVariant) return unvisetedVariant;

  const isExplore = Math.random() < 0.5;
  return isExplore
    ? randomElement(model)
    : maxBy(model, ({ pulls, rewards }) => rewards / pulls);
};

const ucbSelectionStrategy = (model) => {
  const unvisetedVariant = model.find(({ pulls }) => pulls === 0);
  if (unvisetedVariant) return unvisetedVariant;

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
  const distributions = Array.from({ length: numVariants }, () => []);

  const selections = new Array(horizon);
  const occurrence = new Array(4).fill(0);
  let occurrenceCount = 0;
  let currentDollars = startingDollars;

  const conversions = variantProbabilities.map(() =>
    Array.from({ length: horizon }, () => [])
  );

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

    occurrence[selectedId] += 1;
    occurrenceCount += 1;

    occurrence
      .map((d) => Math.round((d / occurrenceCount) * 100))
      .forEach((d, index) => {
        distributions[index].push(d);
        const { pulls, rewards } = model.at(index);
        conversions[index][iteration] = pulls > 0 ? rewards / pulls : 0;
      });
  }

  // console.log(conversions);

  self.postMessage({
    distributions,
    occurrence,
    conversions,
    currentDollars,
  });
}
