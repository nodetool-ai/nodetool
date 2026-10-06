import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createNative3DGame, createTopDownRoomGame } from "@nodetool-ai/game-runtime";

import { buildStandaloneGame } from "../src/build.js";
import { buildStandaloneGame3D } from "../src/build3d.js";
import { smokeStandaloneGame } from "../src/smoke.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "game-smoke-"));
  directories.push(path);
  return path;
}

it.each(["2d", "3d"])("smokes 300 rendered frames from an exported %s build", async dimension => {
  const path = await directory();
  const output = join(path, "build");
  if (dimension === "3d") {
    const document = createNative3DGame("smoke");
    for (const scene of document.scenes) for (const entity of scene.entities) for (const behavior of entity.behaviors) {
      if (behavior.kind === "script") behavior.maxTickMs = 50;
    }
    await buildStandaloneGame3D({ document, outputDir: output, resolveAsset: async () => null });
  } else {
    await buildStandaloneGame({ document: createTopDownRoomGame("smoke"), outputDir: output, resolveAsset: async () => null });
  }
  const report = await smokeStandaloneGame(output);
  expect(report).toMatchObject({ ok: true, frames: 300, ticks: 300, errors: [] });
}, 90_000);

it.each([
  ["stalled tick", "step: async () => {}, snapshot: () => ({ tick: 0 })", "stalled"],
  ["console error", "step: async () => { tick++; console.error('broken renderer'); }, snapshot: () => ({ tick })", "broken renderer"],
  ["missing asset", "step: async () => { tick++; await fetch('./missing.png'); }, snapshot: () => ({ tick })", "missing.png"]
])("fails for %s in a player", async (_name, methods, expected) => {
  const path = await directory();
  await writeFile(join(path, "game.json"), JSON.stringify({ schemaVersion: 2, inputActions: [] }));
  await writeFile(join(path, "index.html"), `<html><body><div id="status">Ready</div><script>
    let tick = 0; window.nativeGamePlayer = { pause() {}, reset: async () => { tick = 0 }, ${methods} };
  </script></body></html>`);
  const report = await smokeStandaloneGame(path, { frames: 2, timeoutMs: 10_000 });
  expect(report.ok).toBe(false);
  expect(report.errors.join("\n")).toContain(expected);
}, 30_000);
