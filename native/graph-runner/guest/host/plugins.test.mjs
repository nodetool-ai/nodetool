import assert from "node:assert/strict";
import { basename } from "node:path";
import { test } from "node:test";
import { capabilityPlugins } from "./plugins.mjs";

test("native audio adapter resolves from Windows and POSIX package paths", () => {
  const resolvers = [];
  capabilityPlugins().find(plugin => plugin.name === "host-capabilities").setup({
    onResolve(options, callback) { resolvers.push({ ...options, callback }); },
    onLoad() {}
  });
  const resolve = resolvers.find(entry => entry.filter.test("./audio-context.js")).callback;
  for (const importer of [
    "/repo/packages/audio-nodes/src/lib/audio-wav.ts",
    "C:\\repo\\packages\\audio-nodes\\dist\\lib\\audio-wav.js"
  ]) {
    assert.equal(basename(resolve({ path: "./audio-context.js", importer }).path), "offline-audio.mjs");
  }
  assert.equal(resolve({ path: "./audio-context.js", importer: "/repo/packages/other/lib/audio-wav.js" }), undefined);
});
