import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adaptSunrush, sha256 } from "./adapt.mjs";
import { sunrushController, sunrushJsonState } from "./bindings.mjs";
import { indexSunrushTriangles, partitionSunrushScenery, weldSunrushGeometry } from "./geometry.mjs";
import { decodeGlb, encodeGlb } from "../blacksite/lossless-glb.mjs";
import { verifySunrushRun } from "./verify.mjs";

const source = JSON.parse(await readFile(new URL("../../../../../packages/game-runtime/samples/sunrush-kart/game.json", import.meta.url)));
test("converted button labels center their text line within the original panel", () => {
  const { document } = adaptSunrush(source, []);
  for (const button of source.ui.nodes.filter(node => node.kind === "button")) {
    const panel = document.ui.nodes.find(node => node.id === button.id);
    const label = document.ui.nodes.find(node => node.id === `${button.id}-label`);
    assert.equal(panel.width, button.width);
    assert.equal(panel.height, button.height);
    assert.equal(label.height, (button.size ?? 16) * 1.25);
    assert.equal(label.anchor.y, .5);
    assert.equal(label.pivot.y, .5);
    assert.equal(label.text, button.text);
    assert.ok(label.height < panel.height);
  }
});
test("preserves all31 source entities and10 unchanged original script bodies", () => {
  const before = JSON.stringify(source), result = adaptSunrush(source, []);
  assert.equal(JSON.stringify(source), before); assert.equal(result.document.scenes[0].entities.length, 38);
  assert.equal(result.provenance.originalScripts.length, 10);
  for (const e of source.scenes[0].entities) {
    assert.ok(result.document.scenes[0].entities.some(entity => entity.id === e.id));
    for (const behavior of e.behaviors ?? []) {
      assert.ok(result.document.scripts[0].source.includes(behavior.source));
      assert.ok(result.provenance.originalScripts.some(entry => entry.digest === sha256(behavior.source)));
    }
  }
  const markers = result.document.scenes[0].entities.filter(e => e.body);
  assert.equal(markers.length, 7); assert.ok(markers.every(e => e.collider.sensor && e.collider.mask === 0));
  assert.equal(result.document.scenes[0].entities.find(e => e.id === "kart-1").parentId, "native-heading-racer-1");
  assert.equal(result.document.scenes[0].entities.find(e => e.id === "camera").parentId, "native-heading-camera-rig");
  assert.ok(result.provenance.omissions.some(entry => entry.component === "setVisual.scale"));
});

const config = { roles: ["a", "b"], initialRotations: {}, headings: { a: "heading-a" }, omitDynamicScale: true, audio: [], music: { assetId: "score", volume: .252 } };
const input = state => ({ state, tick: 1, input: { actions: {}, move: [0, 0, 0] }, events: [], world: { get: id => ({ id, props: { number: 1 }, transform: { position: [1, 2, 3], rotation: [0, 0, 0, 1] } }) } });
test("setProp overlays commit after all roles read the same previous snapshot", () => {
  const observed = [];
  const originals = { a: () => ({ commands: [{ kind: "setProp", key: "number", value: 2 }] }), b: (i, world) => { observed.push(world.get("a").props.number); return {}; } };
  const first = sunrushController(input(null), originals, config);
  assert.equal(observed[0], 1); assert.equal(first.state.props.a.number, 2);
  sunrushController(input(first.state), originals, config); assert.equal(observed[1], 2);
});
test("pose ownership and source event targets survive native command translation", () => {
  const original = () => ({ commands: [{ kind: "setKinematicPose", position: { x: 4, y: 5, z: 6 }, rotation: [0, 1, 0, 0] }, { kind: "emit", event: "pulse-hit", target: { entityId: "b" } }] });
  const result = sunrushController(input(null), { a: original, b: () => ({}) }, config);
  assert.deepEqual(result.commands.find(c => c.kind === "setPosition"), { kind: "setPosition", entityId: "a", position: [4, 5, 6] });
  assert.equal(result.commands.find(c => c.kind === "setVisual").entityId, "heading-a");
  const emitted = result.commands.find(c => c.kind === "emit");
  assert.equal(emitted.entityId, undefined); assert.deepEqual(emitted.data.target, { entityId: "b" });
  let received;
  sunrushController({ ...input(result.state), events: [{ kind: "emit", name: emitted.name, data: emitted.data }] }, { a: () => ({}), b: i => { received = i.events[0]; return {}; } }, config);
  assert.deepEqual(received, { kind: "trigger", event: "pulse-hit", entityId: "a", target: { entityId: "b" }, payload: undefined });
});
test("keyboard axes and explicit analog axes reach original driving functions", () => {
  let observed;
  const originals = { a: i => { observed = i; return {}; }, b: () => ({}) };
  sunrushController({ ...input(null), input: { actions: { accelerate: true, steerLeft: true, drift: true }, move: [1, 0, 0], jump: true } }, originals, config);
  assert.deepEqual(observed.axes, { steer: -1, throttle: 1 }); assert.ok(observed.justPressed.includes("drift"));
  sunrushController({ ...input(null), input: { axes: { steer: .4, throttle: -.2 }, actions: { accelerate: true } } }, originals, config);
  assert.deepEqual(observed.axes, { steer: .4, throttle: -.2 });
});
test("unmapped commands and source components fail explicitly", () => {
  assert.throws(() => sunrushController(input(null), { a: () => ({ commands: [{ kind: "unknown" }] }), b: () => ({}) }, config), /Unmapped Sunrush command/);
  const changed = structuredClone(source); changed.scenes[0].entities[0].unsupported = {};
  assert.throws(() => adaptSunrush(changed, []), /Unmapped Sunrush component/);
});

