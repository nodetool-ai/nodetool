// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { gameModel3D, type GameAnimationPose3D } from "@nodetool-ai/protocol";
import { modelInstance } from "../src/renderer3d/assets/instances.js";
import { sampleGameAnimation3D, sampleGameAnimationPose3D } from "../src/renderer3d/animation/index.js";
import { prepareGameModel } from "../src/renderer3d/preparation.js";
import { syncGameScene } from "../src/renderer3d/scene-sync.js";
import { GameModelCache3D } from "../src/renderer3d/assets/cache.js";
import type { CachedModel, RenderInstance } from "../src/renderer3d/types.js";
import { blockoutFrame, glb } from "./fixtures/game3d.js";

function animatedGlb(named: boolean, cubic = false, stationary = false): Uint8Array {
  const rotation = [0, 0, Math.sin(0.3), Math.cos(0.3)];
  const rest = stationary ? { translation: [1, 2, 3], scale: [2, 3, 4], rotation } : { translation: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0, 1] };
  const values = [rest.translation, rest.scale, rest.rotation].map((value, index) => {
    const end = !stationary && index === 0 ? [2, 0, 0] : value;
    const zero = value.map(() => 0);
    return new Float32Array(cubic ? [...zero, ...value, ...zero, ...zero, ...end, ...zero] : [...value, ...end]);
  });
  const pieces = [new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Float32Array([0, 1]), ...values];
  let offset = 0;
  const bufferViews = pieces.map((piece) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: piece.byteLength };
    offset += piece.byteLength;
    return view;
  });
  const binary = new Uint8Array(offset);
  pieces.forEach((piece, index) => binary.set(new Uint8Array(piece.buffer), bufferViews[index]!.byteOffset));
  return glb({ asset: { version: "2.0" }, buffers: [{ byteLength: offset }], bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      ...values.map((_, index) => ({ bufferView: index + 2, componentType: 5126, count: cubic ? 6 : 2, type: index === 2 ? "VEC4" : "VEC3" }))
    ], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ ...(named ? { name: "pivot" } : {}), ...rest, children: [1] }, { name: "mesh", mesh: 0 }],
    scenes: [{ nodes: [0] }], scene: 0,
    animations: [
      { name: "all", samplers: values.map((_, index) => ({ input: 1, output: index + 2, interpolation: cubic ? "CUBICSPLINE" : "LINEAR" })),
        channels: ["translation", "scale", "rotation"].map((path, index) => ({ sampler: index, target: { node: 0, path } })) },
      { name: "sparse", samplers: [{ input: 1, output: 3, interpolation: cubic ? "CUBICSPLINE" : "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "scale" } }] }
    ]
  }, binary);
}

async function cached(named = true, cubic = false, stationary = false): Promise<CachedModel> {
  const bytes = animatedGlb(named, cubic, stationary);
  const prepared = await prepareGameModel(bytes);
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) { throw new Error("Actual animation GLB was rejected"); }
  const gltf = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, "");
  return { gltf, prepared: prepared.model };
}

const model = gameModel3D.parse({ assetId: "model" });
const pose: GameAnimationPose3D = { layers: [{ mode: "override", weight: 1,
  current: { startTick: 0, rate: 1, loop: false, clips: [{ clipId: "clip:0", weight: 1 }] } }] };
const state = { clipId: "clip:0", startTick: 0, playbackRate: 1, loop: false };

