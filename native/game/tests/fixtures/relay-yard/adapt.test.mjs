import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { adaptRelayYard, nativeId, sha256 } from "./adapt.mjs";
import { relayTrigger } from "./bindings.mjs";

const bytes = await readFile(new URL("../../../../../packages/game-runtime/samples/relay-yard/game.json", import.meta.url));
const source = JSON.parse(bytes);

test("retains all44 source entities and41 visuals, source materials, transforms and three verbatim script bodies", () => {
  assert.equal(sha256(bytes), "772e75d1f058a3469c900c5baedf18ea61ad485220b401af9cfef63333199eb7");
  const before = JSON.stringify(source), adapted = adaptRelayYard(source), scene = adapted.document.scenes[0];
  const originals = scene.entities.filter(entity => entity.props.sourceEntityId);
  assert.equal(originals.length, 44); assert.equal(scene.entities.filter(entity => entity.visual).length, 41);
  assert.equal(scene.entities.length, 46); assert.equal(adapted.provenance.originalScripts.length, 3);
  assert.equal(scene.entities.reduce((total, entity) => total + entity.behaviors.length, 0), 1);
  assert.equal(scene.entities.find(entity => entity.id === "player").behaviors[0].maxCommands, 16);
  for (const original of source.scenes[0].entities) {
    const entity = originals.find(entity => entity.props.sourceEntityId === original.id);
    assert.ok(entity, original.id);
    assert.equal(adapted.provenance.reverseIdMap[entity.id], original.id);
    if (original.id !== "camera") { assert.deepEqual(entity.transform.position, Object.values(original.transform3d.position)); assert.deepEqual(entity.transform.rotation, original.transform3d.rotation); }
    if (original.primitive && original.id !== "player-visual") { assert.deepEqual(entity.visual.material, original.primitive.material); assert.deepEqual(entity.visual.size, Object.values(original.primitive.dimensions)); }
    for (const behavior of original.behaviors) { if (behavior.kind === "script") { assert.ok(adapted.document.scripts.some(script => script.source.includes(`(${behavior.source})`))); } }
  }
  assert.deepEqual(scene.entities.find(entity => entity.id === "sun").light3d, source.scenes[0].entities.find(entity => entity.id === "sun").light3d);
  for (const key of ["background", "ambient", "shadows"]) { assert.deepEqual(scene.environment[key], source.scenes[0].environment[key]); }
  assert.equal(scene.entities.find(entity => entity.id === "crate").body.mass, 8);
  assert.equal(JSON.stringify(source), before);
});

test("maps dotted IDs reversibly and rejects ambiguous mappings and unknown components", () => {
  const adapted = adaptRelayYard(source);
  assert.match(nativeId("route-0.5"), /^[a-zA-Z0-9:_-]+$/);
  assert.equal(adapted.provenance.reverseIdMap[nativeId("route-0.5")], "route-0.5");
  const collision = structuredClone(source); collision.scenes[0].entities.push({ ...collision.scenes[0].entities[0], id: nativeId("route-0.5") });
  assert.throws(() => adaptRelayYard(collision), /ambiguous/);
  const unsupported = structuredClone(source); unsupported.scenes[0].entities[0].unknownVisual = {};
  assert.throws(() => adaptRelayYard(unsupported), /Unmapped Relay Yard component/);
});

test("preserves the original top-baseline HUD coordinates, text style and alignment", () => {
  const behavior = source.scenes[0].entities.find(entity => entity.id === "player").behaviors.find(entry => entry.kind === "script");
  const original = Function(`return (${behavior.source})`)();
  const commands = original({ state: null, events: [], justPressed: [], entity: { position: { x: 0, y: 1, z: 3 } } }).commands.filter(command => command.kind === "hud");
  const nodes = adaptRelayYard(source).document.ui.nodes;
  assert.equal(commands.length, 6);
  for (const command of commands) {
    const node = nodes.find(node => node.id === command.id);
    assert.deepEqual(node.offset, { x: command.x, y: command.y });
    assert.equal(node.size, command.size); assert.equal(node.text, command.text); assert.equal(node.color, command.color); assert.equal(node.align, command.align ?? "left");
  }
});