test("scenery indexing and bounded partitioning preserve vertex bytes and selected roots", () => {
  const positions = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const gltf = { asset: { version: "2.0" }, buffers: [{ byteLength: positions.length }], bufferViews: [{ buffer: 0, byteLength: positions.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], nodes: [{ children: [1] }, { mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
  const bytes = encodeGlb(gltf, positions), indexed = indexSunrushTriangles(bytes), decoded = decodeGlb(indexed.bytes);
  assert.equal(indexed.indexedPrimitives, 1); assert.deepEqual(decoded.binary.subarray(0, positions.length), positions);
  const partition = partitionSunrushScenery(bytes, "test-course");
  assert.equal(partition.originalExpandedTriangleAttributesDigest, partition.adaptedExpandedTriangleAttributesDigest);
  assert.equal(partition.chunks.length, 1); assert.equal(partition.chunks[0].vertices, 3);
  const result = decodeGlb(partition.chunks[0].bytes).gltf;
  assert.deepEqual(result.scenes, gltf.scenes); assert.deepEqual(result.nodes[0].children, [1]);
  gltf.accessors[0].count = 4;
  assert.throws(() => indexSunrushTriangles(encodeGlb(gltf, positions)), /divisible by three/);
});

test("attribute-tuple welding retains negative zero, attributes and animated scene metadata", () => {
  const values = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, -0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const positions = Buffer.from(values.buffer);
  const gltf = { asset: { version: "2.0" }, buffers: [{ byteLength: positions.length }], bufferViews: [{ buffer: 0, byteLength: positions.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 6, type: "VEC3" }], materials: [{ extensions: { KHR_materials_emissive_strength: { emissiveStrength: 2.8 } } }], extensionsUsed: ["KHR_materials_emissive_strength"],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, COLOR_0: 0 }, material: 0 }] }], nodes: [{ mesh: 0 }, {}], scenes: [{ nodes: [0] }, { nodes: [1] }], scene: 0,
    animations: [{ name: "preserved", channels: [], samplers: [] }] };
  const welded = weldSunrushGeometry(encodeGlb(gltf, positions)), decoded = decodeGlb(welded.bytes);
  assert.equal(welded.originalVertices, 6); assert.equal(welded.weldedVertices, 4);
  assert.equal(welded.originalExpandedDigest, welded.weldedExpandedDigest);
  assert.deepEqual(decoded.gltf.animations, gltf.animations); assert.deepEqual(decoded.gltf.scenes, gltf.scenes);
  assert.deepEqual(decoded.gltf.materials, gltf.materials);
  const accessor = decoded.gltf.accessors[decoded.gltf.meshes[0].primitives[0].attributes.POSITION], view = decoded.gltf.bufferViews[accessor.bufferView];
  assert.equal(decoded.binary.readUInt32LE(view.byteOffset + 3 * 12), 0x80000000);
  const invalid = structuredClone(gltf); invalid.bufferViews[0].byteLength = 1;
  assert.throws(() => weldSunrushGeometry(encodeGlb(invalid, positions)), /outside/);
});

