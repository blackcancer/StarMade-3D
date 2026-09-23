import { defineConfig } from "vitest/config";

const suites = {
  unit: ["tests/*.test.ts"],
  decoder: ["tests/integration/*.decoder.test.ts"],
  game: ["tests/integration/*.game.test.ts"],
  all: ["tests/**/*.test.ts"]
} as const;
const suite = process.env.STARMADE_TEST_SUITE ?? "unit";
if (!(suite in suites)) throw new Error(`Unknown test suite: ${suite}`);

export default defineConfig({
  test: {
    root: ".",
    setupFiles: ["scripts/test-shaders.mjs"],
    include: [...suites[suite as keyof typeof suites]],
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false
  }
});
