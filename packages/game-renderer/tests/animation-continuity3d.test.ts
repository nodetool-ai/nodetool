import { expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { gameDocument3D, gameSnapshot3D, gameInputFrame3D, type GameAnimationGraph3D, type GameRenderFrame3D } from "@nodetool-ai/protocol";
import { createGameSession3D, validateGame3D } from "@nodetool-ai/game-runtime";
import { prepareGameModel, prepareGameModelBinding3D } from "../src/preparation3d.js";
import { sampleGameAnimationPose3D } from "../src/renderer3d/animation/index.js";
import { buildStandaloneGame3D } from "../src/build3d.js";
import { glb } from "./fixtures/game3d.js";

function animatedGlb(constant = false): Uint8Array {
  const pieces = [new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
    new Float32Array([0, 0.5, 1]), new Float32Array([0, 1, 2]),
    ...[0, 10, 20].map(x => new Float32Array(constant ? [x, 0, 0, x, 0, 0, x, 0, 0] : [0, 0, 0, 1, 0, 0, 0, 0, 0]))];
  let offset = 0;
  const views = pieces.map(piece => { const view = { buffer: 0, byteOffset: offset, byteLength: piece.byteLength }; offset += piece.byteLength; return view; });
  const bytes = new Uint8Array(offset);
  pieces.forEach((piece, index) => bytes.set(new Uint8Array(piece.buffer), views[index].byteOffset));
  return glb({ asset: { version: "2.0" }, buffers: [{ byteLength: bytes.length }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
      ...[1, 2].map(bufferView => ({ bufferView, componentType: 5126, count: 3, type: "SCALAR" })),
      ...[3, 4, 5].map(bufferView => ({ bufferView, componentType: 5126, count: 3, type: "VEC3" }))],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0, name: "animated" }], scenes: [{ nodes: [0] }], scene: 0,
    animations: [0, 1, 2].map(index => ({ samplers: [{ input: index === 1 ? 2 : 1, output: index + 3 }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] }))
  }, bytes);
}
async function fixture(graph: GameAnimationGraph3D, constant = false, source?: string) {
  const bytes = animatedGlb(constant);
  const prepared = await prepareGameModelBinding3D(bytes, { assetId: "rig" });
  if (!prepared.ok) { throw new Error(JSON.stringify(prepared.diagnostics)); }
  const document = gameDocument3D.parse({ schemaVersion: 3, engineVersion: "2", dimension: "3d", id: "continuity", revision: "draft", entrySceneId: "scene",
    tickRate: 60, inputActions: [], presentation: { aspectRatio: 1, hudWidth: 128, hudHeight: 128 },
    assets: { rig: prepared.binding }, animationGraphs: { graph }, scenes: [{ id: "scene", name: "Scene", activeCameraId: "camera", entities: [
      { id: "camera", transform3d: { rotation: [0, Math.sin(0.1), 0, Math.cos(0.1)] }, camera3d: { projection: { kind: "perspective" }, behavior: { kind: "fixed" } } },
      { id: "rig", transform3d: {}, model: { assetId: "rig" }, animator3d: { graph: "graph", clips: { a: "clip:0", b: "clip:1", c: "clip:2" } },
        ...(source ? { behaviors: [{ kind: "script", source, maxTickMs: 20, maxCommands: 4 }] } : {}) }
    ] }] });
  const loaded = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, "");
  const node = loaded.scene.getObjectByName("animated");
  if (!node) { throw new Error("Animated node missing"); }
  const pose = (frame: GameRenderFrame3D, tick: number): number => {
    const request = frame.entities.find(entity => entity.entityId === "rig")?.animationPose;
    if (!request) { throw new Error("Public frame pose missing"); }
    sampleGameAnimationPose3D(loaded.scene, loaded.animations, request, tick);
    return node.position.x;
  };
  return { document, pose };
}
const input = gameInputFrame3D.parse({ pressed: [] });

it("does not scan animation keys after a decoded geometry budget rejection", async () => {
  const bytes = animatedGlb();
  const reads = vi.spyOn(DataView.prototype, "getFloat32");
  try {
    const result = await prepareGameModel(bytes, { budgets: { maxGeometryBytes: 35 } });
    expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.diagnostics.some(issue => issue.code === "model.geometryBudget")).toBe(true); }
    expect(reads).not.toHaveBeenCalled();
    expect((await prepareGameModel(bytes)).ok).toBe(true);
    expect(reads).toHaveBeenCalled();
  } finally { reads.mockRestore(); }
});

