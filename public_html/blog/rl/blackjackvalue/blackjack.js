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
  let aceUsed = false;
  return cards.reduce((acc, num) => {
    const isAce = num === 1;

    const cardValue = acc + (isAce && !aceUsed ? 11 : num);
    if (isAce) {
      aceUsed = true;
    }

    return cardValue;
  }, 0);
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
  playerHitMax,
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

  // Natural
  if (isHandWin(playersCards)) {
    // console.log(`Natural: ${playersCards} ${hasUsableAce(playersCards)}`);
    dealersCards = [...dealersCards, randomCard()];
    return [
      [...episode, [stateKey(dealersCards, playersCards), "stick"]],
      isHandWin(dealersCards) ? 0 : 1,
    ];
  }

  let playerTotal = handTotal(playersCards);

  if (playerTotal > playerHitMax) {
    episode = [...episode, [stateKey(dealersCards, playersCards), "stick"]];
  }

  while (playerTotal <= playerHitMax) {
    if (playerTotal >= 12) {
      episode = [...episode, [stateKey(dealersCards, playersCards), "hit"]];
    }

    const card = randomCard();
    playersCards = [...playersCards, card];
    // console.log(`Hit: ${card}, ${handTotal(playersCards)} ${playersCards}`);
    playerTotal = handTotal(playersCards);

    if (playerTotal >= playerHitMax && playerTotal <= 21) {
      episode = [...episode, [stateKey(dealersCards, playersCards), "stick"]];
    }
  }

  if (isHandBust(playersCards)) {
    // console.log(`Bust!!`);
    return [episode, -1];
  }

  dealersCards = runDealer(dealerHitMax, dealersCards);
  return [episode, rewardAfterDealer(playersCards, dealersCards)];
};

const runDealer = (dealerHitMax, dealersCards) => {
  let dealerTotal = handTotal(dealersCards);
  while (dealerTotal <= dealerHitMax) {
    const card = randomCard();
    dealersCards = [...dealersCards, card];

    // console.log(
    //   `Dealer Hit: ${card}, ${handTotal(dealersCards)} ${dealersCards}`
    // );
    dealerTotal = handTotal(dealersCards);
  }

  return dealersCards;
};

const generateEpisode = (playerHitMax, dealerHitMax) =>
  generateEpisodeFrom(
    playerHitMax,
    dealerHitMax,
    [randomCard(), randomCard()],
    randomCard()
  );

// const generateEpisode = (playerHitMax, dealerHitMax) => {
//   let dealersCards = [randomCard()];
//   let playersCards = [randomCard(), randomCard()];
//   // let playersCards = [1, 1];
//   // let playersCards = [1, 10];

//   // console.log(`Start: ${handTotal(playersCards)} ${playersCards}`);

//   let episode = [stateKey(dealersCards, playersCards)];

//   if (isHandWin(playersCards)) {
//     // console.log(`Natural: ${playersCards} ${hasUsableAce(playersCards)}`);
//     return [[...episode, stateKey(dealersCards, playersCards)], 1];
//   }

//   let playerTotal = handTotal(playersCards);

//   while (playerTotal <= playerHitMax) {
//     const card = randomCard();
//     playersCards = [...playersCards, card];
//     // console.log(`Hit: ${card}, ${handTotal(playersCards)} ${playersCards}`);
//     playerTotal = handTotal(playersCards);

//     if (playerTotal <= 21) {
//       episode = [...episode, stateKey(dealersCards, playersCards)];
//     }
//   }

//   if (isHandBust(playersCards)) {
//     // console.log(`Bust!!`);
//     return [episode, -1];
//   }

//   dealerTotal = handTotal(dealersCards);
//   while (dealerTotal <= dealerHitMax) {
//     const card = randomCard();
//     dealersCards = [...dealersCards, card];

//     // console.log(
//     //   `Dealer Hit: ${card}, ${handTotal(dealersCards)} ${dealersCards}`
//     // );
//     dealerTotal = handTotal(dealersCards);
//   }

//   if (isHandBust(dealersCards)) {
//     // console.log(`Dealer Bust!!`);
//     return [episode, 1];
//   }

//   // console.log(`Game: player:${playerTotal}  dealer:${dealerTotal}`);

//   if (dealerTotal === playerTotal) {
//     // console.log(`TIE!!`);
//     return [episode, 0];
//   }

//   return [episode, dealerTotal > playerTotal ? -1 : 1];
// };
