importScripts("blackjack.js");

self.addEventListener("message", function (e) {
  runSimulation(e.data);
});

let numTotalTrials = 0;

const updateStateValues = (episode, reward, stateValues) => {
  episode.forEach((stateAction) => {
    const [state, _action] = stateAction;
    // console.log(state);
    const [statePlayerTotal] = state;
    if (statePlayerTotal >= 12) {
      const key = stateValueKey(state);
      let stateValue = stateValues.get(key);
      if (!stateValue) {
        stateValue = [0, 0];
        stateValues.set(key, stateValue);
      }
      const [count, total] = stateValue;

      stateValues.set(key, [count + 1, total + reward]);
    }
  });
};

function runSimulation({
  numSimulations,
  stateValues,
  playerHitMax,
  dealerHitMax,
  stateActionPolicy,
}) {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  const playerStrategyF = stateActionPolicy
    ? (state) => {
        const [playerTotal] = state;

        if (playerTotal < 12) {
          return "hit";
        }

        const key = stateValueKey(state);
        const value = stateActionPolicy.get(key);

        // if (!value) {
        //   console.log(
        //     "what",
        //     state,
        //     key,
        //     stateActionPolicy.get(key),
        //     stateActionPolicy
        //   );
        // }

        return value ?? randomAction();
      }
    : (state) => {
        const [playerTotal] = state;
        return playerTotal <= playerHitMax ? "hit" : "stick";
      };

  for (i = 0; i < numSimulations; i++) {
    const [episode, reward] = generateEpisode(playerStrategyF, dealerHitMax);
    // console.log(episode);
    updateStateValues(episode, reward, stateValues);
    switch (reward) {
      case -1:
        losses += 1;
        break;
      case 0:
        draws += 1;
        break;
      case 1:
        wins += 1;
        break;
    }
  }

  self.postMessage({
    stateValues,
    counters: {
      wins,
      losses,
      draws,
    },
  });
}