it("keeps normalized blend phase continuous after a long-running parameter change", async () => {
  const { document, pose } = await fixture({ parameters: { p: { kind: "float", default: 0.5 } }, layers: [{ id: "base", mode: "override", weight: 1, initialState: "move",
    states: { move: { motion: { kind: "blend1d", parameter: "p", points: [{ value: 0, clip: "a" }, { value: 1, clip: "b" }] }, speed: 1, loop: true } }, transitions: [] }] }, false,
    "input=>({state:null,commands:[{kind:'setAnimParam',name:'p',value:input.tick<6030?0.5:0.51}]})");
  const session = await createGameSession3D(document, 1);
  try {
    for (let tick = 1; tick <= 6030; tick += 1) { session.step(input); }
    expect(pose(session.frame(), 6030)).toBeCloseTo(0, 10);
    const saved = session.snapshot();
    const next = session.step(input).frame;
    // GLTFLoader evaluates FLOAT position channels into Float32 result buffers.
    expect(pose(next, 6031)).toBeCloseTo(Math.fround(2 / (60 * 1.51)), 10);
    expect(pose(next, 6030.5)).toBeCloseTo(Math.fround(1 / (60 * 1.51)), 10);
    const restored = await createGameSession3D(document, 1, saved);
    try {
      expect(restored.step(input).frame).toEqual(next);
      expect(restored.snapshot()).toEqual(session.snapshot());
      expect(pose(next, 6031)).toBeCloseTo(Math.fround(2 / (60 * 1.51)), 10);
    } finally { restored.dispose(); }
  } finally { session.dispose(); }
});

it("preserves the preceding fade interval when a completed fade immediately chains", async () => {
  const states = Object.fromEntries(["a", "b", "c"].map(clip => [clip, { motion: { kind: "clip" as const, clip }, speed: 1, loop: true }]));
  const { document, pose } = await fixture({ parameters: {}, layers: [{ id: "base", mode: "override", weight: 1, initialState: "a", states,
    transitions: [{ from: "a", to: "b", conditions: [], exitTicks: 1, durationTicks: 2 }, { from: "b", to: "c", conditions: [], exitTicks: 0, durationTicks: 2 }] }] }, true);
  const session = await createGameSession3D(document, 1);
  try {
    session.step(input);
    const saved = session.snapshot();
    const second = session.step(input).frame;
    const third = session.step(input).frame;
    expect(pose(second, 2)).toBe(5);
    expect(pose(third, 2)).toBe(5);
    expect(pose(third, 2.5)).toBe(7.5);
    expect(pose(third, 3)).toBe(10);
    const restored = await createGameSession3D(document, 1, saved);
    try {
      expect(restored.step(input).frame).toEqual(second);
      expect(restored.step(input).frame).toEqual(third);
      expect(restored.snapshot()).toEqual(session.snapshot());
    } finally { restored.dispose(); }
  } finally { session.dispose(); }
});

it.each([false, true])("bounds chained interval state and restores 120 ticks from 60 with constant clips=%s", async (constant) => {
  const names = ["a", "b", "c"];
  const states = Object.fromEntries(names.map(clip => [clip, { motion: { kind: "clip" as const, clip }, speed: 1, loop: true }]));
  const { document, pose } = await fixture({ parameters: {}, layers: [{ id: "base", mode: "override", weight: 1, initialState: "a", states,
    transitions: names.map((from, index) => ({ from, to: names[(index + 1) % names.length], conditions: [], exitTicks: 1, durationTicks: 1 })) }] }, constant);
  const session = await createGameSession3D(document, 1);
  try {
    const results: ReturnType<typeof session.step>[] = [];
    let saved;
    let previous = session.frame();
    for (let tick = 1; tick <= 120; tick += 1) {
      const result = session.step(input);
      results.push(result);
      expect(pose(result.frame, tick - 1)).toBe(pose(previous, tick - 1));
      const snapshot = session.snapshot();
      expect(gameSnapshot3D.parse(snapshot)).toEqual(snapshot);
      const layer = snapshot.entities.find(entity => entity.id === "rig")?.animationGraph?.layers[0];
      expect(layer?.phase?.value).toBeGreaterThanOrEqual(0);
      expect(layer?.phase?.value).toBeLessThanOrEqual(1);
      if (layer?.priorInterval) { expect(layer.priorInterval).not.toHaveProperty("priorInterval"); }
      if (tick === 60) { saved = gameSnapshot3D.parse(JSON.parse(JSON.stringify(snapshot))); }
      previous = result.frame;
    }
    if (!saved) { throw new Error("Missing tick60 snapshot"); }
    const restored = await createGameSession3D(document, 1, saved);
    try {
      for (let tick = 60; tick < 120; tick += 1) {
        const result = restored.step(input);
        expect(result).toEqual(results[tick]);
        pose(result.frame, tick + 0.25);
        pose(result.frame, tick + 0.75);
        expect(pose(result.frame, tick + 1)).toBe(pose(results[tick].frame, tick + 1));
      }
      expect(restored.snapshot()).toEqual(session.snapshot());
    } finally { restored.dispose(); }
  } finally { session.dispose(); }
});

