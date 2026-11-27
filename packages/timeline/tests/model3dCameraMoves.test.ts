import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL3D_STYLE,
  MODEL3D_CAMERA_MOVES,
  MODEL3D_CAMERA_MOVE_SAMPLES,
  applyModel3DCameraMove,
  findKeyframeAnimation,
  keyframeValueAt,
  makeClip,
  model3dCameraMoveCurves,
  model3dCameraMovePoseAt,
  model3dFreeCameraBasis,
  model3dKeyframedFreeCameraPose,
  normalizeCustomCurves,
  setKeyframe
} from "../src/index.js";
import type {
  Model3DCameraMoveId,
  Model3DFreeCameraPose,
  TimelineClip
} from "../src/index.js";

const START: Model3DFreeCameraPose = {
  position: [0, 1, 4],
  target: [0, 1, 0],
  rollDeg: 0,
  fovDeg: 40
};

const DEG = Math.PI / 180;
const dist = (a: number[], b: number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const end = (move: Model3DCameraMoveId, amount?: number, start = START) =>
  model3dCameraMovePoseAt(move, start, 1, amount);

const freeClip = (overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    mediaType: "model3d",
    status: "generated",
    currentAssetId: "glb-1",
    startMs: 0,
    durationMs: 4000,
    model3dStyle: {
      ...DEFAULT_MODEL3D_STYLE,
      camera: {
        ...DEFAULT_MODEL3D_STYLE.camera,
        mode: "free",
        position: [...START.position],
        target: [...START.target],
        fovDeg: START.fovDeg
      }
    },
    ...overrides
  });

describe("MODEL3D_CAMERA_MOVES", () => {
  it("lists the ten moves with a label and a default amount", () => {
    expect(MODEL3D_CAMERA_MOVES.map((move) => move.id)).toEqual([
      "pan",
      "tilt",
      "orbit",
      "pushIn",
      "truck",
      "crane",
      "pedestal",
      "zoom",
      "dollyZoom",
      "dutch"
    ]);
    for (const move of MODEL3D_CAMERA_MOVES) {
      expect(move.label.length).toBeGreaterThan(0);
      expect(Number.isFinite(move.defaultAmount)).toBe(true);
      expect(move.properties.length).toBeGreaterThan(0);
    }
  });

  it("starts every move at the start pose", () => {
    for (const move of MODEL3D_CAMERA_MOVES) {
      expect(model3dCameraMovePoseAt(move.id, START, 0)).toEqual(START);
    }
  });

  it("changes only the channels each move declares", () => {
    const channelOf = (pose: Model3DFreeCameraPose): Record<string, number> => ({
      cameraPosX: pose.position[0],
      cameraPosY: pose.position[1],
      cameraPosZ: pose.position[2],
      cameraTargetX: pose.target[0],
      cameraTargetY: pose.target[1],
      cameraTargetZ: pose.target[2],
      cameraRoll: pose.rollDeg,
      cameraFov: pose.fovDeg
    });
    // An oblique start, so no channel is unchanged by coincidence of axes.
    const start: Model3DFreeCameraPose = {
      position: [3, 2, 4],
      target: [-1, 0.5, -2],
      rollDeg: 3,
      fovDeg: 40
    };
    const before = channelOf(start);
    for (const move of MODEL3D_CAMERA_MOVES) {
      const after = channelOf(model3dCameraMovePoseAt(move.id, start, 1));
      for (const [channel, value] of Object.entries(after)) {
        const declared = (move.properties as readonly string[]).includes(channel);
        if (declared) {
          expect(value, `${move.id} ${channel}`).not.toBeCloseTo(before[channel], 6);
        } else {
          expect(value, `${move.id} ${channel}`).toBeCloseTo(before[channel], 9);
        }
      }
    }
  });
});

