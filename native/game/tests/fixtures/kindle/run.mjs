import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { NativeGameWorker, nativeCppFrameDigest } from "@nodetool-ai/game-runtime/native";
import { sha256 } from "./adapt.mjs";

const out = resolve(process.argv[2] ?? resolve(tmpdir(), "kindle-native-qa"));
const executable = process.argv[3] ?? process.env.NODETOOL_NATIVE_GAME_WORKER;
if (!executable) { throw new Error("Provide installed game-worker as third argument or NODETOOL_NATIVE_GAME_WORKER"); }
const source = resolve("packages/game-runtime/samples/kindle");
const raw = await readFile(resolve(out, "game.json")), document = JSON.parse(raw);
const legacyRoute = JSON.parse(await readFile(resolve(source, "completion.inputs.json"), "utf8"));
const route = legacyRoute.map(input => ({ actions: Object.fromEntries(input.pressed.map(id => [id, true])), move: { x: Number(input.pressed.includes("right")) - Number(input.pressed.includes("left")), y: 0 }, jump: input.pressed.includes("space") || input.pressed.includes("up") }));
await mkdir(out, { recursive: true }); await writeFile(resolve(out, "completion.inputs.json"), JSON.stringify(route) + "\n");
const worker = new NativeGameWorker({ executable }), sessionId = "kindle", options = { signal: AbortSignal.timeout(1200000) };
const observations = [], digests = []; let snapshot;
const observe = async frame => {
  assert.equal(frame.logs.length, 0, `Script diagnostics at ${frame.tick}: ${JSON.stringify(frame.logs)}`);
  const hero = frame.entities.find(e => e.id === "hero"), camera = frame.entities.find(e => e.id === "camera");
  if (frame.tick % 600 === 0) { console.log(JSON.stringify({ progressTick: frame.tick, sceneId: frame.sceneId, score: frame.score, hero: hero?.transform })); }
  observations.push({ tick: frame.tick, sceneId: frame.sceneId, score: frame.score, hero: hero?.transform, camera: camera?.transform, events: frame.events });
  if ([0, 2, 600, 1800, 3334, route.length].includes(frame.tick)) { await writeFile(resolve(out, `frame-${frame.tick}.json`), JSON.stringify(frame, null, 2) + "\n"); }
};
try {
  await worker.request("validate", { document }, options); const validation = { valid: true };
  await worker.request("open", { sessionId, document }, options);
  await observe(await worker.request("start", { sessionId, seed: 1 }, options));
  const limit = Number(process.env.KINDLE_TICKS ?? route.length), midpoint = Math.floor(limit / 2), started = performance.now();
  for (let tick = 0; tick < limit; tick++) {
    const frame = await worker.request("step", { sessionId, input: route[tick] }, options); await observe(frame);
    if (frame.tick === midpoint) { snapshot = await worker.request("snapshot", { sessionId }, options); }
    if (frame.tick > midpoint) { digests.push(nativeCppFrameDigest(frame)); }
  }
  await writeFile(resolve(out, "observations.json"), JSON.stringify(observations, null, 2) + "\n");
  await worker.request("restore", { sessionId, snapshot }, options);
  for (let tick = midpoint; tick < limit; tick++) { const frame = await worker.request("step", { sessionId, input: route[tick] }, options); assert.equal(nativeCppFrameDigest(frame), digests[tick - midpoint], `Replay at ${tick + 1}`); }
  const report = { validation, executable, workerDigest: sha256(await readFile(executable)), documentDigest: sha256(raw), ticks: limit, replayTicks: digests.length, elapsedMs: performance.now() - started, final: observations.at(-1), victory: observations.filter(o => o.events.some(e => e.name === "victory")), checkpoints: observations.filter(o => o.events.some(e => e.name === "checkpoint")) };
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify({ticks:limit, replayTicks:digests.length, score:report.final.score, hero:report.final.hero, victory:report.victory.map(e=>e.tick), checkpoints:report.checkpoints.map(e=>e.tick)}));
} finally { worker.close(); }
