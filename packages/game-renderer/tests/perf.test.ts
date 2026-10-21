import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createNative3DGame } from "@nodetool-ai/game-runtime";

import { buildStandaloneGame3D } from "../src/build3d.js";
import { gamePerfPercentiles, measureStandaloneGame3D } from "../src/perf.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "game-perf-"));
  directories.push(path);
  return path;
}

/**
 * A stand-in player whose frames cost `frameCostMs` of busy work, report `drawCalls` per frame, and add
 * `programsPerFrame` shader programs on each frame.
 */
async function fakePlayer(budgets: Record<string, number>, frameCostMs: number, drawCalls: number, programsPerFrame: number): Promise<string> {
  const path = await directory();
  await writeFile(join(path, "game.json"), JSON.stringify({ schemaVersion: 3, performance: { budgets } }));
  await writeFile(join(path, "index.html"), `<html><body><canvas id="game" width="64" height="36"></canvas><div id="status">Ready</div><script>
    let frameNumber = 0, tick = 0, programs = 4, running = false, advanced = 0;
    const loop = () => {
      if (running) { const until = performance.now() + ${frameCostMs}; while (performance.now() < until) {} frameNumber++; tick++; programs += ${programsPerFrame}; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.nativeGame3DPlayer = { pause() { running = false; }, resume() { running = true; },
      advance: async (inputs) => { advanced += inputs.length; tick += inputs.length; frameNumber++; return { tick, frameNumber }; },
      stats: () => ({ frameNumber, tick, drawCalls: ${drawCalls}, triangles: 1000, programs, renderMs: 1 }) };
  </script></body></html>`);
  return path;
}

it("uses nearest-rank percentiles and reports zero for an empty window", () => {
  expect(gamePerfPercentiles(Array.from({ length: 100 }, (_, index) => 100 - index))).toEqual({ p50: 50, p95: 95, p99: 99, max: 100 });
  expect(gamePerfPercentiles([])).toEqual({ p50: 0, p95: 0, p99: 0, max: 0 });
});

it("measures live play of a real 3D export after its route, with no player errors", async () => {
  const path = await directory();
  const document = createNative3DGame("perf");
  for (const scene of document.scenes) {
    scene.environment = { ...scene.environment, postProcessing: { enabled: true, antialias: "smaa" } };
    for (const entity of scene.entities) for (const behavior of entity.behaviors) { if (behavior.kind === "script") { behavior.maxTickMs = 20; } }
  }
  await buildStandaloneGame3D({ document, outputDir: path, resolveAsset: async () => null });
  const inputs = Array.from({ length: 30 }, () => ({ pressed: [], justPressed: [], axes: { moveX: 1 }, look: { x: 0, y: 0 } }));
  const report = await measureStandaloneGame3D(path, { inputs, seconds: 1, warmupSeconds: 0.5, software: true });
  // SMAA loads its lookup textures from data: URLs, which the export CSP must allow.
  expect(report.errors).toEqual([]);
  expect(report).toMatchObject({ ok: true, routeTicks: 30, vsync: false, gpu: { adapterType: "software" } });
  expect(report.ticks.start).toBeGreaterThanOrEqual(30);
  expect(report.ticks.end).toBeGreaterThan(report.ticks.start);
  expect(report.renderedFrames).toBeGreaterThan(1);
  expect(report.drawCalls.p95).toBeGreaterThan(0);
  expect(report.frameMs.p95).toBeGreaterThan(0);
}, 120_000);

it("reports frame time, draw call and program growth overruns of a deliberately slow player", async () => {
  const path = await fakePlayer({ frameMs: 16.6, drawCalls: 300 }, 40, 2000, 1);
  const report = await measureStandaloneGame3D(path, { seconds: 1, warmupSeconds: 0, software: true });
  expect(report.ok).toBe(true);
  expect(report.frameMs.p95).toBeGreaterThan(30);
  expect(report.programs.growth).toBeGreaterThan(0);
  expect(report.budget.overruns.map((overrun) => overrun.metric).sort()).toEqual(["drawCalls", "frameMs", "programGrowth"]);
}, 60_000);

it("reports no overruns for a player within budget", async () => {
  const path = await fakePlayer({ frameMs: 200, drawCalls: 300 }, 0, 100, 0);
  const report = await measureStandaloneGame3D(path, { seconds: 1, warmupSeconds: 0, software: true, inputs: [{ pressed: [], justPressed: [], axes: {}, look: { x: 0, y: 0 } }] });
  expect(report).toMatchObject({ ok: true, routeTicks: 1, programs: { growth: 0 }, budget: { overruns: [] } });
}, 60_000);
