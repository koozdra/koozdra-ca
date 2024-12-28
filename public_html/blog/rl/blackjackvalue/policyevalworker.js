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
}) {
  for (i = 0; i < numSimulations; i++) {
    const [episode, reward] = generateEpisode((state) => {
      const [playerTotal, _dealerCard, _usableAce] = state;
      return playerTotal <= playerHitMax ? "hit" : "stick";
    }, dealerHitMax);
    // console.log(episode);
    updateStateValues(episode, reward, stateValues);
  }

  numTotalTrials += numSimulations;

  self.postMessage({
    stateValues,
    numTotalTrials,
  });
}
