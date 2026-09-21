export const BOARD_SIZE = 12;
export const DEFAULT_INTENTION = "get_closer_to_fruit";
export const INITIAL_SEGMENTS = Object.freeze([
  Object.freeze({ x: 6, y: 3 }),
  Object.freeze({ x: 5, y: 3 }),
  Object.freeze({ x: 4, y: 3 }),
  Object.freeze({ x: 4, y: 4 }),
  Object.freeze({ x: 3, y: 4 }),
]);
export const INITIAL_FRUIT = Object.freeze({ x: 8, y: 7 });

const ABSOLUTE_VECTORS = Object.freeze({
  up: Object.freeze({ x: 0, y: -1 }),
  right: Object.freeze({ x: 1, y: 0 }),
  down: Object.freeze({ x: 0, y: 1 }),
  left: Object.freeze({ x: -1, y: 0 }),
});

function copyPosition(position) {
  return { x: position.x, y: position.y };
}

export function createInitialState() {
  return {
    segments: INITIAL_SEGMENTS.map(copyPosition),
    fruit: copyPosition(INITIAL_FRUIT),
    score: 0,
    steps: 0,
  };
}

export function positionKey(position) {
  return `${position.x},${position.y}`;
}

export function headingFromSegments(segments) {
  if (!Array.isArray(segments) || segments.length < 2) throw new Error("At least two snake segments are required");
  const vector = {
    x: segments[0].x - segments[1].x,
    y: segments[0].y - segments[1].y,
  };
  const direction = Object.entries(ABSOLUTE_VECTORS).find(([, candidate]) => candidate.x === vector.x && candidate.y === vector.y)?.[0];
  if (!direction) throw new Error("Head and neck must occupy adjacent orthogonal cells");
  return direction;
}

export function relativeToAbsolute(heading, relativeDirection) {
  const order = ["up", "right", "down", "left"];
  const index = order.indexOf(heading);
  if (index < 0) throw new Error(`Unknown heading: ${heading}`);
  if (relativeDirection === "forward") return heading;
  if (relativeDirection === "right") return order[(index + 1) % order.length];
  if (relativeDirection === "left") return order[(index + order.length - 1) % order.length];
  throw new Error(`Unknown relative direction: ${relativeDirection}`);
}

export function previewMove(state, relativeDirection) {
  const heading = headingFromSegments(state.segments);
  const absoluteDirection = relativeToAbsolute(heading, relativeDirection);
  const vector = ABSOLUTE_VECTORS[absoluteDirection];
  const target = {
    x: state.segments[0].x + vector.x,
    y: state.segments[0].y + vector.y,
  };
  const outside = target.x < 0 || target.y < 0 || target.x >= BOARD_SIZE || target.y >= BOARD_SIZE;
  const occupied = state.segments.slice(1).some((segment) => positionKey(segment) === positionKey(target));
  return {
    relativeDirection,
    absoluteDirection,
    target,
    collision: outside ? "wall" : occupied ? "self" : null,
  };
}

export function advanceState(state, move, random = Math.random) {
  if (move.collision) throw new Error(`Cannot advance into a ${move.collision} collision`);
  const segments = [copyPosition(move.target), ...state.segments.slice(0, -1).map(copyPosition)];
  const ateFruit = positionKey(move.target) === positionKey(state.fruit);
  return {
    segments,
    fruit: ateFruit ? chooseFreeCell(segments, random) : copyPosition(state.fruit),
    score: state.score + (ateFruit ? 1 : 0),
    steps: state.steps + 1,
    ateFruit,
  };
}

export function chooseFreeCell(segments, random = Math.random) {
  const occupied = new Set(segments.map(positionKey));
  const free = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!occupied.has(positionKey({ x, y }))) free.push({ x, y });
    }
  }
  if (!free.length) throw new Error("No free cell remains for the fruit");
  const index = Math.min(free.length - 1, Math.floor(random() * free.length));
  return free[index];
}

export function fruitDirection(state) {
  const head = state.segments[0];
  const dx = state.fruit.x - head.x;
  const dy = state.fruit.y - head.y;
  const absoluteDirection = Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0 ? "right" : "left")
    : (dy >= 0 ? "down" : "up");
  const heading = headingFromSegments(state.segments);
  if (absoluteDirection === relativeToAbsolute(heading, "forward")) return "forward";
  if (absoluteDirection === relativeToAbsolute(heading, "left")) return "left_side";
  if (absoluteDirection === relativeToAbsolute(heading, "right")) return "right_side";
  return "behind";
}

function spaceInDirection(state, relativeDirection) {
  return previewMove(state, relativeDirection).collision ? "blocked" : "empty";
}

export function createNeedleSensors(state, intention) {
  return {
    left: spaceInDirection(state, "left"),
    right: spaceInDirection(state, "right"),
    forward: spaceInDirection(state, "forward"),
    fruit_on_your: fruitDirection(state),
    intention,
  };
}

export function formatNeedleInput(state, intention) {
  const sensors = createNeedleSensors(state, intention);
  const fruitDirectionText = {
    forward: "ahead of you",
    left_side: "on your left side",
    right_side: "on your right side",
    behind: "behind you",
  }[sensors.fruit_on_your];
  return [
    `Left is ${sensors.left}.`,
    `Right is ${sensors.right}.`,
    `Forward is ${sensors.forward}.`,
    `The fruit is ${fruitDirectionText}.`,
    `Your intention is: ${sensors.intention}.`,
    "Choose one safe move.",
  ].join(" ");
}

export function segmentDirections(fromSegments, toSegments) {
  return fromSegments.map((source, index) => {
    const target = toSegments[index];
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    return Object.entries(ABSOLUTE_VECTORS).find(([, vector]) => vector.x === dx && vector.y === dy)?.[0] ?? null;
  });
}
