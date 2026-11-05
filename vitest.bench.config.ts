import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["benchmarks/**/*.bench.test.ts"],
    testTimeout: 120_000,
  },
});
