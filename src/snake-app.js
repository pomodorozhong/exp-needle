import * as Phaser from "phaser";
import { Direction, GridEngine, directionFromPos } from "grid-engine";
import {
  DEFAULT_INTENTION,
  advanceState,
  createInitialState,
  formatNeedleInput,
  previewMove,
  segmentDirections,
} from "./snake-core.js";

const CELL_SIZE = 48;
const BOARD_PIXELS = CELL_SIZE * 12;
const SEGMENT_IDS = ["head", "neck", "body-a", "body-b", "tail"];
const SPEEDS = [1, 2, 4, 8];
const MODEL_RUNGS = {
  2: { weights: "needle3.cact", label: "2 layers" },
  4: { weights: "needle3-4.cact", label: "4 layers" },
  8: { weights: "needle3-8.cact", label: "8 layers" },
  20: { weights: "needle3-20.cact", label: "20 layers" },
};
const DIRECTION_MAP = {
  up: Direction.UP,
  right: Direction.RIGHT,
  down: Direction.DOWN,
  left: Direction.LEFT,
};

let resolveScene;
const sceneReady = new Promise((resolve) => { resolveScene = resolve; });

class SnakeScene extends Phaser.Scene {
  constructor() {
    super("snake");
    this.segmentContainers = [];
    this.headEyes = [];
    this.indicator = null;
    this.edgeIndicators = [];
  }

  create() {
    this.cameras.main.setBackgroundColor("#0c1216");
    this.createGrid();
    const state = createInitialState();
    this.createFruit(state.fruit);
    this.createSnake(state.segments);
    resolveScene(this);
  }

  createGrid() {
    const tileGraphic = this.make.graphics({ add: false });
    tileGraphic.fillStyle(0x0c1216, 1);
    tileGraphic.fillRect(0, 0, CELL_SIZE, CELL_SIZE);
    tileGraphic.generateTexture("grid-floor", CELL_SIZE, CELL_SIZE);
    tileGraphic.destroy();

    const data = Array.from({ length: 12 }, () => Array(12).fill(0));
    this.tilemap = this.make.tilemap({ data, tileWidth: CELL_SIZE, tileHeight: CELL_SIZE });
    const tiles = this.tilemap.addTilesetImage("grid-floor");
    const layer = this.tilemap.createLayer(0, tiles, 0, 0);
    layer.setAlpha(0);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x33424d, 0.9);
    for (let index = 0; index <= 12; index += 1) {
      const offset = index * CELL_SIZE + 0.5;
      grid.lineBetween(offset, 0, offset, BOARD_PIXELS);
      grid.lineBetween(0, offset, BOARD_PIXELS, offset);
    }
    grid.lineStyle(2, 0x566a77, 1);
    grid.strokeRect(1, 1, BOARD_PIXELS - 2, BOARD_PIXELS - 2);