test("retains source capsule positions and indices in a bounded closed geometry-only GLB", () => {
  const adapted = adaptRelayYard(source), model = adapted.files.get("player-capsule.glb"), asset = adapted.document.assets[0];
  assert.equal(model.length, asset.size); assert.ok(model.length < 8 * 1024 * 1024); assert.equal(sha256(model), asset.digest);
  const jsonLength = model.readUInt32LE(12), gltf = JSON.parse(model.subarray(20, 20 + jsonLength).toString("utf8"));
  assert.equal(gltf.buffers[0].uri, undefined); assert.equal(gltf.images, undefined);
  const start = 28 + jsonLength;
  const slice = accessor => { const view = gltf.bufferViews[gltf.accessors[accessor].bufferView]; return model.subarray(start + view.byteOffset, start + view.byteOffset + view.byteLength); };
  const primitive = gltf.meshes[0].primitives[0];
  assert.equal(sha256(slice(primitive.attributes.POSITION)), "d30ab133639703b0e968da75c9c122be36466736d4ac72b5545312363b0d121f");
  assert.equal(sha256(slice(primitive.indices)), "b4bd7dfa1e3c7424a630152dce63e00f04b094d3c5a61f1245dc4999ce163497");
  assert.equal(adapted.provenance.capsule.vertices, 306); assert.equal(adapted.provenance.capsule.indices, 1632);
});

test("restricts both native collectible and trigger sensors to the player layer", () => {
  const scene = adaptRelayYard(source).document.scenes[0];
  assert.equal(scene.entities.find(entity => entity.id === "player").collider.layer, 1);
  assert.equal(scene.entities.find(entity => entity.id === "crate").collider.layer, 0);
  for (const entity of scene.entities.filter(entity => entity.collider?.sensor)) { assert.equal(entity.collider.mask, 2); }
  const input = { entityId: "switch", events: [{ sensor: true, phase: "enter", a: "switch", b: "crate" }] };
  assert.deepEqual(relayTrigger(input, "open-door", "player").commands, []);
  input.events[0].b = "player"; assert.deepEqual(relayTrigger(input, "open-door", "player").commands, [{ kind: "emit", name: "open-door" }]);
});

test("one controller validates initial cells, tracks distinct removals, preserves role targets and never fabricates score", () => {
  const adapted = adaptRelayYard(source), controller = Function(`return (${adapted.document.scripts[0].source})`)();
  const entities = new Map(adapted.document.scenes[0].entities.map(entity => [entity.id, structuredClone(entity)]));
  const input = { entityId: "player", tick: 0, world: { get: id => entities.get(id) ?? null }, input: {}, events: [], state: null };
  const run = events => { input.events = events; const result = controller(input); input.state = result.state; input.tick++; return result.commands; };
  const first = run([]);
  assert.ok(first.some(command => command.kind === "setPosition" && command.entityId === "moving-platform"));
  assert.ok(first.some(command => command.kind === "setVisual" && command.entityId === "camera"));
  assert.ok(first.every(command => command.kind !== "score"));
  entities.delete("pickup"); assert.ok(!run([]).some(command => command.name === "win"));
  assert.ok(!run([]).some(command => command.name === "win"));
  const entered = run([{ sensor: true, phase: "enter", a: "player", b: "door-switch-sensor-offset" }]);
  assert.ok(entered.some(command => command.name === "open-door"));
  assert.ok(!entered.some(command => command.kind === "setPosition" && command.entityId === "door"));
  const delivered = run([{ kind: "emit", name: "open-door" }]);
  assert.ok(delivered.some(command => command.entityId === "door" && command.position?.[1] === 4.5));
  assert.equal(input.state.roles.door.legacy.open, true); assert.equal(input.state.roles.player.legacy.saved, false);
  entities.delete("goal"); const finished = run([]);
  assert.equal(finished.filter(command => command.name === "win").length, 1); assert.ok(!finished.some(command => command.kind === "score"));
  assert.ok(!run([]).some(command => command.name === "win"));
  assert.throws(() => controller({ ...input, state: null }), /Initial Relay cell missing/);
});