describe("each move", () => {
  it("pan turns the view to the right and keeps the eye and the distance", () => {
    const pose = end("pan", 90);
    expect(pose.position).toEqual(START.position);
    expect(pose.target[0]).toBeCloseTo(4);
    expect(pose.target[1]).toBeCloseTo(1);
    expect(pose.target[2]).toBeCloseTo(4);
    expect(dist(pose.target, pose.position)).toBeCloseTo(4);
    expect(end("pan", -90).target[0]).toBeCloseTo(-4);
    expect(end("pan").target[0]).toBeCloseTo(4 * Math.sin(30 * DEG));
  });

  it("tilt turns the view up and stops short of straight up", () => {
    const pose = end("tilt", 30);
    expect(pose.position).toEqual(START.position);
    expect(pose.target[1]).toBeCloseTo(1 + 4 * Math.sin(30 * DEG));
    expect(pose.target[2]).toBeCloseTo(4 - 4 * Math.cos(30 * DEG));
    expect(dist(pose.target, pose.position)).toBeCloseTo(4);
    const capped = end("tilt", 500);
    const forward = model3dFreeCameraBasis(capped.position, capped.target).forward;
    expect(Math.asin(forward[1]) / DEG).toBeCloseTo(89);
  });

  it("orbit moves the eye to the camera's right on a circle around the target", () => {
    const pose = end("orbit", 90);
    expect(pose.target).toEqual(START.target);
    expect(pose.position[0]).toBeCloseTo(4);
    expect(pose.position[1]).toBeCloseTo(1);
    expect(pose.position[2]).toBeCloseTo(0);
    for (const progress of [0.1, 0.37, 0.8]) {
      const mid = model3dCameraMovePoseAt("orbit", START, progress, 90);
      expect(dist(mid.position, mid.target)).toBeCloseTo(4);
    }
  });

  it("pushIn moves the eye a fraction of the way to the target", () => {
    expect(end("pushIn").position).toEqual([0, 1, 4 - 0.3 * 4]);
    expect(end("pushIn", -0.5).position[2]).toBeCloseTo(6);
    expect(end("pushIn", 5).position[2]).toBeCloseTo(0.2);
    expect(end("pushIn").target).toEqual(START.target);
  });

  it("truck slides the eye and the target to the right", () => {
    const pose = end("truck", 0.5);
    expect(pose.position[0]).toBeCloseTo(2);
    expect(pose.target[0]).toBeCloseTo(2);
    expect(pose.position[2]).toBeCloseTo(4);
    expect(pose.target[2]).toBeCloseTo(0);
  });

  it("crane raises the eye and keeps the target", () => {
    const pose = end("crane", 0.5);
    expect(pose.position).toEqual([0, 3, 4]);
    expect(pose.target).toEqual(START.target);
  });

  it("pedestal raises the eye and the target together", () => {
    const pose = end("pedestal", 0.5);
    expect(pose.position).toEqual([0, 3, 4]);
    expect(pose.target).toEqual([0, 3, 0]);
  });

  it("zoom multiplies the focal length", () => {
    const pose = end("zoom", 2);
    const focal = (fov: number) => 12 / Math.tan((fov * DEG) / 2);
    expect(focal(pose.fovDeg)).toBeCloseTo(2 * focal(START.fovDeg));
    expect(pose.position).toEqual(START.position);
    expect(end("zoom", 0.5).fovDeg).toBeGreaterThan(START.fovDeg);
  });

  it("dollyZoom keeps the frame height at the target constant", () => {
    const size = (pose: Model3DFreeCameraPose) =>
      dist(pose.position, pose.target) * Math.tan((pose.fovDeg * DEG) / 2);
    for (const amount of [0.4, -0.5, 0.7]) {
      for (const progress of [0, 0.25, 0.5, 1]) {
        const pose = model3dCameraMovePoseAt("dollyZoom", START, progress, amount);
        expect(size(pose)).toBeCloseTo(size(START), 9);
      }
    }
    expect(end("dollyZoom").fovDeg).toBeGreaterThan(START.fovDeg);
    expect(end("dollyZoom").position[2]).toBeCloseTo(4 - 0.4 * 4);
  });

  it("dutch adds roll", () => {
    expect(end("dutch").rollDeg).toBe(15);
    expect(end("dutch", -20, { ...START, rollDeg: 5 }).rollDeg).toBe(-15);
  });

  it("refuses an unknown move", () => {
    expect(() =>
      model3dCameraMovePoseAt("spin" as Model3DCameraMoveId, START, 1)
    ).toThrow(/Unknown camera move/);
  });
});

