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
const takeActionEpisode = (
  playerHitMax,
  dealerHitMax,
  stateAction,
  stateValues
) => {
  const [state, action] = stateAction;
  const [playerTotal, dealersCard, usableAce] = state;

  let playersCards = usableAce
    ? [1, playerTotal - 11]
    : playerTotal === 21
    ? [8, 8, 5]
    : [Math.floor(playerTotal / 2), Math.ceil(playerTotal / 2)];

  // console.log(stateAction, playersCards, handTotal(playersCards));

  let dealersCards = [dealersCard];

  const initialStateKey = stateKey(dealersCards, playersCards);

  if (action === "stick") {
    dealersCards = runDealer(dealerHitMax, dealersCards, playersCards);
    const reward = rewardAfterDealer(playersCards, dealersCards);
    const episodeReward = [[stateAction], reward];
    // console.log(
    //   stateAction,
    //   playersCards,
    //   handTotal(playersCards),
    //   episodeReward
    // );
    return episodeReward;
  } else {
    const playerPolicyF = (state) => {
      const action = stateValues.get(stateValueKey(state));
      const isExplore = Math.random() < 0;

      if (!action || isExplore) {
        return Math.random() < 0.5 ? "hit" : "stick";
      }

      return action;
    };

    playersCards = [...playersCards, randomCard()];
    if (isHandBust(playersCards)) {
      return [[stateAction], -1];
    }

    const [ep, reward] = generateEpisodeFrom(
      playerPolicyF,
      dealerHitMax,
      playersCards,
      dealersCard,
      true
    );

    const episodeReward = [[stateAction, ...ep], reward];

    // console.log(
    //   stateAction,
    //   playersCards,
    //   handTotal(playersCards),
    //   episodeReward
    // );
    return episodeReward;
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
    // const stateAction = [[12, 5, false], Math.random() < 0.5 ? "hit" : "stick"];
    // const stateAction = [
    //   [Math.floor(Math.random() * 10) + 12, 5, false],
    //   Math.random() < 0.5 ? "hit" : "stick",
    // ];

    const [episode, reward] = takeActionEpisode(
      playerHitMax,
      dealerHitMax,
      stateAction,
      stateValues
    );

    // let [[a, b, c], d] = stateAction;
    // if (a === 14 && b === 5 && c === false && d === "hit") {
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

      // let [[a, b, c], d] = stateAction;
      // if (a === 12 && b === 5 && c === false) {
      //   const h = stateActionValues.get(stateActionValueKey([state, "hit"]));
      //   if (h) console.log(stateAction, "hit", h[1] / h[0]);
      //   const h1 = stateActionValues.get(stateActionValueKey([state, "stick"]));
      //   if (h1) console.log(stateAction, "stick", h1[1] / h1[0]);
      // }

      stateValues.set(
        stateKey,
        argmax((possibleAction) => {
          const stateActionValue = stateActionValues.get(
            stateActionValueKey([state, possibleAction])
          );

          if (stateActionValue) {
            const [count, total] = stateActionValue;

            // let [[a, b, c], d] = stateAction;
            // if (a === 12 && b === 5 && c === false) {
            //   console.log(stateAction, stateActionValue, total / count);
            // }

            return total / count;
          }

          return 0;
        }, possibleActions)
      );
    });

    // console.log(stateValues);
    // console.log(stateActionValues);
  }

  self.postMessage({
    stateValues,
    stateActionValues,
  });
}