    this.indicator = this.add.rectangle(0, 0, CELL_SIZE - 6, CELL_SIZE - 6, 0xf5b94e, 0.2)
      .setOrigin(0)
      .setStrokeStyle(3, 0xf5b94e, 1)
      .setDepth(2)
      .setVisible(false);
    this.edgeIndicators = [
      this.add.rectangle(0, 0, BOARD_PIXELS, 7, 0xff675f, 0.9).setOrigin(0).setVisible(false),
      this.add.rectangle(BOARD_PIXELS - 7, 0, 7, BOARD_PIXELS, 0xff675f, 0.9).setOrigin(0).setVisible(false),
      this.add.rectangle(0, BOARD_PIXELS - 7, BOARD_PIXELS, 7, 0xff675f, 0.9).setOrigin(0).setVisible(false),
      this.add.rectangle(0, 0, 7, BOARD_PIXELS, 0xff675f, 0.9).setOrigin(0).setVisible(false),
    ];
    this.edgeIndicators.forEach((edge) => edge.setDepth(8));
  }

  createSnake(segments) {
    const colors = [0x8de0a5, 0x78cf94, 0x67bd84, 0x59ab76, 0x4b9868];
    this.segmentContainers = segments.map((segment, index) => {
      const block = this.add.rectangle(3, 3, CELL_SIZE - 6, CELL_SIZE - 6, colors[index], 1)
        .setOrigin(0)
        .setStrokeStyle(1, 0xc7f4d3, index === 0 ? 0.75 : 0.25);
      const children = [block];
      if (index === 0) {
        this.headEyes = [
          this.add.circle(34, 18, 4, 0x08100c),
          this.add.circle(34, 31, 4, 0x08100c),
        ];
        children.push(...this.headEyes);
      }
      return this.add.container(0, 0, children).setDepth(5);
    });

    this.gridEngine.create(this.tilemap, {
      characters: segments.map((segment, index) => ({
        id: SEGMENT_IDS[index],
        container: this.segmentContainers[index],
        startPosition: segment,
        speed: 4,
        collides: false,
      })),
    });
    this.updateHeadEyes("right");
  }

  createFruit(position) {
    this.fruit = this.add.rectangle(0, 0, CELL_SIZE - 14, CELL_SIZE - 14, 0xff6f67, 1)
      .setStrokeStyle(2, 0xffa49e, 0.7)
      .setDepth(3);
    this.setFruit(position);
  }

  setFruit(position) {
    this.fruit.setPosition(position.x * CELL_SIZE + CELL_SIZE / 2, position.y * CELL_SIZE + CELL_SIZE / 2);
  }

  updateHeadEyes(direction) {
    const positions = {
      right: [[34, 18], [34, 31]], left: [[14, 18], [14, 31]],
      up: [[18, 14], [31, 14]], down: [[18, 34], [31, 34]],
    }[direction];
    this.headEyes.forEach((eye, index) => eye.setPosition(...positions[index]));
  }

  showDecision(move) {
    this.clearIndicator();
    if (move.collision === "wall") {
      const edgeIndex = { up: 0, right: 1, down: 2, left: 3 }[move.absoluteDirection];
      this.edgeIndicators[edgeIndex].setVisible(true).setAlpha(1);
      return;
    }
    const color = move.collision === "self" ? 0xff675f : 0xf5b94e;
    this.indicator
      .setPosition(move.target.x * CELL_SIZE + 3, move.target.y * CELL_SIZE + 3)
      .setFillStyle(color, 0.2)
      .setStrokeStyle(3, color, 1)
      .setAlpha(1)
      .setVisible(true);
    this.tweens.add({ targets: this.indicator, alpha: 0.55, duration: 120, yoyo: true, repeat: -1 });
  }

  clearIndicator() {
    this.tweens.killTweensOf(this.indicator);
    this.indicator?.setVisible(false).setAlpha(1);
    this.edgeIndicators.forEach((edge) => {
      this.tweens.killTweensOf(edge);
      edge.setVisible(false).setAlpha(1);
    });
  }

  async fadeIndicator() {
    const visible = [this.indicator, ...this.edgeIndicators].filter((item) => item?.visible);
    if (!visible.length) return;
    visible.forEach((item) => this.tweens.killTweensOf(item));
    await new Promise((resolve) => {
      this.tweens.add({ targets: visible, alpha: 0, duration: 150, onComplete: resolve });
    });
    this.clearIndicator();
  }

  async moveSegments(fromSegments, toSegments, absoluteDirection, speed) {
    SEGMENT_IDS.forEach((id) => this.gridEngine.setSpeed(id, speed));
    this.updateHeadEyes(absoluteDirection);
    const directions = segmentDirections(fromSegments, toSegments);
    await new Promise((resolve, reject) => {
      const completed = new Set();
      const subscription = this.gridEngine.positionChangeFinished().subscribe(({ charId }) => {
        if (!SEGMENT_IDS.includes(charId)) return;
        completed.add(charId);
        if (completed.size === SEGMENT_IDS.length) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      });
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error("Grid Engine movement timed out"));
      }, Math.max(2500, 3000 / speed));
      directions.forEach((direction, index) => {
        if (!direction) {
          clearTimeout(timeout);
          subscription.unsubscribe();
          reject(new Error(`Invalid segment movement for ${SEGMENT_IDS[index]}`));
          return;
        }
        this.gridEngine.move(SEGMENT_IDS[index], DIRECTION_MAP[direction]);
      });
    });
  }

  resetState(state) {
    this.clearIndicator();
    state.segments.forEach((position, index) => this.gridEngine.setPosition(SEGMENT_IDS[index], position));
    this.updateHeadEyes("right");
    this.setFruit(state.fruit);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: BOARD_PIXELS,
  height: BOARD_PIXELS,
  parent: "game",
  backgroundColor: "#0c1216",
  antialias: false,
  pixelArt: true,
  scene: SnakeScene,
  plugins: {
    scene: [{ key: "gridEngine", plugin: GridEngine, mapping: "gridEngine" }],
  },
});

