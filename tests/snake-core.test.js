import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_SIZE,
  advanceState,
  chooseFreeCell,
  createNeedleSensors,
  createInitialState,
  formatNeedleInput,
  fruitDirection,
  headingFromSegments,
  positionKey,
  previewMove,
  relativeToAbsolute,
} from "../src/snake-core.js";

test("relative moves rotate correctly for every heading", () => {
  const expected = {
    up: { forward: "up", left: "left", right: "right" },
    right: { forward: "right", left: "up", right: "down" },
    down: { forward: "down", left: "right", right: "left" },
    left: { forward: "left", left: "down", right: "up" },
  };
  for (const [heading, moves] of Object.entries(expected)) {
    for (const [relative, absolute] of Object.entries(moves)) {
      assert.equal(relativeToAbsolute(heading, relative), absolute);
    }
  }
});

test("initial state produces relative sensors without coordinates", () => {
  const sensors = createNeedleSensors(createInitialState(), "get_closer_to_fruit");
  assert.deepEqual(sensors, {
    left: "empty",
    right: "empty",
    forward: "empty",
    fruit_on_your: "right_side",
    intention: "get_closer_to_fruit",
  });
  assert.equal(JSON.stringify(sensors).includes("head"), false);
});

test("Needle input is a concise natural-language state", () => {
  assert.equal(
    formatNeedleInput(createInitialState(), "get_closer_to_fruit"),
    "Left is empty. Right is empty. Forward is empty. The fruit is on your right side. Your intention is: get_closer_to_fruit. Choose one safe move.",
  );
});

test("fruit direction is relative to every heading", () => {
  const head = { x: 5, y: 5 };
  const cases = {
    up: { neck: { x: 5, y: 6 }, fruit: { x: 5, y: 2 }, expected: "forward" },
    right: { neck: { x: 4, y: 5 }, fruit: { x: 5, y: 2 }, expected: "left_side" },
    down: { neck: { x: 5, y: 4 }, fruit: { x: 5, y: 2 }, expected: "behind" },
    left: { neck: { x: 6, y: 5 }, fruit: { x: 5, y: 2 }, expected: "right_side" },
  };
  for (const { neck, fruit, expected } of Object.values(cases)) {
    const state = { ...createInitialState(), segments: [head, neck, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], fruit };
    assert.equal(fruitDirection(state), expected);
  }
});

test("equal fruit coordinate differences reproducibly prioritize the X axis", () => {
  const state = {
    ...createInitialState(),
    segments: [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 7 }, { x: 5, y: 8 }, { x: 5, y: 9 }],
    fruit: { x: 7, y: 3 },
  };
  assert.equal(fruitDirection(state), "right_side");
});

test("relative sensors mark walls and occupied cells as blocked", () => {
  const wallState = {
    ...createInitialState(),
    segments: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
  };
  assert.deepEqual(
    Object.fromEntries(Object.entries(createNeedleSensors(wallState, "test")).filter(([key]) => ["left", "right", "forward"].includes(key))),
    { left: "blocked", right: "empty", forward: "blocked" },
  );

  const occupiedState = {
    ...createInitialState(),
    segments: [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 7, y: 6 }],
  };
  assert.equal(createNeedleSensors(occupiedState, "test").right, "blocked");
});

test("advancing preserves segment order and fixed length", () => {
  const state = createInitialState();
  const move = previewMove(state, "forward");
  const next = advanceState(state, move, () => 0.5);
  assert.equal(next.segments.length, 5);
  assert.deepEqual(next.segments, [
    { x: 7, y: 3 }, { x: 6, y: 3 }, { x: 5, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 },
  ]);
  assert.equal(headingFromSegments(next.segments), "right");
});

test("three left turns produce a reachable self-collision", () => {
  let state = createInitialState();
  for (const direction of ["left", "left"]) {
    const move = previewMove(state, direction);
    assert.equal(move.collision, null);
    state = advanceState(state, move, () => 0);
  }
  const collision = previewMove(state, "left");
  assert.equal(collision.collision, "self");
  assert.deepEqual(collision.target, state.segments[3]);
});

test("moving outside the board reports a wall collision", () => {
  const state = {
    ...createInitialState(),
    segments: [{ x: BOARD_SIZE - 1, y: 3 }, { x: BOARD_SIZE - 2, y: 3 }, { x: 9, y: 3 }, { x: 8, y: 3 }, { x: 7, y: 3 }],
  };
  assert.equal(previewMove(state, "forward").collision, "wall");
});

test("eating fruit increments score and respawns away from every segment", () => {
  const state = createInitialState();
  state.fruit = { x: 7, y: 3 };
  const next = advanceState(state, previewMove(state, "forward"), () => 0);
  assert.equal(next.score, 1);
  assert.equal(next.ateFruit, true);
  assert.equal(next.segments.some((segment) => positionKey(segment) === positionKey(next.fruit)), false);
});

test("free-cell selection clamps a random value of one", () => {
  const cell = chooseFreeCell(createInitialState().segments, () => 1);
  assert.deepEqual(cell, { x: 11, y: 11 });
});
