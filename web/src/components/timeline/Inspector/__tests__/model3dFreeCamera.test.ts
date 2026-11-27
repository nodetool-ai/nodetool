import {
  DEFAULT_MODEL3D_STYLE,
  MODEL3D_FREE_CAMERA_PROPERTIES,
  hasKeyframeAt,
  isPropertyKeyframed,
  keyframeValueAt,
  makeClip,
  model3dKeyframedFreeCameraPose,
  model3dStyleWithPatch,
  resolveModel3DCamera,
  setKeyframes,
  IDENTITY_MODEL3D_CAMERA_CHANNELS,
  type ClipModel3DCamera,
  type TimelineClip
} from "@nodetool-ai/timeline";

import {
  cameraMoveAmountDisplay,
  cameraMoveSpan,
  freeCameraGestureCamera,
  freeCameraPosePatch,
  isFreeCameraKeyed,
  keyFreeCameraPatch,
  orbitToFreeCameraPatch
} from "../model3dFreeCamera";

function clipWith(camera: Partial<ClipModel3DCamera>): TimelineClip {
  return makeClip({
    trackId: "t",
    name: "Set",
    startMs: 0,
    durationMs: 4000,
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "a".repeat(32),
    model3dStyle: model3dStyleWithPatch(DEFAULT_MODEL3D_STYLE, { camera })
  });
}

const free = () =>
  clipWith({ mode: "free", position: [0, 1, 5], target: [0, 1, 0], fovDeg: 40 });

const withPatch = (clip: TimelineClip, patch: Partial<TimelineClip> | null) => ({
  ...clip,
  ...patch
});

describe("keyFreeCameraPatch", () => {
  it("keys every free channel at the playhead without moving the camera", () => {
    const clip = free();
    const before = model3dKeyframedFreeCameraPose(clip, 1000);
    const next = withPatch(clip, keyFreeCameraPatch(clip, 1000));
    for (const property of MODEL3D_FREE_CAMERA_PROPERTIES) {
      expect(hasKeyframeAt(next, property, 1000)).toBe(true);
    }
    expect(model3dKeyframedFreeCameraPose(next, 1000)).toEqual(before);
  });

  it("holds the pose an existing move gives at that instant", () => {
    let clip = free();
    clip = {
      ...clip,
      animations: setKeyframes(clip, [{ property: "cameraPosZ", value: 0 }], 0)
    };
    clip = {
      ...clip,
      animations: setKeyframes(clip, [{ property: "cameraPosZ", value: -2 }], 4000)
    };
    const next = withPatch(clip, keyFreeCameraPatch(clip, 2000));
    expect(keyframeValueAt(next, "cameraPosZ", 2000)).toBeCloseTo(-1, 6);
    expect(hasKeyframeAt(next, "cameraRoll", 2000)).toBe(true);
  });

  it("writes nothing off the clip or on another camera mode", () => {
    expect(keyFreeCameraPatch(free(), null)).toBeNull();
    expect(keyFreeCameraPatch(clipWith({ mode: "orbit" }), 0)).toBeNull();
  });
});

describe("freeCameraPosePatch", () => {
  it("edits the authored pose while nothing is keyed", () => {
    const clip = free();
    const start = model3dKeyframedFreeCameraPose(clip, 0);
    const patch = freeCameraPosePatch(
      clip,
      start,
      { ...start, position: [1, 2, 3], fovDeg: 30 },
      0
    );
    expect(patch?.animations).toBeUndefined();
    expect(patch?.model3dStyle?.camera.position).toEqual([1, 2, 3]);
    expect(patch?.model3dStyle?.camera.fovDeg).toBe(30);
    expect(patch?.model3dStyle?.camera.target).toEqual([0, 1, 0]);
  });

  it("writes keys for the moved channels once the camera is keyed", () => {
    const base = free();
    const clip = withPatch(base, keyFreeCameraPatch(base, 0));
    const start = model3dKeyframedFreeCameraPose(clip, 2000);
    const patch = freeCameraPosePatch(
      clip,
      start,
      { ...start, position: [0, 1, 3] },
      2000
    );
    const next = withPatch(clip, patch);
    expect(patch?.model3dStyle).toBeUndefined();
    expect(next.model3dStyle?.camera.position).toEqual([0, 1, 5]);
    expect(keyframeValueAt(next, "cameraPosZ", 2000)).toBeCloseTo(-2, 6);
    expect(model3dKeyframedFreeCameraPose(next, 2000).position).toEqual([0, 1, 3]);
    // The key at the start still holds the first pose.
    expect(model3dKeyframedFreeCameraPose(next, 0).position).toEqual([0, 1, 5]);
    // Channels the gesture did not move get no new key.
    expect(hasKeyframeAt(next, "cameraPosX", 2000)).toBe(false);
  });

  it("returns null when nothing moved or a keyed camera has no instant", () => {
    const base = free();
    const start = model3dKeyframedFreeCameraPose(base, 0);
    expect(freeCameraPosePatch(base, start, start, 0)).toBeNull();
    const keyed = withPatch(base, keyFreeCameraPatch(base, 0));
    expect(
      freeCameraPosePatch(keyed, start, { ...start, rollDeg: 5 }, null)
    ).toBeNull();
  });
});

