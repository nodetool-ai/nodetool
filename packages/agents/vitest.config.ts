import { defineConfig } from "vitest/config";

import { WeightedShardSequencer } from "./tests/_helpers/weighted-shards.js";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    // The default worker count overloads QuickJS and native media libraries on
    // large Windows hosts. The overload causes unrelated 30-second timeouts.
    maxWorkers: process.platform === "win32" ? 4 : undefined,
    // `--shard` splits the files by recorded duration, not by count.
    sequence: { sequencer: WeightedShardSequencer }
  }
});
