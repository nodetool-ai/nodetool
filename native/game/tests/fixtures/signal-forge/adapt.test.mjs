import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSignalForgeDocument, sha256 } from "./adapt.mjs";
import { executeSignalScript, signalController, signalAudio } from "./bindings.mjs";

const source = JSON.parse(await readFile(new URL("../../../../../packages/game-runtime/samples/signal-forge/game.json", import.meta.url), "utf8"));
const collider = JSON.parse(await readFile(new URL("../../../../../packages/game-runtime/samples/signal-forge/assets/4083a3fff3aeda59dc2b9d8bc35f2789.json", import.meta.url), "utf8"));
const prepared = { assets: [{ id: "model", kind: "model", path: "model.glb", size: 100, digest: "a".repeat(64), dependencies: [] }, ...Object.entries(source.assets).filter(([, a]) => a.mediaKind === "audio").map(([id]) => ({ id, kind: "audio", path: `${id}.wav`, size: 100, digest: "b".repeat(64) }))], modelParts: Object.fromEntries(source.scenes[0].entities.filter(e => e.model).map(e => [e.id, ["model"]])), colliders: { "forge-static-collisions": collider } };

test("retains all source entities, selected model owners, exact scripts and immutable source", () => {
  const before = JSON.stringify(source), result = createSignalForgeDocument(source, prepared);
  assert.equal(JSON.stringify(source), before);
  for (const entity of source.scenes[0].entities) { assert.ok(result.document.scenes[0].entities.some(e => e.id === entity.id), entity.id); }
  assert.equal(result.provenance.originalScripts.length, 15);
  for (const entry of result.provenance.originalScripts) {
    const original = source.scenes[0].entities.find(e => e.id === entry.entityId).behaviors.find(b => b.kind === "script");
    assert.equal(entry.sourceDigest, sha256(original.source));
    assert.ok(result.document.scripts.find(s => s.id === entry.scriptId).source.includes(original.source));
  }
  assert.equal(result.document.scenes[0].entities.filter(e => e.visual).length, 17);
  assert.equal(result.document.scenes[0].entities.reduce((sum, e) => sum + e.behaviors.length, 0), 3);
  const order = result.provenance.controllerGroups.flat().filter(id => id !== "audio");
  assert.deepEqual(order, result.provenance.originalScripts.map(s => s.entityId).sort());
  assert.equal(result.document.scenes[0].entities.find(e => e.id === "charge-orb").body.mass, 1.5);
  assert.ok(result.document.scenes[0].entities.find(e => e.id === "forge-static-obstacles").collider.indices.length > 0);
});

