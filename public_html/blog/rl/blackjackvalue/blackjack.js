// const randomCard = () => Math.floor(Math.random() * 10) + 1;
const randomCard = () => {
  const card = Math.floor(Math.random() * 13) + 1; // Uniformly pick 1-13
  return card <= 9 ? card : 10;
};
const handHasAce = (cards) => cards.includes(1);
const hasUsableAce = (cards) => {
  const aceIndex = cards.findIndex((a) => a === 1);
  if (aceIndex === -1) {
    return false;
  }
  const newCards = [...cards];
  newCards[aceIndex] = 11;
  const total = newCards.reduce((acc, num) => acc + num, 0);
  return total <= 21;
};

const handTotal = (cards) => {
  let total = 0;
  let aceCount = 0;

  // Calculate basic total and count number of aces
  for (let num of cards) {
    if (num === 1) {
      aceCount += 1;
      total += 11; // Assume ace is 11 initially
    } else {
      total += num;
    }
  }

  // Adjust for aces if total exceeds 21
  while (total > 21 && aceCount > 0) {
    total -= 10; // Change an ace from 11 to 1
    aceCount -= 1;
  }

  return total;
};
const isHandWin = (cards) => handTotal(cards) === 21;
const isHandBust = (cards) => handTotal(cards) > 21;
const stateKey = (dealersCards, playersCards) => [
  handTotal(playersCards),
  dealersCards[0],
  hasUsableAce(playersCards),
];
const stateValueKey = (state) => state.join(",");
const stateActionValueKey = (state) => state.join(",");
const randomState = () => [
  Math.floor(Math.random() * 10) + 1 + 21,
  Math.floor(Math.random() * 10) + 1,
  Math.random() < 0.5,
];
const randomStateAction = () => [
  [
    Math.floor(Math.random() * 10) + 12,
    Math.floor(Math.random() * 10) + 1,
    Math.random() < 0.5,
  ],
  Math.random() < 0.5 ? "hit" : "stick",
];

const rewardAfterDealer = (playersCards, dealersCards) => {
  const dealerTotal = handTotal(dealersCards);
  const playerTotal = handTotal(playersCards);

  if (isHandBust(dealersCards)) {
    return 1;
  }

  if (dealerTotal === playerTotal) {
    return 0;
  }

  return dealerTotal > playerTotal ? -1 : 1;
};

const randomAction = () => {
  const possibleActions = ["hit", "stick"];
  return possibleActions[Math.floor(Math.random() * possibleActions.length)];
};

const generateEpisodeFrom = (
  playerPolicyF,
  dealerHitMax,
  playersCards,
  dealerCard
) => {
  let dealersCards = [dealerCard];
  // let playersCards = [randomCard(), randomCard()];
  // let playersCards = [1, 1];
  // let playersCards = [1, 10];

  // console.log(`Start: ${handTotal(playersCards)} ${playersCards}`);

  let episode = [];
  let log = [];

  // Natural
  if (isHandWin(playersCards)) {
    dealersCards = runDealer(dealerHitMax, dealersCards);
    const reward = rewardAfterDealer(playersCards, dealersCards);

    log = [
      ...log,
      `Natural: p:${playersCards} d:${dealersCards} sk:${stateKey(
        dealersCards,
        playersCards
      )} reward: ${reward}`,
    ];

    return [
      [...episode, [stateKey(dealersCards, playersCards), "stick"]],
      reward,
      log,
    ];
  }

  let playerTotal = handTotal(playersCards);

  let done = false;
  while (!done) {
    const playerPolicyAction = playerPolicyF(
      stateKey(dealersCards, playersCards)
    );

    log = [
      ...log,
      `hit: p:${playersCards} d:${dealersCards} sk:${stateKey(
        dealersCards,
        playersCards
      )} pol:${playerPolicyAction}`,
    ];

    if (playerPolicyAction === "stick") {
      done = true;

      episode = [...episode, [stateKey(dealersCards, playersCards), "stick"]];
    } else {
      if (playerTotal >= 12) {
        episode = [...episode, [stateKey(dealersCards, playersCards), "hit"]];
      }

      const card = randomCard();
      playersCards = [...playersCards, card];

      log = [
        ...log,
        `Hit: ${card}, ${handTotal(playersCards)} ${playersCards}`,
      ];

      playerTotal = handTotal(playersCards);

      if (isHandBust(playersCards)) {
        done = true;
      }
    }
  }

  if (isHandBust(playersCards)) {
    log = [...log, `Bust:  p:${playersCards} d:${dealersCards} r:-1`];

    return [episode, -1, log];
  }

  dealersCards = runDealer(dealerHitMax, dealersCards);
  const reward = rewardAfterDealer(playersCards, dealersCards);

  log = [...log, `Result:  p:${playersCards} d:${dealersCards} r:${reward}`];

  return [episode, reward, log];
};

const runDealer = (dealerHitMax, dealersCards) => {
  let dealerTotal = handTotal(dealersCards);

  while (dealerTotal <= dealerHitMax) {
    dealersCards = [...dealersCards, randomCard()];
    dealerTotal = handTotal(dealersCards);
  }

  return dealersCards;
};

const generateEpisode = (playerPolicyF, dealerHitMax) =>
  generateEpisodeFrom(
    playerPolicyF,
    dealerHitMax,
    [randomCard(), randomCard()],
    randomCard()
  );
