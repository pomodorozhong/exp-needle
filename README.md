# Needle Snake Lab and browser benchmark

A browser showcase for Cactus Compute's Needle models. The main page runs a five-cell Snake game controlled by Needle 3, while the benchmark page compares the smallest publicly buildable Needle 2 and Needle 3 variants. Models run locally in WebAssembly; prompts and inference calls never leave the browser.

## Run it

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open <http://127.0.0.1:4173> for Snake Lab or <http://127.0.0.1:4173/benchmark.html> for the benchmark.

## Snake Lab

Needle receives a short natural-language description of whether left, right, and forward are empty or blocked, where the fruit is relative to the snake, and the editable intention. The complete generated prompt is also editable before each decision. Unsaved edits apply to the next decision; Save (or Command/Ctrl+S) keeps the text as an override across moves, Restart, and model changes for the current page session. A fresh page session starts from the generated prompt. Regenerate uses the edited prompt against the unchanged game state. Raw coordinates are kept inside the game. Needle chooses exactly one `move(direction)` tool call, where `direction` is `left`, `right`, or `forward`. Suppressed, missing, or multiple calls are rejected rather than silently converted into movement. The game translates the selected direction into a Grid Engine movement. The snake never grows. Fruit increases score and respawns, while wall and self collisions end the run.

Fruit direction uses the dominant coordinate difference relative to the snake's heading. Equal X/Y differences deterministically use the X axis.

The game starts paused. Its controls support continuous play or one-decision Step mode, four speed levels, atomic intention changes, restart, regeneration after an invalid model response, and live selection between 2, 4, 8, and 20-layer Needle 3 rungs. Changing the rung reloads the model worker and restarts the run while retaining the intention and speed.

## Included model variants

| Model | Variant | Weight file | Why this variant |
| --- | --- | ---: | --- |
| Needle 3 | 2-layer rung, W4A8 | 13.3 MB | Smallest depth accepted by the public `needle build --layers` command |
| Needle 3 | 4-layer rung, W4A8 | 15.4 MB | Optional Snake Lab rung |
| Needle 3 | 8-layer rung, W4A8 | 27.4 MB | Optional Snake Lab rung |
| Needle 3 | 20-layer published base | 35.3 MB | Full-depth Snake Lab rung |
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
