// Array.from({length: 26}, (v, i) => [(Math.random() * (0.9 - 0.5) + 0.5).toFixed(2), (Math.random() * (0.9 - 0.5) + 0.5).toFixed(2), (Math.random() * (0.9 - 0.5) + 0.5).toFixed(2), (Math.random() * (0.9 - 0.5) + 0.5).toFixed(2)])

const conversions = [
  ["0.69", "0.69", "0.53", "0.53"],
  ["0.61", "0.73", "0.66", "0.53"],
  ["0.72", "0.60", "0.68", "0.75"],
  ["0.70", "0.82", "0.82", "0.63"],
  ["0.57", "0.84", "0.52", "0.79"],
  ["0.70", "0.52", "0.75", "0.77"],
  ["0.51", "0.82", "0.61", "0.62"],
  ["0.74", "0.74", "0.80", "0.55"],
  ["0.82", "0.63", "0.61", "0.63"],
  ["0.72", "0.68", "0.90", "0.80"],
  ["0.66", "0.73", "0.69", "0.70"],
  ["0.82", "0.70", "0.78", "0.82"],
  ["0.53", "0.66", "0.60", "0.72"],
  ["0.81", "0.84", "0.78", "0.73"],
  ["0.87", "0.51", "0.56", "0.82"],
  ["0.55", "0.62", "0.70", "0.83"],
  ["0.71", "0.51", "0.53", "0.61"],
  ["0.75", "0.58", "0.90", "0.71"],
  ["0.52", "0.54", "0.56", "0.53"],
  ["0.77", "0.55", "0.78", "0.60"],
  ["0.62", "0.82", "0.88", "0.53"],
  ["0.74", "0.89", "0.68", "0.88"],
  ["0.69", "0.57", "0.76", "0.87"],
  ["0.60", "0.69", "0.57", "0.61"],
  ["0.61", "0.55", "0.78", "0.84"],
  ["0.83", "0.61", "0.51", "0.79"],
];

const provinces = [
  "AB", // Alberta
  "BC", // British Columbia
  "MB", // Manitoba
  "NB", // New Brunswick
  "NL", // Newfoundland and Labrador
  "NS", // Nova Scotia
  "NT", // Northwest Territories
  "NU", // Nunavut
  "ON", // Ontario
  "PE", // Prince Edward Island
  "QC", // Quebec
  "SK", // Saskatchewan
  "YT", // Yukon
];

const regions = ["rural", "urban"];

const numVariants = 4;

const buildKey = (provinceName, regionName) => `${provinceName}-${regionName}`;

const randomIndex = (arr) => Math.floor(Math.random() * arr.length);

const conversionIndex = (provinceIndex, regionIndex) =>
  provinceIndex * regions.length + regionIndex;

const selectVariantEGreedy = (contextKey, model) => {
  let variantCounters = model[contextKey];

  if (!variantCounters) {
    model[contextKey] = Array.from({ length: numVariants }, () => ({
      pulls: 0,
      rewards: 0,
    }));

    variantCounters = model[contextKey];
  }

  // todo variant selection
};

document.addEventListener("DOMContentLoaded", async () => {
  console.log(conversions);
  console.log(provinces);
  console.log(regions);

  const model = {};
  const numTrials = 10;

  const iterate = (counter, limit) => {
    const provinceIndex = randomIndex(provinces);
    const regionIndex = randomIndex(regions);

    const provinceName = provinces[provinceIndex];
    const regionName = regions[regionIndex];

    const contextConversions =
      conversions[conversionIndex(provinceIndex, regionIndex)];
    const contextKey = buildKey(provinceName, regionName);

    console.log(provinceName, regionName, buildKey(provinceName, regionName));
    console.log(
      provinceIndex,
      regionIndex,
      conversionIndex(provinceIndex, regionIndex)
    );

    const variant = selectVariantEGreedy(contextKey, model);

    if (counter < limit) {
      iterate(counter + 1, limit);
    }
  };

  iterate(0, numTrials);
});
