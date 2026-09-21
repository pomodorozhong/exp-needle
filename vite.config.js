import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        snake: resolve(import.meta.dirname, "index.html"),
        benchmark: resolve(import.meta.dirname, "benchmark.html"),
      },
    },
  },
});
