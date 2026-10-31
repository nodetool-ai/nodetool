import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NativeGameWorker, nativeCppFrameDigest } from "@nodetool-ai/game-runtime/native";
import { nativeGame3dDocument, nativeFrame3D } from "@nodetool-ai/protocol/native-game";
import { sha256 } from "./adapt.mjs";

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) { throw new Error(`Missing ${name}`); } return resolve(args[index + 1]); };
const documentPath = option("--document"), executable = option("--worker"), output = option("--out");
await mkdir(output, { recursive: true });
const raw = await readFile(documentPath), document = nativeGame3dDocument.parse(JSON.parse(raw));
const routeBytes = await readFile(new URL("completion.inputs.json", import.meta.url)), route = JSON.parse(routeBytes);
const assertions = JSON.parse(await readFile(new URL("completion.assertions.json", import.meta.url), "utf8")), observedAssertions = [];
assert.ok(assertions.length > 0);
const worker = new NativeGameWorker({ executable }), sessionId = "relay-yard", frames = [], digests = [];
const workerPids = process.platform === "linux" ? (await readFile(`/proc/${process.pid}/task/${process.pid}/children`, "utf8")).trim().split(/\s+/).filter(Boolean).map(Number) : [];
const options = { signal: AbortSignal.timeout(120000) };
const find = (frame, id) => frame.entities.find(entity => entity.id === id);
const observations = [];
let snapshot, initialSnapshot, won = false, checkpoint = false;
const started = performance.now();
const observe = async frame => {
  assert.equal(frame.logs.length, 0, `Script diagnostics at ${frame.tick}`);
  for (const assertion of assertions.filter(entry => entry.tick === frame.tick)) {
    const actual = assertion.path.reduce((value, key) => value?.[key], frame);
    assert.deepEqual(actual, assertion.equals, `Native assertion at${frame.tick}: ${assertion.path.join(".")}`); observedAssertions.push({ ...assertion, actual });
  }
  won ||= frame.events.some(event => event.kind === "emit" && event.name === "win");
  checkpoint ||= frame.events.some(event => event.kind === "emit" && event.name === "checkpoint");
  const state = { tick: frame.tick, score: frame.score, player: find(frame, "player")?.transform.position, grounded: find(frame, "player")?.grounded,
    gate: find(frame, "door")?.transform.position, platform: find(frame, "moving-platform")?.transform.position, pickup: Boolean(find(frame, "pickup")), goal: Boolean(find(frame, "goal")),
    won, checkpoint, camera: frame.camera, ui: frame.ui?.nodes.filter(node => ["score", "win", "checkpoint-status"].includes(node.id)).map(node => ({ id: node.id, text: node.text })) };
  observations.push(state);
  if ([0, 90, route.length].includes(frame.tick)) {
    const filename = `frame-${frame.tick}.json`, bytes = JSON.stringify(frame, null, 2) + "\n";
    await writeFile(resolve(output, filename), bytes); frames.push({ tick: frame.tick, filename, digest: sha256(bytes), state });
  }
};
try {
  const capabilities = await worker.request("hello", {}, options);
  const validation = await worker.request("validate", { document }, options);
  await worker.request("open", { sessionId, document }, options);
  await observe(nativeFrame3D.parse(await worker.request("start", { sessionId, seed: 1 }, options)));
  initialSnapshot = await worker.request("snapshot", { sessionId }, options);
  const midpoint = Math.floor(route.length / 2);
  for (let tick = 0; tick < route.length; tick++) {
    const frame = nativeFrame3D.parse(await worker.request("step", { sessionId, input: route[tick] }, options));
    await observe(frame);
    if (frame.tick === midpoint) { snapshot = await worker.request("snapshot", { sessionId }, options); }
    if (frame.tick > midpoint) { digests.push(nativeCppFrameDigest(frame)); }
  }
  await writeFile(resolve(output, "observations.json"), JSON.stringify(observations, null, 2) + "\n");
  const final = observations.at(-1);
  assert.equal(observedAssertions.length, assertions.length);
  assert.equal(final.score, 2, "Both cells must be physically collected"); assert.equal(final.won, true, "Win must follow two actual collected events");
  assert.equal(final.checkpoint, true, "Checkpoint sensor must activate"); assert.equal(final.gate[1], 4.5); assert.equal(final.pickup, false); assert.equal(final.goal, false);
  assert.ok(final.ui.some(node => node.id === "checkpoint-status" && node.text === "CHECKPOINT SAVED"));
  assert.ok(final.ui.some(node => node.id === "score" && node.text === "Course complete"));
  await worker.request("restore", { sessionId, snapshot }, options);
  for (let tick = midpoint; tick < route.length; tick++) {
    const frame = nativeFrame3D.parse(await worker.request("step", { sessionId, input: route[tick] }, options));
    assert.equal(nativeCppFrameDigest(frame), digests[tick - midpoint], `Same-session replay mismatch at ${tick + 1}`);
  }
  const probes = {};
  const step = async input => nativeFrame3D.parse(await worker.request("step", { sessionId, input }, options));
  const orbitRoute = JSON.parse(await readFile(new URL("finish-orbit.inputs.json", import.meta.url), "utf8"));
  assert.deepEqual(orbitRoute.slice(0, route.length), route);
  const finishOrbit = await step(orbitRoute.at(-1));
  assert.equal(finishOrbit.score, 2); assert.ok(!find(finishOrbit, "goal"));
  assert.ok(finishOrbit.camera.position[0] > 6);
  await writeFile(resolve(output, "frame-166.json"), JSON.stringify(finishOrbit, null, 2) + "\n");
  probes.finishOrbit = { tick: finishOrbit.tick, input: orbitRoute.at(-1), camera: finishOrbit.camera, player: find(finishOrbit, "player").transform.position, score: finishOrbit.score };
  await worker.request("restore", { sessionId, snapshot: initialSnapshot }, options);
  let settled;
  for (let tick = 0; tick < 20; tick++) { settled = await step({}); }
  assert.equal(find(settled, "player").grounded, true);
  let peak = -Infinity, heldJump;
  for (let tick = 0; tick < 100; tick++) { heldJump = await step({ jump: true }); peak = Math.max(peak, find(heldJump, "player").transform.position[1]); }
  assert.ok(peak > 2, "Grounded jump must leave the floor");
  assert.ok(find(heldJump, "player").transform.position[1] < 1, "Holding jump must not retrigger after landing");
  probes.jump = { peak, landed: find(heldJump, "player").grounded };
  await worker.request("restore", { sessionId, snapshot: initialSnapshot }, options);
  const orbit = await step({ look: { x: 100, y: 50 } });
  const relative = orbit.camera.position.map((value, index) => value - find(orbit, "player").transform.position[index]);
  assert.ok(relative[0] > 1 && relative[1] > 3, "Drag must orbit the following camera");
  const forward = await step({ actions: { forward: true } });
  assert.ok(find(forward, "player").transform.position[0] < 0, "Keyboard forward must follow camera yaw");
  probes.camera = { relative, forwardPlayer: find(forward, "player").transform.position };
  await worker.request("restore", { sessionId, snapshot: initialSnapshot }, options);
  for (const input of route) { await step(input); }
  const respawned = await step({ actions: { respawn: true } });
  assert.ok(Math.abs(find(respawned, "player").transform.position[2] + 7) < .1);
  assert.equal(respawned.score, 2); assert.ok(!find(respawned, "pickup") && !find(respawned, "goal"));
  probes.respawn = { player: find(respawned, "player").transform.position, score: respawned.score };
  let crossedEdge = false, fallReset, lowest = Infinity;
  for (let tick = 0; tick < 240; tick++) {
    const frame = await step({ move: [1, 0, 0] }), position = find(frame, "player").transform.position;
    crossedEdge ||= position[0] > 7.4; lowest = Math.min(lowest, position[1]);
    if (crossedEdge && position[0] < 1 && position[1] > .7) { fallReset = frame; break; }
  }
  assert.ok(fallReset && lowest < -8, "Walking off the yard must invoke the original fall-respawn logic");
  assert.ok(Math.abs(find(fallReset, "player").transform.position[2] + 7) < .1); assert.equal(fallReset.score, 2);
  probes.fallRespawn = { lowest, player: find(fallReset, "player").transform.position, score: fallReset.score };
  probes.nonPlayer = [];
  for (const target of ["pickup", "door-switch-sensor-offset"]) {
    const negative = structuredClone(document), entities = negative.scenes[0].entities;
    if (args.includes("--witness-unfiltered-sensors")) { entities.find(entity => entity.id === target).collider.mask = 65535; }
    entities.find(entity => entity.id === "player").transform.position = [4, 1, 3];
    entities.find(entity => entity.id === "crate").transform.position = [...entities.find(entity => entity.id === target).transform.position];
    const id = `crate-${target}`;
    await worker.request("open", { sessionId: id, document: negative }, options); await worker.request("start", { sessionId: id, seed: 1 }, options);
    let frame;
    for (let tick = 0; tick < 10; tick++) { frame = nativeFrame3D.parse(await worker.request("step", { sessionId: id, input: {} }, options)); assert.ok(!frame.events.some(event => event.kind === "emit" && event.name === "open-door")); }
    assert.equal(frame.score, 0); assert.ok(find(frame, "pickup")); assert.ok(Math.abs(find(frame, "door").transform.position[1] - 1.3) < .001);
    const crate = find(frame, "crate").transform.position, sensor = find(frame, target).transform.position;
    assert.ok(Math.hypot(crate[0] - sensor[0], crate[2] - sensor[2]) < .01 && Math.abs(crate[1] - sensor[1]) < .3, "Negative witness must actually overlap the sensor");
    probes.nonPlayer.push({ target, crate, sensor, score: frame.score, gate: find(frame, "door").transform.position });
    await worker.request("close", { sessionId: id }, options);
  }
  const platform = observations.find(entry => entry.tick === 60).platform;
  assert.ok(Math.abs(platform[0] + 3) > 1); probes.platform = { tick0: observations[0].platform, tick60: platform };
  const report = { valid: true, replayVerified: true, replayTicks: digests.length, ticks: route.length, seed: 1, executable, workerDigest: sha256(await readFile(executable)),
    processId: process.pid, workerPids, sourceDocumentDigest: sha256(raw), routeDigest: sha256(routeBytes), capabilities, validation, observedAssertions, final, probes, frames, elapsedMs: performance.now() - started };
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report));
} finally { worker.close(); }
