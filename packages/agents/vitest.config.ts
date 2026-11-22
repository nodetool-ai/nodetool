import { transformWithOxc, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

import { WeightedShardSequencer } from "./tests/_helpers/weighted-shards.js";

/**
 * Mobile sources imported by the mobile document harness
 * (`tests/mobile-storyboard-tool-loop.test.ts`). Their nearest tsconfig is
 * `mobile/tsconfig.json`, which extends `expo/tsconfig.base` from mobile's own
 * dependency tree. That tree is not installed with the root workspaces, so the
 * default transform fails to load the tsconfig. These files need no tsconfig
 * option, and this plugin strips their types without one.
 */
const MOBILE_SOURCES = /[\\/]mobile[\\/]src[\\/].*\.ts$/;

const mobileSources: Plugin = {
  name: "nodetool:mobile-sources",
  enforce: "pre",
  async transform(code, id) {
    if (!MOBILE_SOURCES.test(id)) return null;
    const result = await transformWithOxc(code, id, { lang: "ts", tsconfig: false });
    return { code: result.code, map: result.map };
  }
};

export default defineConfig({
  plugins: [mobileSources],
  oxc: { exclude: [/\.js$/, MOBILE_SOURCES] },
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