const ui = {
  status: document.querySelector("#game-status"),
  statusDot: document.querySelector("#status-dot"),
  input: document.querySelector("#needle-input"),
  saveInput: document.querySelector("#save-input"),
  output: document.querySelector("#needle-output"),
  intention: document.querySelector("#intention"),
  intentionNote: document.querySelector("#intention-note"),
  applyIntention: document.querySelector("#apply-intention"),
  toggle: document.querySelector("#toggle-run"),
  step: document.querySelector("#step-run"),
  slower: document.querySelector("#slower"),
  faster: document.querySelector("#faster"),
  restart: document.querySelector("#restart"),
  overlayRestart: document.querySelector("#overlay-restart"),
  regenerate: document.querySelector("#regenerate"),
  gameOver: document.querySelector("#game-over"),
  gameOverReason: document.querySelector("#game-over-reason"),
  score: document.querySelector("#score"),
  steps: document.querySelector("#steps"),
  speed: document.querySelector("#speed"),
  inference: document.querySelector("#inference"),
  layers: document.querySelector("#model-layers"),
};

let scene;
let state = createInitialState();
let activeIntention = DEFAULT_INTENTION;
let savedInput = null;
let speedIndex = 2;
let phase = "loading";
let pauseRequested = false;
let stepRequested = false;
let pendingDecision = null;
let lastFailedInput = null;
let rpcSequence = 0;
const pendingRpc = new Map();
let worker;

function createWorker() {
  const nextWorker = new Worker("/snake-worker.js");
  nextWorker.onmessage = ({ data }) => {
    if (data.type === "progress") {
      const percent = data.total ? Math.round((data.loaded / data.total) * 100) : null;
      setStatus(`Loading ${MODEL_RUNGS[ui.layers.value].label}${percent === null ? "" : ` · ${percent}%`}`, "loading");
      return;
    }
    const pending = pendingRpc.get(data.id);
    if (!pending) return;
    pendingRpc.delete(data.id);
    if (data.type === "error") {
      const error = new Error(data.message);
      error.raw = data.raw;
      pending.reject(error);
    } else {
      pending.resolve(data.result ?? true);
    }
  };
  nextWorker.onerror = (event) => {
    for (const pending of pendingRpc.values()) pending.reject(new Error(event.message || "Needle worker failed"));
    pendingRpc.clear();
  };
  return nextWorker;
}

function replaceWorker() {
  worker?.terminate();
  for (const pending of pendingRpc.values()) pending.reject(new Error("Needle model changed"));
  pendingRpc.clear();
  worker = createWorker();
}

function rpc(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = ++rpcSequence;
    pendingRpc.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...payload });
  });
}

function setStatus(text, kind = "ready") {
  ui.status.textContent = text;
  ui.statusDot.dataset.kind = kind;
}

function updateStats() {
  ui.score.textContent = state.score;
  ui.steps.textContent = state.steps;
  ui.speed.textContent = `${SPEEDS[speedIndex]} t/s`;
}

function currentInput() {
  return formatNeedleInput(state, activeIntention);
}

function showCurrentInput(input = savedInput ?? currentInput()) {
  ui.input.value = input;
  ui.saveInput.textContent = savedInput && input === savedInput ? "Saved" : "Save";
}