const native = (id = "charge-orb") => ({ entityId: id, tick: 0, input: {}, events: [], state: null, world: { get: target => ({ id: target, gameplay: { collectible: target === "final-beacon" }, transform: { position: [0, .46, -1.8] }, velocity: [0, 0, 0] }) } });
test("maps force to a bounded fixed-step impulse and preserves native command ownership", () => {
  const result = executeSignalScript(native(), () => ({ commands: [{ kind: "addForce", force: { x: 15, y: 14.715, z: -30 } }] }), {});
  assert.deepEqual(result.commands, [{ kind: "applyImpulse", impulse: [.25, .24525, -.5] }]);
});
test("world adapter exposes legacy positions and velocities without changing originals", () => {
  let seen;
  executeSignalScript(native(), (input, world) => { seen = world.get("courier"); return { commands: [] }; }, {});
  assert.deepEqual(seen.position, { x: 0, y: .46, z: -1.8 });
  assert.deepEqual(seen.velocity, { x: 0, y: 0, z: 0 });
});
test("an unknown authored command is rejected rather than silently dropped", () => {
  assert.throws(() => executeSignalScript(native(), () => ({ commands: [{ kind: "invented" }] }), {}), /Unmapped/);
});
test("static gates cannot manufacture relay or coolant progression", () => {
  const gate = source.scenes[0].entities.find(e => e.id === "relay-gate").behaviors.find(b => b.kind === "script");
  const original = Function(`return (${gate.source})`)();
  const result = executeSignalScript(native("relay-gate"), original, {});
  assert.deepEqual(result.commands, []);
});
test("initial missing grounded is false and camera orbit uses visual-only helper commands", () => {
  const role = source.scenes[0].entities.find(e => e.id === "courier").behaviors.find(b => b.kind === "script");
  const original = Function(`return (${role.source})`)();
  const result = executeSignalScript(native("courier"), original, { player: true, speed: 4.8, acceleration: 38, camera: { sensitivity: .002, minPitch: -45, maxPitch: 55, offset: [0, 4.5, 7], lookAtOffset: [0, .65, -1.2] } });
  assert.equal(result.state.legacy.grounded, false);
  assert.equal(JSON.parse(JSON.stringify(result.state)).legacy.grounded, false);
  assert.ok(result.commands.some(c => c.kind === "setVisual" && c.entityId === "native-camera-pivot"));
  assert.ok(!result.commands.some(c => c.kind === "setPosition" && c.entityId === "camera"));
});
test("consolidated roles retain independent state, command owner, and removed-role lifecycle", () => {
  const n = native("group"), visited = [];
  const originals = { a: () => {}, b: () => {} };
  const execute = (input) => { visited.push(input.entityId); return { state: { count: (input.state?.count ?? 0) + 1 }, commands: [{ kind: "setPosition", position: [0, 0, 0] }, { kind: "emit", name: input.entityId }] }; };
  const result = signalController(n, originals, ["a", "b"], {}, execute, () => ({ commands: [] }));
  assert.deepEqual(visited, ["a", "b"]);
  assert.deepEqual(result.state.roles, { a: { count: 1 }, b: { count: 1 } });
  assert.deepEqual(result.commands.map(c => c.entityId), ["a", undefined, "b", undefined]);
  const missing = { ...n, world: { get: id => id === "b" ? null : n.world.get(id) }, state: result.state };
  const next = signalController(missing, originals, ["a", "b"], {}, execute, () => ({ commands: [] }));
  assert.deepEqual(next.state.roles, { a: { count: 2 }, b: { count: 1 } });
});
test("controller refuses a command overflow instead of dropping or delaying commands", () => {
  assert.throws(() => signalController(native(), { a: () => {} }, ["a"], {}, () => ({ state: null, commands: Array.from({ length: 17 }, () => ({ kind: "score", amount: 0 })) }), () => ({ commands: [] })), /command bound/);
});
test("music and event audio retain source volume with static master and bus gains", () => {
  assert.equal(source.audio.mixer.buses.master.volume, .85);
  assert.equal(source.audio.mixer.buses.music.volume, .7);
  assert.equal(source.audio.mixer.buses.sfx.volume, .8);
  const config = { music: source.scenes[0].music, sources: [{ assetId: "forge-relay", onEvent: "relay-online", volume: .65, spatial: true, position: [1, 2, 3] }, { assetId: "forge-pulse", onEvent: "pulse-fired", volume: .25, spatial: false, position: [4, 5, 6] }] };
  assert.deepEqual(signalAudio({ tick: 0, events: [] }, config).commands, [{ kind: "audio", assetId: "forge-music", music: true, loop: true, bus: "music", volume: .65 * .85 * .7 }]);
  assert.deepEqual(signalAudio({ tick: 1, events: [{ kind: "emit", name: "relay-online" }, { kind: "emit", name: "pulse-fired" }] }, config).commands, [{ kind: "audio", assetId: "forge-relay", volume: .65 * .85 * .8, position: [1, 2, 3] }, { kind: "audio", assetId: "forge-pulse", volume: .25 * .85 * .8 }]);
});
test("physical collectible owns its identity-local visual without orphaned descendants", () => {
  const result = createSignalForgeDocument(source, prepared), entities = result.document.scenes[0].entities;
  const beacon = entities.find(e => e.id === "final-beacon");
  assert.equal(beacon.gameplay.collectible, true);
  assert.equal(beacon.collider.sensor, true);
  assert.equal(beacon.collider.mask, 2);
  assert.equal(beacon.visual.assetId, "model");
  assert.ok(!entities.some(e => e.parentId === "final-beacon"));
  assert.ok(entities.some(e => e.id === "final-beacon-model" && !e.visual && !e.parentId));
  const incompatible = structuredClone(source);
  incompatible.scenes[0].entities.find(e => e.id === "final-beacon-model").transform3d.position.x = .1;
  assert.throws(() => createSignalForgeDocument(incompatible, prepared), /identity-local/);
});
