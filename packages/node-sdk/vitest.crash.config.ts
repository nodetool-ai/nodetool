import { defineConfig } from "vitest/config";
import base from "./vitest.config.js";

// Stryker's test oracle for the crash fuzzer: the fuzz corpus only. Running
// the whole node-sdk suite per mutant would report mutants killed by ordinary
// unit tests, which says nothing about whether fuzzed input reaches them.
//
// Spread rather than mergeConfig — merging concatenates `include`, which would
// silently pull the whole suite back in.
export default defineConfig({
  ...base,
  test: {
    include: ["tests/fuzz/**/*.test.ts"]
  }
});