test("the actual active camera belongs to the nonphysical heading chain", () => {
  const scene = adaptSunrush(source, []).document.scenes[0];
  assert.equal(scene.activeCameraId, "camera");
  const camera = scene.entities.find(entity => entity.id === scene.activeCameraId);
  assert.ok(camera.camera3d); assert.equal(camera.body, undefined); assert.equal(camera.parentId, "native-heading-camera-rig");
  const heading = scene.entities.find(entity => entity.id === camera.parentId);
  assert.equal(heading.parentId, "camera-rig"); assert.equal(heading.body, undefined);
  const commands = sunrushController(input(null), { a: () => ({ commands: [{ kind: "setKinematicPose", position: { x: 0, y: 0, z: 0 }, rotation: [0, 1, 0, 0] }] }), b: () => ({}) }, { ...config, headings: { a: heading.id } }).commands;
  assert.ok(commands.some(command => command.kind === "setVisual" && command.entityId === heading.id));
});

test("strict route verification rejects missing gates, win or continuation replay", () => {
  const report = { valid: true, ticks: 3717, replayTicks: 1859, controller: { roles: { "racer-0": { phase: "finished", finished: true, lap: 3, gate: 13, finalPosition: 1, results: Array(6).fill("result"), finishTime: 58 } } },
    ui: { results: { visible: true }, "results-title": { text: "COASTLINE CHAMPION" } } };
  const observations = Array.from({ length: 3718 }, (_, tick) => ({ tick, events: [] }));
  for (const [index, lap] of [1, 2, 3].entries()) { observations[1000 + index * 1000].events.push({ name: "lap", data: { sourceEntityId: "racer-0", payload: { lap } } }); }
  for (const name of ["finish", "win", "drift", "boost", "pickup", "item"]) { observations[3705].events.push({ name }); }
  assert.equal(verifySunrushRun(report, observations).valid, true);
  const skipped = structuredClone(report); skipped.controller.roles["racer-0"].gate = 9;
  assert.throws(() => verifySunrushRun(skipped, observations));
  assert.throws(() => verifySunrushRun({ ...report, replayTicks: 0 }, observations));
  const missingWin = structuredClone(observations); missingWin[3705].events = missingWin[3705].events.filter(event => event.name !== "win");
  assert.throws(() => verifySunrushRun(report, missingWin));
});

test("original first-racing state has roles.racer-0.seen.0 hole that legacy JSON writes as null", () => {
  const entities = source.scenes[0].entities;
  const player = entities.find(entity => entity.id === "racer-0");
  const legacy = entity => ({ id: entity.id, props: entity.props ?? {}, position: entity.transform3d.position, rotation: entity.transform3d.rotation ?? [0, 0, 0, 1] });
  const world = { get: id => { const entity = entities.find(entity => entity.id === id); return entity ? legacy(entity) : null; } };
  const original = new Function("input", "world", `return (${player.behaviors[0].source})(input);`);
  const input = { tick: 0, entity: legacy(player), state: null, pressed: [], justPressed: ["start"], axes: { throttle: 1, steer: -.7212 }, events: [] };
  const countdown = original(input, world); countdown.state.countdown = 1;
  const racing = original({ ...input, tick: 179, state: countdown.state, justPressed: [] }, world).state;
  assert.equal(racing.seen.length, 6); assert.equal(Object.hasOwn(racing.seen, 0), false);
  const legacyJson = JSON.parse(JSON.stringify(racing)); assert.equal(legacyJson.seen[0], null);
  assert.throws(() => JSON.stringify(racing, (key, value) => { if (value === undefined) { throw new Error("native strict JSON rejects the hole"); } return value; }), /rejects the hole/);
  const normalized = sunrushJsonState(racing, "roles.racer-0");
  assert.deepEqual(normalized, legacyJson); assert.equal(Object.hasOwn(normalized.seen, 0), true);
  assert.throws(() => sunrushJsonState({ value: undefined }), /state.value/);
  assert.throws(() => sunrushJsonState([undefined]), /state.0/);
  assert.throws(() => sunrushJsonState({ value: NaN }), /state.value/);
});