describe("freeCameraGestureCamera", () => {
  it("gives the authored camera that composes to the pose under the keys", () => {
    let clip = free();
    clip = {
      ...clip,
      animations: setKeyframes(clip, [{ property: "cameraPosZ", value: -2 }], 1000)
    };
    const pose = { ...model3dKeyframedFreeCameraPose(clip, 1000), position: [4, 1, 3] as [number, number, number] };
    const camera = freeCameraGestureCamera(clip, pose, 1000);
    const channels = {
      ...IDENTITY_MODEL3D_CAMERA_CHANNELS,
      cameraPosZ: keyframeValueAt(clip, "cameraPosZ", 1000)
    };
    const drawn = resolveModel3DCamera(
      { ...clip.model3dStyle!, camera },
      channels
    );
    expect(drawn.position).toEqual([4, 1, 3]);
  });
});

describe("orbitToFreeCameraPatch", () => {
  const fit = { center: [0, 1, 0] as const, radius: 2, aspect: 16 / 9 };

  it("switches to the free camera that draws the orbit picture", () => {
    const clip = clipWith({ mode: "orbit", azimuthDeg: 0, elevationDeg: 0 });
    const patch = orbitToFreeCameraPatch(clip, fit, 0);
    const camera = patch.model3dStyle!.camera;
    expect(camera.mode).toBe("free");
    expect(camera.target).toEqual([0, 1, 0]);
    expect(camera.position![0]).toBeCloseTo(0, 6);
    expect(camera.position![2]).toBeGreaterThan(2);
    // The orbit terms stay for the way back.
    expect(camera.azimuthDeg).toBe(0);
  });

  it("takes the keyed orbit pose at the playhead and keeps the authored lens", () => {
    let clip = clipWith({ mode: "orbit", azimuthDeg: 0, elevationDeg: 0, fovDeg: 40 });
    clip = {
      ...clip,
      animations: setKeyframes(
        clip,
        [
          { property: "cameraAzimuth", value: 90 },
          { property: "cameraFov", value: 10 }
        ],
        1000
      )
    };
    const camera = orbitToFreeCameraPatch(clip, fit, 1000).model3dStyle!.camera;
    // Azimuth 90 sits on +X.
    expect(camera.position![0]).toBeGreaterThan(2);
    expect(camera.position![2]).toBeCloseTo(0, 6);
    // cameraFov keeps folding in free mode, so the authored lens must not absorb it.
    expect(camera.fovDeg).toBe(40);
  });

  it("falls back to the default free pose without a fit", () => {
    const camera = orbitToFreeCameraPatch(clipWith({ mode: "orbit" }), null, 0)
      .model3dStyle!.camera;
    expect(camera.mode).toBe("free");
    expect(camera.position).toBeUndefined();
  });
});

describe("isFreeCameraKeyed", () => {
  it("is true once any free channel has a key", () => {
    const clip = free();
    expect(isFreeCameraKeyed(clip)).toBe(false);
    const keyed = withPatch(clip, keyFreeCameraPatch(clip, 0));
    expect(isFreeCameraKeyed(keyed)).toBe(true);
    expect(isPropertyKeyframed(keyed, "cameraFov")).toBe(true);
  });
});

describe("cameraMoveSpan", () => {
  it("runs from the playhead to the end of the clip", () => {
    expect(cameraMoveSpan({ durationMs: 4000 }, 1500)).toEqual({
      startMs: 1500,
      durationMs: 2500
    });
  });

  it("takes the whole clip when the playhead leaves no room", () => {
    expect(cameraMoveSpan({ durationMs: 4000 }, null)).toEqual({
      startMs: 0,
      durationMs: 4000
    });
    expect(cameraMoveSpan({ durationMs: 4000 }, 4000).startMs).toBe(0);
  });
});

describe("cameraMoveAmountDisplay", () => {
  it("shows a distance fraction as a percentage", () => {
    expect(cameraMoveAmountDisplay("distance")).toMatchObject({ scale: 100, unit: "%" });
    expect(cameraMoveAmountDisplay("degrees").unit).toBe("°");
    expect(cameraMoveAmountDisplay("factor").unit).toBe("×");
  });
});
