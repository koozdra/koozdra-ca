// State:String representation of the board. eg "xox------"
// Action:Number (0-8) location of move, zero indexed

const triplets = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function isCompletePlayerTriplet(state, triplet) {
  const grouping = _.groupBy(triplet.map((t) => state[t]));
  return grouping["x"]?.length === 3 || grouping["o"]?.length === 3;
}

function initialState() {
  return "---------";
}

function isTerminal(state) {
  const terminalTriplet = triplets
    .map((triplet) =>
      isCompletePlayerTriplet(state, triplet) ? triplet : undefined,
    )
    .find((t) => t);

  const moves = possibleMoves(state);

  return (
    (terminalTriplet?.length === 3 && terminalTriplet) ||
    (moves.length === 0 && [])
  );
}

function isXWin(state) {
  const triplet = isTerminal(state);
  if (!triplet) return false;
  const grouping = _.groupBy(triplet?.map((t) => state[t]));
  return grouping["x"]?.length === 3;
}

function possibleMoves(state) {
  return state
    .split("")
    .map((value, index) => (value === "-" ? index : undefined))
    .filter((t) => t !== undefined);
}

function makeXMove(state, action) {
  return state.slice(0, action) + "x" + state.slice(action + 1);
}

function makeMove(state, action) {
  const nextState = makeXMove(state, action);
  const states = [nextState];

  // on an `x` move, `o` also moves if not in terminal state
  if (!isTerminal(nextState)) {
    const oAction = _.sample(possibleMoves(nextState));
    states.push(
      nextState.slice(0, oAction) + "o" + nextState.slice(oAction + 1),
    );
  }

  return states;
}

// selectMove: ([Move]) => Move
function generateEpisode(selectMove) {
  const episode = [initialState()];
  while (!isTerminal(episode.at(-1))) {
    const state = episode.at(-1);
    const action = selectMove(possibleMoves(state));
    episode.push(...makeMove(state, action));
    // const lastEpisode = episode.at(-1);
    // console.log("episode: ", episode, lastEpisode, isTerminal(lastEpisode));
  }
  return episode;
}

const stateValuePolicy = new Map();
let winsCount = 0;

// const episode = generateEpisode(_.sample);
// console.log(episode, isXWin(episode.at(-1)));

for (i = 0; i < 10000; i++) {
  const episode = generateEpisode(_.sample);
  const lastState = episode.at(-1);
  // console.log(episode, isXWin(lastState));

  const reward = isXWin(lastState) ? 1 : 0;
  winsCount += reward;

  for (state of episode) {
    const [count, sum] = stateValuePolicy.get(state) || [0, 0];
    stateValuePolicy.set(state, [count + 1, sum + reward]);
  }
}

// for (const [key, value] of stateValuePolicy) {
//   const [count, sum] = value;
//   console.log(`${key} ${count} ${sum} ${sum / count}`);
// }

console.log(stateValuePolicy.size, winsCount, "test");

const moves = possibleMoves(initialState());

for (move of moves) {
  const nextState = makeXMove(initialState(), move);
  const [stateValueCount, stateValueTotal] = stateValuePolicy.get(
    nextState,
  ) || [1, 0];
  const stateValue = stateValueTotal / stateValueCount;
  console.log(`${move} ${nextState} ${stateValue}`);
}
