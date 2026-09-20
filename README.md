# Needle 2 vs Needle 3 browser benchmark

A dependency-free browser benchmark for the smallest publicly buildable variants of Cactus Compute's Needle models. Both models run locally in WebAssembly; no prompts or inference calls leave the browser.

## Run it

Requires Node.js 20 or newer.

```sh
npm start
```

Open <http://127.0.0.1:4173>, then select the number of measured runs and click **Run benchmark**.

If that port is occupied, set a project-specific override such as `NEEDLE_BENCH_PORT=4187 npm start`.

## Included model variants

| Model | Variant | Weight file | Why this variant |
| --- | --- | ---: | --- |
| Needle 3 | 2-layer rung, W4A8 | 13.3 MB | Smallest depth accepted by the public `needle build --layers` command |
| Needle 2 | Published CQ2 model | 13.7 MB | The published model is already the smallest distribution |

The Needle 3 file was created from the Apache-2.0 upstream release with:

```sh
uvx --from 'cactus-needle[train]' needle build --layers 2 --platform wasm --out public/models/needle3
```

The official builder downloads the base archive and training checkpoint before slicing the rung. Needle 2's WASM engine and model are copied directly from its [Hugging Face repository](https://huggingface.co/Cactus-Compute/needle2).

## Method

- Each model runs in a fresh dedicated Web Worker.
- Models run sequentially, and each worker is terminated before the next model starts.
- Both models receive the same tool schema and prompt.
- One warm-up completion is excluded.
- Displayed decode and prefill speeds are medians of the engine's `decode_tps` and `prefill_tps` values.
- Peak model RAM is the maximum positive engine-reported `peak_ram_mb` in the sample. The current WASM engines return `0` or a negative sentinel on some builds; the UI labels those values **not reported**.
- WASM heap is `WebAssembly.Memory.buffer.byteLength` after inference. It includes allocator headroom, so it is intentionally shown separately from peak model RAM.

Results vary by browser, CPU, thermal state, background tabs, and prompt. Close other busy tabs and run several samples for a useful comparison.

## Upstream

- [Needle source](https://github.com/cactus-compute/needle)
- [Needle 3 model](https://huggingface.co/Cactus-Compute/needle3)
- [Needle 2 model](https://huggingface.co/Cactus-Compute/needle2)

Needle and the included upstream artifacts are licensed under Apache-2.0.
