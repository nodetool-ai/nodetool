import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationMixer, Bone, Group, NumberKeyframeTrack, Box3, Quaternion, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { normalizeGameModel3D } from "../src/preparation3d.js";
import { skinnedGlb } from "./fixtures/game3d.js";
import { interpolateGameTransform3D, sampleGameAnimation3D } from "../src/renderer3d/index.js";

describe("explicit 3D presentation sampling", () => {
  it("samples independent animation instances and rewinds deterministically", () => {
    const first = new Group(); const firstBone = new Bone(); firstBone.name = "joint"; first.add(firstBone);
    const second = first.clone(true);
    const clip = new AnimationClip("move", 1, [new NumberKeyframeTrack("joint.position[x]", [0, 1], [0, 4])]);
    const firstMixer = new AnimationMixer(first); const secondMixer = new AnimationMixer(second);
    const state = { clipId: "clip:0", startTick: 0, playbackRate: 1, loop: false };
    sampleGameAnimation3D(firstMixer, [clip], state, 30);
    sampleGameAnimation3D(secondMixer, [clip], { ...state, startTick: 30 }, 30);
    expect(firstBone.position.x).toBeCloseTo(2);
    expect(second.getObjectByName("joint")?.position.x).toBe(0);
    sampleGameAnimation3D(firstMixer, [clip], state, 12);
    expect(firstBone.position.x).toBeCloseTo(0.8);
    sampleGameAnimation3D(firstMixer, [clip], state, 30);
    expect(firstBone.position.x).toBeCloseTo(2);
  });
  it("retains prepared scale, facing and ground basis when imported rig roots animate", async () => {
    const prepared = await normalizeGameModel3D(skinnedGlb(), { assetId: "rig", importSettings: { scale: 2, forward: "+z", origin: "centerGround" } });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) { return; }
    expect(prepared.binding.nodeIds).toEqual(["node:0", "node:1", "node:2"]);
    const gltf = await new GLTFLoader().parseAsync(new Uint8Array(prepared.bytes).buffer, "");
    const mixer = new AnimationMixer(gltf.scene);
    let mesh: SkinnedMesh | undefined;
    gltf.scene.traverse((object) => { if (object instanceof SkinnedMesh) { mesh = object; } });
    if (!mesh) { throw new Error("Prepared fixture has no skinned mesh"); }
    const skeletonMesh = mesh;
    const boundsAt = (clipId: string, tick: number): Box3 => {
      sampleGameAnimation3D(mixer, gltf.animations, { clipId, startTick: 0, playbackRate: 1, loop: false }, tick);
      gltf.scene.updateMatrixWorld(true); skeletonMesh.skeleton.update();
      const bounds = new Box3();
      for (let index = 0; index < skeletonMesh.geometry.attributes.position.count; index++) {
        bounds.expandByPoint(skeletonMesh.getVertexPosition(index, new Vector3()).applyMatrix4(skeletonMesh.matrixWorld));
      }
      return bounds;
    };
    const idle = boundsAt("clip:0", 30);
    expect(idle.min.y).toBeCloseTo(0); expect(idle.max.y).toBeCloseTo(2);
    const run = boundsAt("clip:1", 30);
    expect(run.min.x).toBeCloseTo(-2.5); expect(run.max.x).toBeCloseTo(-0.5);
    expect(run.min.y).toBeCloseTo(0); expect(run.max.y).toBeCloseTo(2);
    expect(boundsAt("clip:1", 12).getCenter(new Vector3()).x).toBeCloseTo(-0.6);
    expect(boundsAt("clip:1", 30)).toEqual(run);
    const jump = boundsAt("clip:2", 30);
    expect(jump.min.y).toBeCloseTo(1); expect(jump.max.y).toBeCloseTo(3);
    boundsAt("clip:3", 30);
    const joint = gltf.scene.getObjectByName("joint");
    if (!joint) { throw new Error("Prepared fixture has no joint"); }
    const facing = new Vector3(1, 0, 0).applyQuaternion(joint.getWorldQuaternion(new Quaternion()));
    expect(facing.x).toBeCloseTo(-Math.SQRT1_2); expect(facing.y).toBeCloseTo(Math.SQRT1_2);
    mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene); skeletonMesh.geometry.dispose();
  });
  it("interpolates world poses without mutating committed state", () => {
    const previous = { position: { x: 0, y: 0, z: 0 }, rotation: [0, 0, 0, 1] as [number, number, number, number], scale: { x: 1, y: 1, z: 1 } };
    const current = { ...previous, position: { x: 4, y: 2, z: -8 }, rotation: [0, 1, 0, 0] as [number, number, number, number] };
    const halfway = interpolateGameTransform3D(previous, current, 0.5);
    expect(halfway.position).toEqual({ x: 2, y: 1, z: -4 });
    expect(halfway.rotation[1]).toBeCloseTo(Math.SQRT1_2);
    expect(previous.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});
