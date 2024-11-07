self.addEventListener("message", function (e) {
  runSimulation(e.data);
});

const buildKey = (provinceName, regionName) => `${provinceName}-${regionName}`;
const buildCanadaKey = () => "canada";

const randomIndex = (arr) => Math.floor(Math.random() * arr.length);
const randomElement = (arr) => arr[randomIndex(arr)];

const maxBy = (items, compareMapper) =>
  items.reduce(
    (max, item) => (compareMapper(item) > compareMapper(max) ? item : max),
    items[0]
  );

const conversionIndex = (provinceIndex, regionIndex, regions) =>
  provinceIndex * regions.length + regionIndex;

const getOrAddFromModel = (contextKey, numVariants, model) => {
  let variantCounters = model[contextKey];

  if (!variantCounters) {
    model[contextKey] = Array.from({ length: numVariants }, (_, i) => ({
      id: i,
      pulls: 0,
      rewards: 0,
    }));

    variantCounters = model[contextKey];
  }

  return variantCounters;
};

const selectVariantEGreedy = (variantCounters) => {
  const isExplore = Math.random() < 0.1;
  return isExplore
    ? randomElement(variantCounters)
    : maxBy(variantCounters, ({ pulls, rewards }) => rewards / pulls);
};

const selectVariantUcb = (variantCounters) => {
  const totalPulls = variantCounters
    .map(({ pulls }) => pulls)
    .reduce((sum, num) => sum + num, 0);

  return maxBy(
    variantCounters,
    ({ pulls, rewards }) =>
      // expected value + ucb boost
      rewards / pulls + Math.sqrt((2 * Math.log(totalPulls)) / pulls)
  );
};

const selectionStrategies = {
  e_greedy: selectVariantEGreedy,
  ucb: selectVariantUcb,
};

function runSimulation({
  numVariants,
  horizon,
  selectionStrategy,
  aggregationLevel,
  environment: { conversions, provinces, regions },
}) {
  const model = {};

  const variantConversionSeries = Array.from({ length: numVariants }, () =>
    Array.from({ length: horizon })
  );
  const selectionSeries = new Array(horizon);
  const regretSeries = new Array(horizon);
  const rewardSeries = new Array(horizon);
  const conversionSeries = new Array(horizon);
  let totalReward = 0;

  for (let counter = 0; counter < horizon; counter++) {
    const provinceIndex = randomIndex(provinces);
    const regionIndex = randomIndex(regions);

    const provinceName = provinces[provinceIndex];
    const regionName = regions[regionIndex];

    const contextConversions =
      conversions[conversionIndex(provinceIndex, regionIndex, regions)];

    const bestContextConversion = Math.max(...contextConversions);
    // const contextKey = buildKey(provinceName, regionName);
    const contextKey =
      aggregationLevel === "national"
        ? buildCanadaKey(provinceName, regionName)
        : buildKey(provinceName, regionName);
    const variantCounters = getOrAddFromModel(contextKey, numVariants, model);

    const unvisitedVariant = variantCounters.find(({ pulls }) => pulls === 0);

    const variant = unvisitedVariant
      ? unvisitedVariant
      : selectionStrategies[selectionStrategy](variantCounters);
    model[contextKey][variant.id].pulls += 1;

    const variantConversion = contextConversions[variant.id];

    regretSeries[counter] = bestContextConversion - variantConversion;

    const isReward = Math.random() < contextConversions[variant.id];
    if (isReward) {
      model[contextKey][variant.id].rewards += 1;
      rewardSeries[counter] = 1;
      totalReward += 1;
    } else {
      rewardSeries[counter] = 0;
    }

    conversionSeries[counter] = totalReward / (counter + 1);

    selectionSeries[counter] = variant.id;
    model[contextKey].forEach((variant, variantIndex) => {
      variantConversionSeries[variantIndex][counter] =
        variant.pulls > 0 ? variant.rewards / variant.pulls : 0;
    });
  }

  // const t = model.values().map((variantCounters) => )

  self.postMessage({
    selectionSeries,
    variantConversionSeries,
    regretSeries,
    rewardSeries,
    totalReward,
    conversionSeries,
  });
}
