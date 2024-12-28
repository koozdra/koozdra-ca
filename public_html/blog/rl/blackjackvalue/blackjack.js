const randomCard = () => Math.floor(Math.random() * 10) + 1;
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

const generateEpisodeFrom = (
  playerPolicyF,
  dealerHitMax,
  playersCards,
  dealerCard,
  ignoreNatural
) => {
  let dealersCards = [dealerCard];
  // let playersCards = [randomCard(), randomCard()];
  // let playersCards = [1, 1];
  // let playersCards = [1, 10];

  // console.log(`Start: ${handTotal(playersCards)} ${playersCards}`);

  let episode = [];
  const log = false;

  // Natural
  if (isHandWin(playersCards) && !ignoreNatural) {
    dealersCards = [...dealersCards, randomCard()];
    const reward = isHandWin(dealersCards) ? 0 : 1;
    if (log)
      console.log(
        `Natural: ${playersCards} ${hasUsableAce(
          playersCards
        )} dealer: ${dealersCards} reward: ${reward}`
      );
    return [
      [...episode, [stateKey(dealersCards, playersCards), "stick"]],
      reward,
    ];
  }

  let playerTotal = handTotal(playersCards);

  // if (playerTotal > playerHitMax) {
  //   episode = [...episode, [stateKey(dealersCards, playersCards), "stick"]];
  // } else {
  let done = false;
  while (!done) {
    const playerPolicyAction = playerPolicyF(
      stateKey(dealersCards, playersCards)
    );

    if (log)
      console.log(
        `loop: ${playersCards} ${dealersCards} ${stateKey(
          dealersCards,
          playersCards
        )} ${playerPolicyAction}`
      );

    if (playerPolicyAction === "stick") {
      done = true;

      episode = [...episode, [stateKey(dealersCards, playersCards), "stick"]];
    } else {
      if (playerTotal >= 12) {
        episode = [...episode, [stateKey(dealersCards, playersCards), "hit"]];
      }

      const card = randomCard();
      playersCards = [...playersCards, card];
      // console.log(`Hit: ${card}, ${handTotal(playersCards)} ${playersCards}`);
      playerTotal = handTotal(playersCards);

      // if (playerTotal <= 21) {
      //   done = true;
      //   episode = [...episode, [stateKey(dealersCards, playersCards), "stick"]];
      // }

      if (isHandBust(playersCards)) {
        // console.log(`Bust!!`);
        done = true;
      }
    }
  }
  // }

  if (isHandBust(playersCards)) {
    // console.log(`Bust!!`);
    if (log) console.log(`Bust: ${playersCards} ${dealersCards} ${episode}`);
    return [episode, -1];
  }

  dealersCards = runDealer(dealerHitMax, dealersCards, playersCards);
  const reward = rewardAfterDealer(playersCards, dealersCards);
  if (log) console.log(`Result: ${episode} ${reward}`);
  return [episode, reward];
};

// dealer should not hit if they are already above players total
const runDealer = (dealerHitMax, dealersCards, playersCards) => {
  let dealerTotal = handTotal(dealersCards);
  let playerTotal = handTotal(playersCards);
  let log = [];
  log = [...log, `Dealer: ${dealersCards} ${dealerTotal}`];
  while (dealerTotal <= dealerHitMax && dealerTotal < playerTotal) {
    const card = randomCard();
    dealersCards = [...dealersCards, card];

    // console.log(
    //   `Dealer: Hit: ${card}, ${handTotal(dealersCards)} ${dealersCards}`
    // );
    log = [
      ...log,
      `Dealer: Hit: ${card}, ${handTotal(dealersCards)} ${dealersCards}`,
    ];
    dealerTotal = handTotal(dealersCards);
  }

  log = [
    ...log,
    `Dealer: done Dealer(${dealersCards} ${dealerTotal}) Player(${playersCards} ${playerTotal}) reward:${rewardAfterDealer(
      playersCards,
      dealersCards
    )}`,
  ];

  // console.log(log);

  return dealersCards;
};

const generateEpisode = (playerPolicyF, dealerHitMax) =>
  generateEpisodeFrom(
    playerPolicyF,
    dealerHitMax,
    [randomCard(), randomCard()],
    randomCard()
  );