function updateControls() {
  const canRun = phase !== "loading" && phase !== "gameover" && phase !== "error";
  ui.toggle.disabled = !canRun;
  ui.step.disabled = phase !== "paused";
  ui.toggle.textContent = ["running", "thinking", "moving"].includes(phase) ? (pauseRequested ? "Pausing…" : "Pause") : "Start";
  ui.slower.disabled = speedIndex === 0;
  ui.faster.disabled = speedIndex === SPEEDS.length - 1;
  ui.regenerate.hidden = phase !== "error";
  ui.layers.disabled = ["loading", "running", "thinking", "moving"].includes(phase);
  ui.input.disabled = ["loading", "running", "thinking", "moving"].includes(phase);
  ui.saveInput.disabled = ui.input.disabled;
}

function saveInput() {
  const input = ui.input.value.trim();
  if (!input) return;
  savedInput = input;
  ui.input.value = savedInput;
  ui.saveInput.textContent = "Saved";
}

async function loadSelectedModel() {
  const rung = MODEL_RUNGS[ui.layers.value];
  phase = "loading";
  pauseRequested = false;
  stepRequested = false;
  pendingDecision = null;
  lastFailedInput = null;
  ui.gameOver.hidden = true;
  ui.output.textContent = "Loading model…";
  ui.inference.textContent = "—";
  setStatus(`Loading ${rung.label}`, "loading");
  updateControls();
  replaceWorker();
  try {
    await rpc("initialize", { weights: rung.weights });
    restartGame();
    ui.intentionNote.textContent = `${rung.label} loaded. The run was restarted.`;
  } catch (error) {
    phase = "error";
    ui.output.textContent = JSON.stringify({ error: error.message }, null, 2);
    setStatus("Model failed to load", "error");
    updateControls();
  }
}

function applyIntention() {
  const next = ui.intention.value.trim();
  if (!next) {
    ui.intentionNote.textContent = "Intention cannot be empty.";
    return;
  }
  activeIntention = next;
  ui.intentionNote.textContent = phase === "error"
    ? "Saved for the next new decision; Regenerate retries the frozen input."
    : "Applied. The next decision will use this intention.";
  if (!["thinking", "moving", "error"].includes(phase)) showCurrentInput();
}

async function requestDecision({ retry = false, frozenInput = null } = {}) {
  if (phase === "gameover") return;
  const input = frozenInput ?? (ui.input.value.trim() || currentInput());
  showCurrentInput(input);
  phase = "thinking";
  setStatus(retry ? "Regenerating" : "Needle is deciding", "working");
  updateControls();
  try {
    const decision = await rpc(retry ? "retry" : "decide", { input });
    ui.output.textContent = JSON.stringify(decision.raw, null, 2);
    ui.inference.textContent = `${decision.latencyMs.toFixed(1)} ms`;
    const move = previewMove(state, decision.direction);
    scene.showDecision(move);
    lastFailedInput = null;
    if (pauseRequested) {
      pendingDecision = { decision, move };
      phase = "paused";
      pauseRequested = false;
      setStatus("Paused · decision ready", "paused");
      updateControls();
      return;
    }
    await applyDecision(decision, move);
  } catch (error) {
    phase = "error";
    pauseRequested = false;
    stepRequested = false;
    lastFailedInput = input;
    ui.output.textContent = JSON.stringify({ error: error.message, response: error.raw ?? null }, null, 2);
    setStatus("Paused · response invalid", "error");
    updateControls();
  }
}

async function applyDecision(decision, move) {
  if (move.collision) {
    await new Promise((resolve) => setTimeout(resolve, 320));
    endGame(move.collision);
    return;
  }
  phase = "moving";
  setStatus(`${decision.direction} · ${Number.isFinite(decision.confidence) ? `${Math.round(decision.confidence * 100)}% confidence` : "confidence unavailable"}`, "working");
  updateControls();
  const nextState = advanceState(state, move);
  try {
    await scene.moveSegments(state.segments, nextState.segments, move.absoluteDirection, SPEEDS[speedIndex]);
    state = nextState;
    scene.setFruit(state.fruit);
    updateStats();
    showCurrentInput();
    await scene.fadeIndicator();
    if (pauseRequested || stepRequested) {
      pauseRequested = false;
      stepRequested = false;
      phase = "paused";
      setStatus("Paused", "paused");
      updateControls();
      return;
    }
    phase = "running";
    setStatus("Running", "ready");
    updateControls();
    setTimeout(() => requestDecision(), 0);
  } catch (error) {
    phase = "error";
    stepRequested = false;
    lastFailedInput = currentInput();
    ui.output.textContent = JSON.stringify({ error: error.message }, null, 2);
    setStatus("Paused · movement error", "error");
    updateControls();
  }
}

