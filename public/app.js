const MODELS = [
  {
    id: "needle3",
    label: "Needle 3 (2 layers)",
    base: "./models/needle3/",
    weights: "needle3.cact",
  },
  {
    id: "needle2",
    label: "Needle 2",
    base: "./models/needle2/",
    weights: "needle2.cact",
  },
];

const TOOLS = JSON.stringify([
  {
    name: "set_temperature",
    description: "Set the temperature in a room.",
    parameters: {
      type: "object",
      properties: {
        room: { type: "string", description: "Room whose temperature should change" },
        degrees_celsius: { type: "number", description: "Target temperature in Celsius" },
      },
      required: ["room", "degrees_celsius"],
    },
  },
]);

const button = document.querySelector("#run");
const promptInput = document.querySelector("#prompt");
const runsInput = document.querySelector("#runs");
const status = document.querySelector("#status");

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatRate(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString()} tok/s` : "not reported";
}

function formatMb(value) {
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(1)} MB` : "not reported";
}

function setCard(modelId, field, value) {
  document.querySelector(`[data-model="${modelId}"] [data-field="${field}"]`).textContent = value;
}

function benchmarkModel(model, prompt, measuredRuns) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("./needle-worker.js");
    const cleanup = () => worker.terminate();

    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        const percent = data.total ? Math.round((data.loaded / data.total) * 100) : null;
        status.textContent = `Loading ${model.label}${percent === null ? "" : ` · ${percent}%`}…`;
        return;
      }
      cleanup();
      if (data.type === "error") reject(new Error(data.message));
      else resolve(data);
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Worker failed"));
    };
    worker.postMessage({ type: "benchmark", model, prompt, tools: TOOLS, measuredRuns });
  });
}

async function runBenchmark() {
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  button.disabled = true;
  promptInput.disabled = true;
  runsInput.disabled = true;

  try {
    for (const model of MODELS) {
      setCard(model.id, "output", "Loading model…");
      const result = await benchmarkModel(model, prompt, Number(runsInput.value));
      const decode = median(result.runs.map((run) => Number(run.decode_tps)));
      const prefill = median(result.runs.map((run) => Number(run.prefill_tps)));
      const peakValues = result.runs
        .map((run) => Number(run.peak_ram_mb))
        .filter((value) => Number.isFinite(value) && value > 0);
      const peak = peakValues.length ? Math.max(...peakValues) : null;

      setCard(model.id, "decode", formatRate(decode));
      setCard(model.id, "prefill", formatRate(prefill));
      setCard(model.id, "peak", formatMb(peak));
      setCard(model.id, "heap", formatMb(result.wasmHeapBytes / 1024 / 1024));
      setCard(model.id, "output", JSON.stringify(result.runs.at(-1), null, 2));
    }
    status.textContent = "Complete. Re-run for a larger sample or try another prompt.";
  } catch (error) {
    status.textContent = `Benchmark failed: ${error.message}`;
  } finally {
    button.disabled = false;
    promptInput.disabled = false;
    runsInput.disabled = false;
  }
}

button.addEventListener("click", runBenchmark);
