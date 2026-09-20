let module;
let outputPointer;
let modelPointer;

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

function initialize(tools) {
  const result = withStrings(["", tools], (systemPointer, toolsPointer) =>
    module._needle_init(systemPointer, toolsPointer, 0),
  );
  if (result < 0) throw new Error(`needle_init failed (${result})`);
}

function complete(prompt) {
  module._needle_reset();
  const result = withStrings([prompt], (promptPointer) =>
    module._needle_complete(promptPointer, 128, outputPointer, 65536),
  );
  if (result < 0) throw new Error(`needle_complete failed (${result})`);
  const text = module.UTF8ToString(outputPointer);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Needle returned invalid JSON: ${text.slice(0, 300)}`);
  }
}

async function loadModel(model) {
  const base = new URL(model.base, self.location.href);
  const jsUrl = new URL("needle.js", base);
  const wasmUrl = new URL("needle.wasm", base);
  const weightsUrl = new URL(model.weights, base);

  importScripts(jsUrl.href);
  const [wasm, weights] = await Promise.all([
    fetchBytes(wasmUrl),
    fetchBytes(weightsUrl, true),
  ]);
  module = await createNeedle({ wasmBinary: wasm });
  modelPointer = module._malloc(weights.length);
  module.HEAPU8.set(weights, modelPointer);
  const loaded = module._needle_load(modelPointer, BigInt(weights.length));
  if (loaded !== 0) throw new Error(`needle_load failed (${loaded})`);
  outputPointer = module._malloc(65536);
}

self.onmessage = async ({ data }) => {
  if (data.type !== "benchmark") return;
  try {
    await loadModel(data.model);
    initialize(data.tools);
    complete(data.prompt); // Warm-up: excluded from the measured sample.

    const runs = [];
    for (let index = 0; index < data.measuredRuns; index += 1) {
      runs.push(complete(data.prompt));
    }

    self.postMessage({
      type: "result",
      modelId: data.model.id,
      runs,
      wasmHeapBytes: module.HEAPU8.buffer.byteLength,
    });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || String(error) });
  }
};
