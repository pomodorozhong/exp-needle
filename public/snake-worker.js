let module;
let outputPointer;
let modelPointer;
let initialized = false;

const MODEL_BASE = "/models/needle3/";
const SYSTEM_PROMPT = "device: five-cell snake on a 12 by 12 grid";
const TOOLS = JSON.stringify([
  {
    name: "move",
    description: "Move the snake one cell relative to its current heading. Choose a direction marked empty that is safe and moves toward the fruit.",
    parameters: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["left", "right", "forward"],
          description: "Move left, right, or forward relative to the current heading",
        },
      },
      required: ["direction"],
      additionalProperties: false,
    },
  },
]);

function allocateString(value) {
  const bytes = new TextEncoder().encode(value);
  const pointer = module._malloc(bytes.length + 1);
  module.HEAPU8.set(bytes, pointer);
  module.HEAPU8[pointer + bytes.length] = 0;
  return pointer;
}

function withStrings(values, callback) {
  const pointers = values.map(allocateString);
  try {
    return callback(...pointers);
  } finally {
    pointers.forEach((pointer) => module._free(pointer));
  }
}

async function fetchBytes(url, reportProgress = false) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${url} (${response.status})`);
  if (!response.body || !reportProgress) return new Uint8Array(await response.arrayBuffer());
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    self.postMessage({ type: "progress", loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function initialize(weightsFile = "needle3.cact") {
  if (initialized) return;
  importScripts(`${MODEL_BASE}needle.js`);
  const [wasm, weights] = await Promise.all([
    fetchBytes(`${MODEL_BASE}needle.wasm`),
    fetchBytes(`${MODEL_BASE}${weightsFile}`, true),
  ]);
  module = await createNeedle({ wasmBinary: wasm });
  modelPointer = module._malloc(weights.length);
  module.HEAPU8.set(weights, modelPointer);
  const loaded = module._needle_load(modelPointer, BigInt(weights.length));
  if (loaded !== 0) throw new Error(`needle_load failed (${loaded})`);
  outputPointer = module._malloc(65536);
  const initResult = withStrings([SYSTEM_PROMPT, TOOLS], (systemPointer, toolsPointer) =>
    module._needle_init(systemPointer, toolsPointer, 0),
  );
  if (initResult < 0) throw new Error(`needle_init failed (${initResult})`);
  initialized = true;
}

function decide(input) {
  module._needle_reset();
  const startedAt = performance.now();
  const result = withStrings([input], (inputPointer) =>
    module._needle_complete(inputPointer, 128, outputPointer, 65536),
  );
  const latencyMs = performance.now() - startedAt;
  if (result < 0) throw new Error(`needle_complete failed (${result})`);
  const text = module.UTF8ToString(outputPointer);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`Needle returned invalid JSON: ${text.slice(0, 300)}`);
  }
  const calls = raw.function_calls ?? [];
  const call = calls[0];
  const direction = call?.name === "move" ? call.arguments?.direction : null;
  if (calls.length !== 1 || !direction) {
    const error = new Error("Needle must return exactly one non-suppressed snake move");
    error.raw = raw;
    throw error;
  }
  return {
    raw,
    direction,
    confidence: Number(raw.confidence),
    decodeTps: Number(raw.decode_tps),
    prefillTps: Number(raw.prefill_tps),
    latencyMs,
  };
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === "initialize") {
      await initialize(data.weights);
      self.postMessage({ id, type: "ready" });
      return;
    }
    if (!initialized) throw new Error("Needle is not initialized");
    if (type === "decide" || type === "retry") {
      self.postMessage({ id, type: "decision", result: decide(data.input) });
    }
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      message: error?.message || String(error),
      raw: error?.raw ?? null,
    });
  }
};