describe("model3dCameraMoveCurves", () => {
  it("writes a straight move as two keyframes with the easing on the second", () => {
    const curves = model3dCameraMoveCurves("pushIn", START, { easing: "easeInOut" });
    expect(curves.map((curve) => curve.property)).toEqual([
      "cameraPosX",
      "cameraPosY",
      "cameraPosZ"
    ]);
    const z = curves[2].keyframes;
    expect(z).toHaveLength(2);
    expect(z[0]).toEqual({ t: 0, value: 0 });
    expect(z[1].t).toBe(1);
    expect(z[1].value).toBeCloseTo(-1.2);
    expect(z[1].easing).toBe("easeInOut");
  });

  it("samples an arc so every keyframe stays on the circle", () => {
    const curves = model3dCameraMoveCurves("orbit", START, { amount: 180 });
    const x = curves.find((curve) => curve.property === "cameraPosX")!.keyframes;
    const z = curves.find((curve) => curve.property === "cameraPosZ")!.keyframes;
    expect(x).toHaveLength(MODEL3D_CAMERA_MOVE_SAMPLES + 1);
    x.forEach((keyframe, i) => {
      const px = START.position[0] + keyframe.value;
      const pz = START.position[2] + z[i].value;
      expect(Math.hypot(px, pz)).toBeCloseTo(4);
      expect(keyframe.easing).toBeUndefined();
    });
    expect(x[x.length - 1].value).toBeCloseTo(0);
    expect(z[z.length - 1].value).toBeCloseTo(-8);
  });

  it("folds an easing into a sampled move's values", () => {
    const linear = model3dCameraMoveCurves("zoom", START, { samples: 4 });
    const eased = model3dCameraMoveCurves("zoom", START, { samples: 4, easing: "easeIn" });
    expect(eased[0].keyframes[4].value).toBeCloseTo(linear[0].keyframes[4].value);
    expect(Math.abs(eased[0].keyframes[1].value)).toBeLessThan(
      Math.abs(linear[0].keyframes[1].value)
    );
  });

  it("passes the gate every custom curve passes", () => {
    for (const move of MODEL3D_CAMERA_MOVES) {
      const result = normalizeCustomCurves(model3dCameraMoveCurves(move.id, START));
      expect(result.ok, move.id).toBe(true);
    }
  });
});

describe("applyModel3DCameraMove", () => {
  it("writes the move into the keyframe animation over its span", () => {
    const clip = freeClip();
    const animations = applyModel3DCameraMove(clip, "pushIn", {
      startMs: 1000,
      durationMs: 2000
    });
    const moved = { ...clip, animations };
    expect(findKeyframeAnimation(moved)).toBeDefined();
    expect(keyframeValueAt(moved, "cameraPosZ", 0)).toBeCloseTo(0);
    expect(keyframeValueAt(moved, "cameraPosZ", 1000)).toBeCloseTo(0);
    expect(keyframeValueAt(moved, "cameraPosZ", 2000)).toBeCloseTo(-0.6);
    expect(keyframeValueAt(moved, "cameraPosZ", 3000)).toBeCloseTo(-1.2);
    expect(keyframeValueAt(moved, "cameraPosZ", 4000)).toBeCloseTo(-1.2);
    expect(model3dKeyframedFreeCameraPose(moved, 3000).position[2]).toBeCloseTo(2.8);
  });

  it("starts a second move from where the first one left the camera", () => {
    let clip = freeClip();
    clip = {
      ...clip,
      animations: applyModel3DCameraMove(clip, "pushIn", { startMs: 0, durationMs: 2000, amount: 0.5 })
    };
    clip = {
      ...clip,
      animations: applyModel3DCameraMove(clip, "pushIn", { startMs: 2000, durationMs: 2000, amount: 0.5 })
    };
    expect(model3dKeyframedFreeCameraPose(clip, 2000).position[2]).toBeCloseTo(2);
    expect(model3dKeyframedFreeCameraPose(clip, 4000).position[2]).toBeCloseTo(1);
  });

  it("replaces keyframes inside the span and keeps the ones outside", () => {
    let clip = freeClip();
    clip = { ...clip, animations: setKeyframe(clip, "cameraRoll", 500, 3) };
    clip = { ...clip, animations: setKeyframe(clip, "cameraRoll", 2000, 40) };
    clip = {
      ...clip,
      animations: applyModel3DCameraMove(clip, "dutch", { startMs: 1000, durationMs: 2000, amount: 10 })
    };
    const curve = findKeyframeAnimation(clip)!.custom!.curves.find(
      (c) => c.property === "cameraRoll"
    )!;
    expect(curve.keyframes.map((kf) => kf.t)).toEqual([0.125, 0.25, 0.75]);
    const atStart = curve.keyframes[1].value;
    expect(curve.keyframes[2].value).toBeCloseTo(atStart + 10);
  });

  it("uses the rest of the clip when no duration is given", () => {
    const clip = freeClip();
    const moved = { ...clip, animations: applyModel3DCameraMove(clip, "dutch", { startMs: 1000 }) };
    expect(keyframeValueAt(moved, "cameraRoll", 4000)).toBeCloseTo(15);
    expect(keyframeValueAt(moved, "cameraRoll", 2500)).toBeCloseTo(7.5);
  });

  it("refuses a clip whose camera is not free", () => {
    const clip = freeClip({ model3dStyle: DEFAULT_MODEL3D_STYLE });
    expect(() => applyModel3DCameraMove(clip, "pan")).toThrow(/needs a free camera/);
  });

  it("refuses a move with no time to run", () => {
    expect(() => applyModel3DCameraMove(freeClip(), "pan", { startMs: 4000 })).toThrow(
      /no time to run/
    );
  });
});
