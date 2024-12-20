importScripts("blackjack.js");

self.addEventListener("message", function (e) {
  runSimulation(e.data);
});

// const takeAction = (state, action) => {
//   const [playerTotal, dealerCard, usableAce] = state;

//   let playerCards = usableAce
//     ? [1, playerTotal]
//     : [Math.floor(playerTotal / 2), Math.ceil(playerTotal / 2)];

//   // if (!usableAce) {
//   //   return [playerTotal + Math.floor(Math.random() * (21 - playerTotal + 1)), dealerCard, usableAce];
//   // } else {
//   //   const shouldSwitchToUnusableAce = Math.random() >= 0.5

//   // }
// };
const takeActionEpisode = (playerHitMax, dealerHitMax, stateAction) => {
  const [state, action] = stateAction;
  const [playerTotal, dealersCard, usableAce] = state;

  let playersCards = usableAce
    ? [1, playerTotal - 11]
    : [Math.floor(playerTotal / 2), Math.ceil(playerTotal / 2)];

  let dealersCards = [dealersCard];

  let episode = [];
  if (action === "stick") {
    episode = [...episode, [stateKey(dealersCards, playersCards), "stick"]];
    dealersCards = runDealer(dealerHitMax, dealersCards);
    return [episode, rewardAfterDealer(playersCards, dealersCards)];
  } else {
    if (playerTotal <= playerHitMax) {
      return generateEpisodeFrom(
        playerHitMax,
        dealerHitMax,
        playersCards,
        dealersCard
      );
    } else {
      episode = [...episode, [stateKey(dealersCards, playersCards), "hit"]];

      playersCards = [...playersCards, randomCard()];

      if (isHandBust(playersCards)) {
        return [episode, -1];
      }

      // this will hit immediately - need to add a check in there for the initial cards
      // and not hit if already above hit
      const ep = generateEpisodeFrom(
        playerHitMax,
        dealerHitMax,
        playersCards,
        dealersCard
      );

      return [[...episode, ...ep[0]], ep[1]];
    }
  }
};

const argmax = (f, arr) =>
  arr.reduce((maxElement, currentElement) =>
    f(currentElement) > f(maxElement) ? currentElement : maxElement
  );

function runSimulation({ numTrials, stateValues, stateActionValues }) {
  const playerHitMax = 19;
  const dealerHitMax = 16;
  const possibleActions = ["hit", "stick"];

  for (let i = 0; i < numTrials; i++) {
    const stateAction = randomStateAction();

    const [episode, reward] = takeActionEpisode(
      playerHitMax,
      dealerHitMax,
      stateAction
    );

    // const [[a, b, c], d] = stateAction;
    // if (a === 18 && b === 9 && c === true) {
    //   console.log(stateAction, episode, reward);
    // }

    episode.forEach((stateAction) => {
      const stateActionKey = stateActionValueKey(stateAction);
      const [state, _takenAction] = stateAction;

      // console.log(stateAction);
      // console.log(state);

      let currentStateActionValue = stateActionValues.get(stateActionKey);
      if (!currentStateActionValue) {
        currentStateActionValue = [0, 0];
      }
      const [count, total] = currentStateActionValue;
      stateActionValues.set(stateActionKey, [count + 1, total + reward]);

      const stateKey = stateValueKey(state);

      stateValues.set(
        stateKey,
        argmax((possibleAction) => {
          const stateActionValue = stateActionValues.get(
            stateActionValueKey([state, possibleAction])
          );

          if (stateActionValue) {
            const [count, total] = stateActionValue;
            return total / count;
          }

          return -1000;
        }, possibleActions)
      );
    });
  }

  self.postMessage({
    stateValues,
    stateActionValues,
  });
}