describe("actual GLB animation instance ownership", () => {
  it.each([false, true])("animates cloned %s-name pivots independently through graph and mixer paths", async (named) => {
    const source = await cached(named);
    const sourceTracks = source.gltf.animations.flatMap((clip) => clip.tracks.map((track) => ({ name: track.name, values: Array.from(track.values) })));
    const first = modelInstance(model, source);
    const second = modelInstance(model, source);
    if (!first.mixer || !second.mixer || !first.clips || !second.clips) { throw new Error("Missing animation instance"); }
    for (let clip = 0; clip < first.clips.length; clip++) {
      for (let track = 0; track < first.clips[clip]!.tracks.length; track++) {
        expect(first.clips[clip]!.tracks[track]!.times).toBe(source.gltf.animations[clip]!.tracks[track]!.times);
        expect(first.clips[clip]!.tracks[track]!.values).toBe(source.gltf.animations[clip]!.tracks[track]!.values);
      }
    }
    const pivot = first.object.children[0]!;
    const other = second.object.children[0]!;
    expect(pivot.uuid).not.toBe(source.gltf.scene.children[0]!.uuid);
    sampleGameAnimation3D(first.mixer, first.clips, state, 30);
    sampleGameAnimation3D(second.mixer, second.clips, state, 12);
    expect(pivot.position.x).toBeCloseTo(1);
    expect(other.position.x).toBeCloseTo(0.4);
    first.mixer.stopAllAction(); second.mixer.stopAllAction();
    sampleGameAnimationPose3D(first.object, first.clips, pose, 12);
    sampleGameAnimationPose3D(second.object, second.clips, pose, 30);
    expect(pivot.position.x).toBeCloseTo(0.4);
    expect(other.position.x).toBeCloseTo(1);
    expect(source.gltf.animations.flatMap((clip) => clip.tracks.map((track) => ({ name: track.name, values: Array.from(track.values) })))).toEqual(sourceTracks);
    expect(source.gltf.scene.children[0]!.position.x).toBe(0);
  });

  it.each([false, true])("keeps stationary nonidentity additive channels unchanged with cubic=%s", async (cubic) => {
    const source = await cached(true, cubic, true);
    const instance = modelInstance(model, source);
    if (!instance.clips) { throw new Error("Missing clips"); }
    const pivot = instance.object.children[0]!;
    const rest = { position: pivot.position.clone(), scale: pivot.scale.clone(), quaternion: pivot.quaternion.clone() };
    const additive: GameAnimationPose3D = { layers: pose.layers.map((layer) => ({ ...layer, mode: "additive" })) };
    for (const tick of [0, 30, 60, 0]) {
      sampleGameAnimationPose3D(instance.object, instance.clips, additive, tick);
      expect(pivot.position.distanceTo(rest.position)).toBeCloseTo(0);
      expect(pivot.scale.distanceTo(rest.scale)).toBeCloseTo(0);
      expect(Math.abs(pivot.quaternion.dot(rest.quaternion))).toBeCloseTo(1);
    }
  });

  it("copies the cubic reference independently of later interpolant samples", async () => {
    const source = await cached(true, true);
    const instance = modelInstance(model, source);
    if (!instance.clips) { throw new Error("Missing clips"); }
    sampleGameAnimationPose3D(instance.object, instance.clips, { layers: pose.layers.map((layer) => ({ ...layer, mode: "additive" })) }, 30);
    expect(instance.object.children[0]!.position.x).toBeCloseTo(1);
  });

  it.each(["none", "sparse", "graph"])("restores sampler-owned transforms across graph/mixer → %s at the same tick", async (next) => {
    const source = await cached();
    const cache = new GameModelCache3D({ canvas: document.createElement("canvas") }, new AbortController());
    cache.get = async () => source;
    const scene = new Scene();
    const instances = new Map<string, RenderInstance>();
    const frame = blockoutFrame();
    const previous = frame.entities[0]!;
    const entity = { entityId: previous.entityId, transform: { ...previous.transform, position: { x: 7, y: 8, z: 9 } }, previousTransform: previous.previousTransform, model };
    frame.tick = 30;
    frame.entities = [{ ...entity, ...(next === "graph" ? { animation: state } : { animationPose: pose }) }];
    await syncGameScene(scene, instances, cache, new AbortController().signal, frame, 1);
    expect(instances.get(entity.entityId)?.object.children[0]?.position.x).toBeCloseTo(1);
    frame.entities = [{ ...entity, ...(next === "graph" ? { animationPose: { layers: pose.layers.map((layer) => ({ ...layer, current: { ...layer.current, clips: [{ clipId: "clip:1", weight: 1 }] } })) } } : next === "sparse" ? { animation: { ...state, clipId: "clip:1" } } : {}) }];
    await syncGameScene(scene, instances, cache, new AbortController().signal, frame, 1);
    const fresh = new Map<string, RenderInstance>();
    await syncGameScene(new Scene(), fresh, cache, new AbortController().signal, frame, 1);
    const actual = instances.get(entity.entityId)!.object;
    const expected = fresh.get(entity.entityId)!.object;
    expect(actual.position.toArray()).toEqual([7, 8, 9]);
    expect(actual.children[0]!.position.toArray()).toEqual(expected.children[0]!.position.toArray());
    expect(actual.children[0]!.scale.toArray()).toEqual(expected.children[0]!.scale.toArray());
    expect(actual.children[0]!.quaternion.toArray()).toEqual(expected.children[0]!.quaternion.toArray());
  });
});