it("derives durations from verified bytes and diagnoses legacy or inconsistent bindings", async () => {
  const graph: GameAnimationGraph3D = { parameters: { p: { kind: "float", default: 0.5 } }, layers: [{ id: "base", mode: "override", weight: 1, initialState: "move",
    states: { move: { motion: { kind: "blend1d", parameter: "p", points: [{ value: 0, clip: "a" }, { value: 1, clip: "b" }] }, speed: 1, loop: true } }, transitions: [] }] };
  const { document, pose } = await fixture(graph);
  const binding = document.assets.rig;
  if (binding.mediaKind !== "model") { throw new Error("Model binding missing"); }
  expect(binding.clipDurations).toEqual({ "clip:0": 1, "clip:1": 2, "clip:2": 1 });
  const invalidMetadata = structuredClone(document);
  const invalidBinding = invalidMetadata.assets.rig;
  if (invalidBinding.mediaKind !== "model") { throw new Error("Model binding missing"); }
  for (const durations of [{ "clip:0000": 1 }, { "clip:0": Number.POSITIVE_INFINITY }, { "clip:0": 2 ** -150 }, Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`clip:${index}`, 1]))]) {
    invalidBinding.clipDurations = durations;
    expect(gameDocument3D.safeParse(invalidMetadata).success).toBe(false);
  }
  const old = structuredClone(document);
  const oldBinding = old.assets.rig;
  if (oldBinding.mediaKind !== "model") { throw new Error("Legacy model missing"); }
  delete oldBinding.clipDurations;
  expect(validateGame3D(old).warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "legacy_animation_phase", message: expect.stringContaining("Reprepare") })]));
  binding.clipDurations = { "clip:0": 1 };
  expect(validateGame3D(document).diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "invalid_animation_duration" })]));
  binding.clipDurations = { "clip:0": 1, "clip:1": 3, "clip:2": 1 };
  const session = await createGameSession3D(document, 1);
  try { expect(() => pose(session.step(input).frame, 1)).toThrow("Prepared clip duration changed"); }
  finally { session.dispose(); }
  const output = await mkdtemp(join(tmpdir(), "animation-duration-export-"));
  try {
    await expect(buildStandaloneGame3D({ document, outputDir: join(output, "game"), resolveAsset: async () => ({ bytes: animatedGlb(), mimeType: "model/gltf-binary" }) }))
      .rejects.toThrow("Prepared clip durations changed");
  } finally { await rm(output, { recursive: true, force: true }); }
});

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])("rejects malformed actual animation time %s", async (value) => {
  const bytes = animatedGlb();
  const view = new DataView(bytes.buffer);
  const binaryStart = 28 + view.getUint32(12, true);
  // The first timeline is [0,0.5,1]. Its last key must be finite and greater than0.5.
  view.setFloat32(binaryStart + 36 + 8, value, true);
  const result = await prepareGameModelBinding3D(bytes, { assetId: "rig" });
  expect(result.ok).toBe(false);
  if (!result.ok) { expect(result.diagnostics.some(issue => issue.code === "model.animationTime" || issue.code === "model.malformed")).toBe(true); }
});

it.each([false, true])("preserves the fractional interval across a phase boundary with loop=%s", async (loop) => {
  const { document, pose } = await fixture({ parameters: {}, layers: [{ id: "base", mode: "override", weight: 1, initialState: "move",
    states: { move: { motion: { kind: "clip", clip: "a" }, speed: 8, loop } }, transitions: [] }] });
  const session = await createGameSession3D(document, 1);
  try {
    for (let tick = 1; tick <= 7; tick += 1) { session.step(input); }
    const previous = session.frame();
    const current = session.step(input).frame;
    expect(pose(current, 7)).toBe(pose(previous, 7));
    expect(pose(current, 7.5)).toBeCloseTo(0, 10);
    expect(pose(current, 8)).toBeCloseTo(loop ? Math.fround(2 / 15) : 0, 10);
  } finally { session.dispose(); }
});
