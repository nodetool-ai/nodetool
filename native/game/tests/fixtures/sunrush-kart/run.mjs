import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NativeGameWorker, nativeCppFrameDigest } from "@nodetool-ai/game-runtime/native";
import { sha256 } from "./adapt.mjs";
import { verifySunrushRun } from "./verify.mjs";

if (!process.argv[2] || !process.argv[3]) { throw new Error("Provide prepared output directory and installed game-worker"); }
const out = resolve(process.argv[2]), executable = resolve(process.argv[3]);
const raw = await readFile(resolve(out, "game.json")), document = JSON.parse(raw);
const originalRoute = JSON.parse(await readFile(new URL("../../../../../packages/game-runtime/samples/sunrush-kart/completion.inputs.json", import.meta.url)));
const route = originalRoute.map(input => ({ ...input, actions: Object.fromEntries(input.pressed.map(id => [id, true])), move: [input.axes?.steer ?? 0, 0, -(input.axes?.throttle ?? 0)], jump: false }));
const limit = Number(process.env.SUNRUSH_TICKS ?? route.length);
if (!Number.isInteger(limit) || limit < 1 || limit > route.length) { throw new Error("Invalid Sunrush tick bound"); }
await writeFile(resolve(out, "completion.inputs.json"), JSON.stringify(route) + "\n");
const worker = new NativeGameWorker({ executable }), sessionId = "sunrush", options = { signal: AbortSignal.timeout(1200000) };
const observations = [], replay = []; let snapshot;
const observe = async frame => {
  assert.equal(frame.logs.length, 0, `Script diagnostics at ${frame.tick}: ${JSON.stringify(frame.logs)}`);
  const racer = frame.entities.find(entity => entity.id === "racer-0");
  observations.push({ tick: frame.tick, racer: racer.transform.position, camera: frame.camera, events: frame.events });
  if ([0, 20, 600, 1800, 3000, route.length].includes(frame.tick)) { await writeFile(resolve(out, `frame-${frame.tick}.json`), JSON.stringify(frame, null, 2) + "\n"); }
  if (frame.tick % 600 === 0) { console.log(JSON.stringify({ progressTick: frame.tick, racer: racer.transform.position })); }
};
try {
  await worker.request("validate", { document }, options);
  await worker.request("open", { sessionId, document }, options);
  await observe(await worker.request("start", { sessionId, seed: 1 }, options));
  const midpoint = Math.floor(limit / 2), started = performance.now();
  for (let tick = 0; tick < limit; tick++) {
    const frame = await worker.request("step", { sessionId, input: route[tick] }, options); await observe(frame);
    if (frame.tick === midpoint) { snapshot = await worker.request("snapshot", { sessionId }, options); }
    if (frame.tick > midpoint) { replay.push(nativeCppFrameDigest(frame)); }
  }
  const finalSnapshot = await worker.request("snapshot", { sessionId }, options), controller = finalSnapshot.states["presentation/controller"];
  await writeFile(resolve(out, "observations.json"), JSON.stringify(observations, null, 2) + "\n");
  if (limit === route.length) {
    const player = controller.roles["racer-0"];
    assert.equal(player.finished, true); assert.equal(player.lap, 3); assert.equal(player.gate, 13);
    assert.equal(observations.filter(frame => frame.events.some(event => event.name === "finish")).length, 1);
    assert.deepEqual(observations.flatMap(frame => frame.events.filter(event => event.name === "lap").map(event => event.data.payload.lap)), [1, 2, 3]);
  }
  await worker.request("restore", { sessionId, snapshot }, options);
  for (let tick = midpoint; tick < limit; tick++) {
    const frame = await worker.request("step", { sessionId, input: route[tick] }, options);
    assert.equal(nativeCppFrameDigest(frame), replay[tick - midpoint], `Same-live-session replay mismatch ${tick + 1}`);
  }
  const report = { valid: true, ticks: limit, replayTicks: replay.length, workerDigest: sha256(await readFile(executable)), nativeDocumentDigest: sha256(raw),
    sourceScriptBytes: Buffer.byteLength(document.scripts[0].source), controller, ui: finalSnapshot.uiOverrides, final: observations.at(-1), elapsedMs: performance.now() - started, modelAdmissionPending: true };
  if (limit === route.length) { report.assertions = verifySunrushRun(report, observations); }
  await writeFile(resolve(out, limit === route.length ? "report.json" : "development-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ valid: true, ticks: limit, replayTicks: replay.length, player: controller.roles["racer-0"], modelAdmissionPending: true }));
} finally { worker.close(); }