function endGame(collision) {
  phase = "gameover";
  pauseRequested = false;
  stepRequested = false;
  pendingDecision = null;
  setStatus("Game over", "error");
  ui.gameOverReason.textContent = collision === "wall" ? "The snake hit the wall." : "The snake crashed into itself.";
  ui.gameOver.hidden = false;
  updateControls();
}

function restartGame() {
  state = createInitialState();
  phase = "paused";
  pauseRequested = false;
  stepRequested = false;
  pendingDecision = null;
  lastFailedInput = null;
  scene.resetState(state);
  ui.gameOver.hidden = true;
  ui.output.textContent = "No decision yet.";
  ui.inference.textContent = "—";
  showCurrentInput();
  updateStats();
  setStatus("Paused · ready", "paused");
  updateControls();
}

async function toggleRun() {
  if (["running", "thinking", "moving"].includes(phase)) {
    pauseRequested = true;
    setStatus("Pausing after this step", "paused");
    updateControls();
    return;
  }
  if (phase !== "paused") return;
  stepRequested = false;
  phase = "running";
  setStatus("Running", "ready");
  updateControls();
  if (pendingDecision) {
    const pending = pendingDecision;
    pendingDecision = null;
    await applyDecision(pending.decision, pending.move);
  } else {
    await requestDecision();
  }
}

async function stepOnce() {
  if (phase !== "paused") return;
  stepRequested = true;
  setStatus("Stepping once", "working");
  updateControls();
  if (pendingDecision) {
    const pending = pendingDecision;
    pendingDecision = null;
    await applyDecision(pending.decision, pending.move);
  } else {
    await requestDecision();
  }
}

ui.toggle.addEventListener("click", toggleRun);
ui.step.addEventListener("click", stepOnce);
ui.saveInput.addEventListener("click", saveInput);
ui.input.addEventListener("input", () => {
  ui.saveInput.textContent = savedInput && ui.input.value.trim() === savedInput ? "Saved" : "Save";
});
ui.input.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveInput();
  }
});
ui.restart.addEventListener("click", restartGame);
ui.overlayRestart.addEventListener("click", restartGame);
ui.applyIntention.addEventListener("click", applyIntention);
ui.intention.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); applyIntention(); }
});
ui.slower.addEventListener("click", () => { speedIndex = Math.max(0, speedIndex - 1); updateStats(); updateControls(); });
ui.faster.addEventListener("click", () => { speedIndex = Math.min(SPEEDS.length - 1, speedIndex + 1); updateStats(); updateControls(); });
ui.layers.addEventListener("change", loadSelectedModel);
ui.regenerate.addEventListener("click", async () => {
  if (!lastFailedInput) return;
  pauseRequested = false;
  const editedInput = ui.input.value.trim();
  await requestDecision({ retry: true, frozenInput: editedInput || lastFailedInput });
});

showCurrentInput();
updateStats();
updateControls();

try {
  worker = createWorker();
  [scene] = await Promise.all([sceneReady, rpc("initialize", { weights: MODEL_RUNGS[ui.layers.value].weights })]);
  phase = "paused";
  setStatus("Paused · ready", "paused");
  ui.toggle.disabled = false;
  showCurrentInput();
  updateControls();
} catch (error) {
  phase = "error";
  ui.output.textContent = JSON.stringify({ error: error.message }, null, 2);
  setStatus("Model failed to load", "error");
  updateControls();
}

window.addEventListener("pagehide", () => {
  worker.terminate();
  game.destroy(true);
});
