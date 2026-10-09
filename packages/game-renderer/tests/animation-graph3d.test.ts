import { describe, expect, it } from "vitest";
import { AnimationClip, Bone, Group, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { gameInputFrame3D, type GameAnimationPose3D, type GameDocument3D } from "@nodetool-ai/protocol";
import { createGameSession3D, createNative3DGame } from "@nodetool-ai/game-runtime";
import { normalizeGameModel3D } from "../src/preparation3d.js";
import { sampleGameAnimationPose3D } from "../src/renderer3d/index.js";
import { skinnedGlb } from "./fixtures/game3d.js";

function rig() {
  const root = new Group();
  const hips = new Bone(); hips.name = "hips"; hips.userData.gameNodeId = "node:0";
  const arm = new Bone(); arm.name = "arm"; arm.userData.gameNodeId = "node:1"; arm.position.set(0, 1, 0);
  root.add(hips); hips.add(arm);
  const clips = [
    new AnimationClip("idle", 1, [new VectorKeyframeTrack("hips.position", [0, 1], [0, 0, 0, 0, 0, 0])]),
    new AnimationClip("walk", 1, [new VectorKeyframeTrack("hips.position", [0, 1], [0, 0, 0, 2, 0, 0])]),
    new AnimationClip("run", 2, [new VectorKeyframeTrack("hips.position", [0, 2], [0, 0, 0, 8, 0, 0])]),
    new AnimationClip("wave", 1, [new QuaternionKeyframeTrack("arm.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, Math.SQRT1_2, Math.SQRT1_2])]),
    new AnimationClip("lift", 1, [new VectorKeyframeTrack("arm.position", [0, 1], [0, 1, 0, 0, 3, 0]), new VectorKeyframeTrack("hips.position", [0, 1], [0, 0, 0, 0, 0, 9])])
  ];
  return { root, hips, arm, clips };
}

const motion = (clips: { clipId: string; weight: number }[], startTick = 0, loop = true) => ({ startTick, rate: 1, loop, clips });

describe("animation graph pose sampling", () => {
  it("blends weighted clips on one normalized phase and is independent of sampling history", () => {
    const { root, hips, clips } = rig();
    const pose: GameAnimationPose3D = { layers: [{ mode: "override", weight: 1, current: motion([{ clipId: "clip:1", weight: 0.5 }, { clipId: "clip:2", weight: 0.5 }]) }] };
    // Blended duration is 1.5 s. At 45 ticks the phase is 0.5: walk is at 0.5 s (x = 1), run at 1 s (x = 4).
    sampleGameAnimationPose3D(root, clips, pose, 45);
    expect(hips.position.x).toBeCloseTo(2.5);
    sampleGameAnimationPose3D(root, clips, pose, 10);
    sampleGameAnimationPose3D(root, clips, pose, 45);
    expect(hips.position.x).toBeCloseTo(2.5);
  });

  it("crossfades from the previous state over the transition ticks", () => {
    const { root, hips, clips } = rig();
    const pose = (tick: number): number => {
      sampleGameAnimationPose3D(root, clips, { layers: [{ mode: "override", weight: 1, transitionTicks: 10,
        current: motion([{ clipId: "clip:1", weight: 1 }], 30, false), previous: motion([{ clipId: "clip:0", weight: 1 }]) }] }, tick);
      return hips.position.x;
    };
    expect(pose(30)).toBeCloseTo(0);
    // At tick 35, walk has run 5 ticks (x = 1/6) at half weight.
    expect(pose(35)).toBeCloseTo(1 / 12);
    expect(pose(40)).toBeCloseTo(1 / 3);
  });

  it("limits masked layers to the listed nodes and their descendants", () => {
    const { root, hips, arm, clips } = rig();
    sampleGameAnimationPose3D(root, clips, { layers: [
      { mode: "override", weight: 1, current: motion([{ clipId: "clip:1", weight: 1 }]) },
      { mode: "override", weight: 0.5, mask: ["node:1"], current: motion([{ clipId: "clip:4", weight: 1 }], 0, false) }
    ] }, 60);
    expect(hips.position.x).toBeCloseTo(0);
    expect(hips.position.z).toBeCloseTo(0);
    expect(arm.position.y).toBeCloseTo(2);
  });

  it("adds additive layers as offsets from each clip's first keyframe", () => {
    const { root, arm, clips } = rig();
    sampleGameAnimationPose3D(root, clips, { layers: [
      { mode: "override", weight: 1, current: motion([{ clipId: "clip:0", weight: 1 }]) },
      { mode: "additive", weight: 1, current: motion([{ clipId: "clip:4", weight: 1 }, { clipId: "clip:3", weight: 0 }], 0, false) }
    ] }, 30);
    expect(arm.position.y).toBeCloseTo(2);
    sampleGameAnimationPose3D(root, clips, { layers: [
      { mode: "override", weight: 1, current: motion([{ clipId: "clip:0", weight: 1 }]) },
      { mode: "additive", weight: 0.5, current: motion([{ clipId: "clip:3", weight: 1 }], 0, false) }
    ] }, 60);
    expect(arm.quaternion.angleTo(new Quaternion())).toBeCloseTo(Math.PI / 4);
    expect(() => sampleGameAnimationPose3D(root, clips, { layers: [{ mode: "override", weight: 1, current: motion([{ clipId: "clip:9", weight: 1 }]) }] }, 0))
      .toThrow("Prepared animation clip clip:9 does not exist");
  });

  it("drives idle, walk and run by speed from a simulated graph", async () => {
    const prepared = await normalizeGameModel3D(skinnedGlb(), { assetId: "rig" });
    if (!prepared.ok) { throw new Error("Rig fixture failed preparation"); }
    const document: GameDocument3D = createNative3DGame("a".repeat(32));
    document.assets.rig = prepared.binding;
    document.animationGraphs = { locomotion: { parameters: { speed: { kind: "float", default: 0 } }, layers: [{ id: "base", mode: "override", weight: 1, initialState: "move",
      states: { move: { motion: { kind: "blend1d", parameter: "speed", points: [{ value: 0, clip: "idle" }, { value: 2, clip: "walk" }, { value: 6, clip: "run" }] }, speed: 1, loop: true } },
      transitions: [] }] } };
    const visual = document.scenes[0].entities.find((entity) => entity.id === "player-visual");
    if (!visual) { throw new Error("Player visual fixture is missing"); }
    delete visual.primitive;
    visual.model = { assetId: "rig", castShadow: false, receiveShadow: false };
    // The fixture rig has idle (still), run (x from 0 to 1.5) and jump (y from 0 to 1). Jump stands in for walk.
    visual.animator3d = { clips: { idle: "clip:0", walk: "clip:2", run: "clip:1" }, playbackRate: 1, loop: true, transitionTicks: 6, graph: "locomotion" };
    visual.behaviors = [{ kind: "script", maxTickMs: 50, maxCommands: 4,
      source: "input=>({state:null,commands:[{kind:'setAnimParam',name:'speed',value:input.tick<60?1:input.tick<120?4:6}]})" }];
    const gltf = await new GLTFLoader().parseAsync(new Uint8Array(prepared.bytes).buffer, "");
    const joint = gltf.scene.getObjectByName("joint");
    if (!joint) { throw new Error("Rig joint is missing"); }
    const sequence = async (): Promise<string[]> => {
      const session = await createGameSession3D(document, 1);
      const samples: string[] = [];
      try {
        for (let tick = 1; tick <= 180; tick += 1) {
          const { frame } = session.step(gameInputFrame3D.parse({ pressed: [] }));
          const pose = frame.entities.find((entity) => entity.entityId === "player-visual")?.animationPose;
          if (!pose) { throw new Error("Graph pose is missing"); }
          sampleGameAnimationPose3D(gltf.scene, gltf.animations, pose, tick);
          if (tick % 30 === 15) { samples.push(`${joint.position.x.toFixed(4)},${joint.position.y.toFixed(4)}`); }
        }
      } finally { session.dispose(); }
      return samples;
    };
    const first = await sequence();
    // Ticks 15 and 45 blend idle and walk (y only), 75 and 105 blend walk and run, 135 and 165 run alone (x only).
    expect(first.map((sample) => sample.split(",").map(Number))).toEqual([
      [0, expect.closeTo(0.125, 3)], [0, expect.closeTo(0.375, 3)],
      [expect.closeTo(0.1875, 3), expect.closeTo(0.125, 3)], [expect.closeTo(0.5625, 3), expect.closeTo(0.375, 3)],
      [expect.closeTo(0.375, 3), 0], [expect.closeTo(1.125, 3), 0]
    ]);
    expect(await sequence()).toEqual(first);
  });
});
