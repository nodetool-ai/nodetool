import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL3D_STYLE,
  KEYFRAME_PROPERTIES,
  makeClip,
  resolveModel3DCamera,
  setKeyframe
} from "../src/index.js";
import type { ClipAnimation, TimelineClip } from "../src/index.js";
import { resolveAnimatedLayerProps } from "../src/render/sceneModel.js";

const CANVAS = { width: 1920, height: 1080 };

const clipWith = (
  animations: ClipAnimation[],
  overrides: Partial<TimelineClip> = {}
): TimelineClip =>
  makeClip({
    mediaType: "model3d",
    status: "generated",
    currentAssetId: "glb-1",
    startMs: 0,
    durationMs: 4000,
    model3dStyle: DEFAULT_MODEL3D_STYLE,
    animations,
    ...overrides
  });

const propsAt = (clip: TimelineClip, atMs: number) =>
  resolveAnimatedLayerProps({ clip, opacity: 1 }, atMs, CANVAS);

describe("orbit preset", () => {
  const orbit = (params?: ClipAnimation["params"]): ClipAnimation => ({
    id: "orbit-1",
    role: "loop",
    preset: "orbit",
    durationMs: 4000,
    params
  });

  it("sweeps the azimuth linearly across one cycle", () => {
    const clip = clipWith([orbit()]);
    expect(propsAt(clip, 0).cameraAzimuth).toBeCloseTo(0);
    expect(propsAt(clip, 1000).cameraAzimuth).toBeCloseTo(90);
    expect(propsAt(clip, 2000).cameraAzimuth).toBeCloseTo(180);
    expect(propsAt(clip, 3000).cameraAzimuth).toBeCloseTo(270);
  });

  it("takes its sweep from `degrees` and its sign from `direction`", () => {
    const half = clipWith([orbit({ degrees: 180 })]);
    expect(propsAt(half, 2000).cameraAzimuth).toBeCloseTo(90);

    const ccw = clipWith([orbit({ direction: "ccw" })]);
    expect(propsAt(ccw, 2000).cameraAzimuth).toBeCloseTo(-180);
  });

  it("drives only the azimuth — the other camera channels stay at identity", () => {
    const props = propsAt(clipWith([orbit()]), 2000);
    expect(props.cameraElevation).toBe(0);
    expect(props.cameraZoom).toBe(1);
    expect(props.cameraFov).toBe(0);
  });
});

describe("resolveModel3DCamera", () => {
  it("folds a keyframed cameraZoom multiplicatively onto the style's zoom", () => {
    const base = clipWith([], {
      model3dStyle: {
        ...DEFAULT_MODEL3D_STYLE,
        camera: { ...DEFAULT_MODEL3D_STYLE.camera, zoom: 3 }
      }
    });
    let clip = { ...base, animations: setKeyframe(base, "cameraZoom", 0, 1) };
    clip = { ...clip, animations: setKeyframe(clip, "cameraZoom", 4000, 3) };

    // Halfway the curve reads 2, so the camera is framed at 3 × 2 — a fold
    // that added would read 5.
    const anim = propsAt(clip, 2000);
    expect(anim.cameraZoom).toBeCloseTo(2);
    const camera = resolveModel3DCamera(clip.model3dStyle!, anim);
    expect(camera.zoom).toBeCloseTo(6);
  });

  it("adds the angular channels to the clip's own pose", () => {
    const camera = resolveModel3DCamera(DEFAULT_MODEL3D_STYLE, {
      cameraAzimuth: 90,
      cameraElevation: -10,
      cameraZoom: 1,
      cameraFov: 5
    });
    expect(camera.azimuthDeg).toBe(DEFAULT_MODEL3D_STYLE.camera.azimuthDeg + 90);
    expect(camera.elevationDeg).toBe(
      DEFAULT_MODEL3D_STYLE.camera.elevationDeg - 10
    );
    expect(camera.fovDeg).toBe(DEFAULT_MODEL3D_STYLE.camera.fovDeg + 5);
    expect(camera.mode).toBe("orbit");
  });

  it("is the identity when nothing drives the camera", () => {
    const props = propsAt(clipWith([]), 2000);
    expect(resolveModel3DCamera(DEFAULT_MODEL3D_STYLE, props)).toEqual(
      DEFAULT_MODEL3D_STYLE.camera
    );
  });
});

describe("camera channels on other clips", () => {
  it("are sampled but change nothing a non-3D layer draws", () => {
    // The same orbit animation on a text clip: the channels resolve, and the
    // layer's transform, opacity and effects are untouched — the way
    // `wipeProgress` is ignored without a mask.
    const text = clipWith(
      [
        {
          id: "orbit-1",
          role: "loop",
          preset: "orbit",
          durationMs: 4000
        }
      ],
      {
        mediaType: "text",
        model3dStyle: undefined,
        textStyle: { text: "hello" }
      }
    );
    const props = propsAt(text, 2000);
    expect(props.cameraAzimuth).toBeCloseTo(180);
    expect(props.transform).toEqual({
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 }
    });
    expect(props.opacity).toBe(1);
    expect(props.effects).toBeUndefined();
  });
});

describe("KEYFRAME_PROPERTIES", () => {
  it("offers the four camera channels", () => {
    expect(KEYFRAME_PROPERTIES).toContain("cameraAzimuth");
    expect(KEYFRAME_PROPERTIES).toContain("cameraElevation");
    expect(KEYFRAME_PROPERTIES).toContain("cameraZoom");
    expect(KEYFRAME_PROPERTIES).toContain("cameraFov");
  });
});
