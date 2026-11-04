import assert from "node:assert/strict";
import { nativeFrame3D } from "@nodetool-ai/protocol/native-game";

export async function probeSignalForge(worker, document, sessionId, initialSnapshot, options, witnessUnfiltered = false) {
  const get = (frame, id) => frame.entities.find(e => e.id === id);
  const step = async input => nativeFrame3D.parse(await worker.request("step", { sessionId, input }, options));
  const respawn = await step({ actions: { respawn: true } });
  assert.ok(Math.abs(get(respawn, "courier").transform.position[2] + 39.5) < .02, "Manual recovery must retain the reactor checkpoint");
  assert.equal(respawn.score, 1);
  await worker.request("restore", { sessionId, snapshot: initialSnapshot }, options);
  let remote;
  for (let tick = 0; tick < 10; tick++) {
    remote = await step({ actions: { pulse: true } });
    assert.ok(!remote.events.some(e => e.kind === "emit" && ["relay-online", "coolant-online", "reactor-online", "win"].includes(e.name)), "Remote input must not activate a puzzle objective");
  }
  assert.equal(remote.score, 0);
  assert.ok(Math.abs(get(remote, "charge-orb").transform.position[2] + 1.8) < .02);
  await worker.request("restore", { sessionId, snapshot: initialSnapshot }, options);
  const orbit = await step({ look: { x: 100, y: 50 } });
  const offset = orbit.camera.position.map((v, i) => v - get(orbit, "courier").transform.position[i]);
  assert.ok(offset[0] > 1 && offset[1] > 3, "Mouse look must orbit the follow camera");
  const forward = await step({ actions: { forward: true } });
  assert.ok(get(forward, "courier").transform.position[0] < 0, "Keyboard motion must follow camera yaw");
  await worker.request("restore", { sessionId, snapshot: initialSnapshot }, options);
  for (let tick = 0; tick < 20; tick++) { await step({}); }
  let peak = -Infinity, landing;
  for (let tick = 0; tick < 100; tick++) { landing = await step({ jump: true }); peak = Math.max(peak, get(landing, "courier").transform.position[1]); }
  assert.ok(peak > 2, "Jump must leave the arrival floor");
  assert.ok(get(landing, "courier").transform.position[1] < 1, "A held jump must not repeat on landing");
  const nonPlayer = await probeNonPlayerSignalForge(worker, document, options, witnessUnfiltered);
  return { respawn: { player: get(respawn, "courier").transform.position, score: respawn.score }, remotePulse: { player: get(remote, "courier").transform.position, orb: get(remote, "charge-orb").transform.position, score: remote.score }, camera: { offset, forward: get(forward, "courier").transform.position }, jump: { peak, landing: get(landing, "courier").transform.position }, nonPlayer };
}

export async function probeNonPlayerSignalForge(worker, document, options, witnessUnfiltered = false) {
  const get = (frame, id) => frame.entities.find(e => e.id === id);
  const negative = structuredClone(document), entities = negative.scenes[0].entities;
  entities.find(e => e.id === "courier").transform.position = [8, .9, 4];
  const beacon = entities.find(e => e.id === "final-beacon");
  entities.find(e => e.id === "charge-orb").transform.position = [...beacon.transform.position];
  if (witnessUnfiltered) { beacon.collider.mask = 65535; }
  const negativeId = "signal-forge-nonplayer";
  await worker.request("open", { sessionId: negativeId, document: negative }, options);
  await worker.request("start", { sessionId: negativeId, seed: 1 }, options);
  let overlap;
  try {
    for (let tick = 0; tick < 3; tick++) { overlap = nativeFrame3D.parse(await worker.request("step", { sessionId: negativeId, input: {} }, options)); }
    assert.equal(overlap.score, 0, "The core must not collect the player's final beacon");
    assert.ok(get(overlap, "final-beacon"));
    const a = get(overlap, "charge-orb").transform.position, b = get(overlap, "final-beacon").transform.position;
    assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) < .1, "Negative probe must actually overlap the collectible");
  } finally { await worker.request("close", { sessionId: negativeId }, options); }
  return { orb: get(overlap, "charge-orb").transform.position, beacon: get(overlap, "final-beacon").transform.position, score: overlap.score };
}
