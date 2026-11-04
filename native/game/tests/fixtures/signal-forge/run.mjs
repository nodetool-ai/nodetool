import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NativeGameWorker, nativeCppFrameDigest } from "@nodetool-ai/game-runtime/native";
import { nativeFrame3D, nativeGame3dDocument } from "@nodetool-ai/protocol/native-game";
import { sha256 } from "./adapt.mjs";
import { probeSignalForge } from "./probes.mjs";

const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const documentPath = resolve(option("--document")), executable = resolve(option("--worker")), out = resolve(option("--out"));
await mkdir(out, { recursive: true });
const raw = await readFile(documentPath), document = nativeGame3dDocument.parse(JSON.parse(raw));
const route = JSON.parse(await readFile(resolve(option("--inputs") ?? new URL("../../../../../packages/game-runtime/samples/signal-forge/completion.inputs.json", import.meta.url).pathname), "utf8"));
const count = Number(option("--ticks") ?? route.length), options = { signal: AbortSignal.timeout(Number(option("--timeout-ms") ?? 360000)) }, worker = new NativeGameWorker({ executable });
const observations = [], digests = [], events = new Set(), sessionId = "signal-forge";
const entity = (frame, id) => frame.entities.find(e => e.id === id);
let checkpoint, initial, frame;
const observe = f => {
  assert.equal(f.logs.length, 0, `Script diagnostics at tick ${f.tick}`);
  for (const e of f.events) { if (e.kind === "emit") { events.add(e.name); } }
  observations.push({ tick: f.tick, player: entity(f, "courier").transform.position, orb: entity(f, "charge-orb")?.transform.position, gate: entity(f, "relay-gate")?.transform.position, bridge: entity(f, "coolant-bridge")?.transform.position, finalBeacon: entity(f, "final-beacon")?.transform.position, score: f.score, events: f.events, camera: f.camera });
};
try {
  const capabilities = await worker.request("hello", {}, options);
  await worker.request("open", { sessionId, document }, options);
  frame = nativeFrame3D.parse(await worker.request("start", { sessionId, seed: 1 }, options)); observe(frame);
  initial = await worker.request("snapshot", { sessionId }, options);
  await writeFile(resolve(out, "frame-0.json"), JSON.stringify(frame, null, 2) + "\n");
  const midpoint = Math.floor(count / 2);
  for (let tick = 0; tick < count; tick++) {
    frame = nativeFrame3D.parse(await worker.request("step", { sessionId, input: route[tick] ?? {} }, options)); observe(frame);
    if (frame.tick === midpoint) { checkpoint = await worker.request("snapshot", { sessionId }, options); await writeFile(resolve(out, `frame-${frame.tick}.json`), JSON.stringify(frame, null, 2) + "\n"); }
    if (frame.tick > midpoint) { digests.push(nativeCppFrameDigest(frame)); }
  }
  const final = frame;
  await writeFile(resolve(out, `frame-${count}.json`), JSON.stringify(final, null, 2) + "\n");
  await worker.request("restore", { sessionId, snapshot: checkpoint ?? initial }, options);
  for (let tick = midpoint; tick < count; tick++) {
    const replayed = nativeFrame3D.parse(await worker.request("step", { sessionId, input: route[tick] ?? {} }, options));
    assert.equal(nativeCppFrameDigest(replayed), digests[tick - midpoint], `Originating-session replay at ${tick + 1}`);
  }
  const complete = final.score === 1 && events.has("win") && ["relay-online", "coolant-online", "reactor-online"].every(name => events.has(name)) && final.ui.nodes.find(node => node.id === "victory")?.visible === true && final.ui.nodes.find(node => node.id === "progress")?.value === 4;
  if (complete) { assert.deepEqual([...events].filter(name => ["relay-online", "coolant-online", "reactor-online", "win"].includes(name)), ["relay-online", "coolant-online", "reactor-online", "win"], "Objective events must occur in their authored order"); }
  const probes = complete ? await probeSignalForge(worker, document, sessionId, initial, options, args.includes("--witness-unfiltered")) : null;
  const report = { valid: true, complete, replayVerified: true, ticks: count, replayTicks: digests.length, events: [...events], final: observations.at(-1), probes, capabilities, worker: executable, workerDigest: sha256(await readFile(executable)), documentDigest: sha256(raw), routeDigest: sha256(JSON.stringify(route.slice(0, count))) };
  await writeFile(resolve(out, "inputs.json"), JSON.stringify(route.slice(0, count)) + "\n");
  await writeFile(resolve(out, "observations.json"), JSON.stringify(observations, null, 2) + "\n");
  await writeFile(resolve(out, "verification.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  if (!args.includes("--probe") && !complete) { throw new Error("Signal Forge route did not complete all physical objectives"); }
} catch (error) {
  await writeFile(resolve(out, "observations.partial.json"), JSON.stringify(observations, null, 2) + "\n");
  await writeFile(resolve(out, "failure.json"), JSON.stringify({ valid: false, completedTicks: observations.at(-1)?.tick ?? 0, message: error.message, code: error.code ?? null, details: error.details ?? null }, null, 2) + "\n");
  throw error;
} finally { worker.close(); }
