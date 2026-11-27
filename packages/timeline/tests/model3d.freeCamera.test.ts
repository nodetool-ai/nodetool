import { describe, expect, it } from "vitest";

import {
  ANIMATED_PROPERTIES,
  ANIMATED_PROPERTY_FOLD,
  DEFAULT_FREE_CAMERA_POSITION,
  DEFAULT_FREE_CAMERA_TARGET,
  DEFAULT_MODEL3D_STYLE,
  IDENTITY_MODEL3D_CAMERA_CHANNELS,
  MODEL3D_CAMERA_PROPERTIES,
  MODEL3D_FREE_CAMERA_PROPERTIES,
  computeModel3DOrbitFraming,
  focalLengthMmToFovDeg,
  fovDegToFocalLengthMm,
  keyframePropertiesFor,
  makeClip,
  model3dCameraPropertiesFor,
  model3dFreeCameraBasis,
  model3dFreeCameraPose,
  model3dOrbitOffset,
  orbitCameraToFree,
  resolveModel3DCamera,
  setKeyframe
} from "../src/index.js";
import type { ClipModel3DCamera, ClipModel3DStyle } from "../src/index.js";
import { clipModel3DCamera } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { resolveAnimatedLayerProps } from "../src/render/sceneModel.js";

const freeStyle = (camera: Partial<ClipModel3DCamera> = {}): ClipModel3DStyle => ({
  ...DEFAULT_MODEL3D_STYLE,
  camera: { ...DEFAULT_MODEL3D_STYLE.camera, mode: "free", ...camera }
});

const FREE_CHANNELS = [
  "cameraPosX",
  "cameraPosY",
  "cameraPosZ",
  "cameraTargetX",
  "cameraTargetY",
  "cameraTargetZ",
  "cameraRoll"
] as const;

describe("free camera channels", () => {
  it("declares the seven channels as additive", () => {
    for (const channel of FREE_CHANNELS) {
      expect(ANIMATED_PROPERTIES).toContain(channel);
      expect(ANIMATED_PROPERTY_FOLD[channel]).toBe("add");
      expect(MODEL3D_CAMERA_PROPERTIES).toContain(channel);
      expect(IDENTITY_MODEL3D_CAMERA_CHANNELS[channel]).toBe(0);
    }
  });

  it("offers the free channels and the lens to a free camera", () => {
    expect(model3dCameraPropertiesFor("free")).toEqual(
      MODEL3D_FREE_CAMERA_PROPERTIES
    );
    expect(model3dCameraPropertiesFor("free")).toContain("cameraFov");
    expect(model3dCameraPropertiesFor("orbit")).not.toContain("cameraPosX");
    expect(model3dCameraPropertiesFor("scene")).toEqual([]);
    expect(keyframePropertiesFor({ mediaType: "model3d" })).toContain("cameraRoll");
    expect(keyframePropertiesFor({ mediaType: "image" })).not.toContain("cameraRoll");
  });

  it("samples a keyed free channel through the scene model", () => {
    let clip = makeClip({
      mediaType: "model3d",
      status: "generated",
      currentAssetId: "glb-1",
      startMs: 0,
      durationMs: 2000,
      model3dStyle: freeStyle({ position: [1, 2, 3] })
    });
    clip = { ...clip, animations: setKeyframe(clip, "cameraPosX", 0, 0) };
    clip = { ...clip, animations: setKeyframe(clip, "cameraPosX", 2000, 4) };
    clip = { ...clip, animations: setKeyframe(clip, "cameraRoll", 2000, 30) };
    const props = resolveAnimatedLayerProps(
      { clip, opacity: 1 },
      1000,
      { width: 1920, height: 1080 }
    );
    expect(props.cameraPosX).toBeCloseTo(2);
    expect(props.cameraRoll).toBeCloseTo(30);
    const camera = resolveModel3DCamera(clip.model3dStyle!, props);
    expect(camera.position).toEqual([3, 2, 3]);
    expect(camera.rollDeg).toBeCloseTo(30);
  });

  it("is at identity on a layer with no animation", () => {
    const clip = makeClip({
      mediaType: "model3d",
      startMs: 0,
      durationMs: 1000,
      model3dStyle: freeStyle()
    });
    const props = resolveAnimatedLayerProps(
      { clip, opacity: 1 },
      500,
      { width: 100, height: 100 }
    );
    for (const channel of FREE_CHANNELS) expect(props[channel]).toBe(0);
  });
});

describe("resolveModel3DCamera in free mode", () => {
  it("adds the channels onto the authored position, target and roll", () => {
    const camera = resolveModel3DCamera(
      freeStyle({ position: [1, 2, 3], target: [0, 1, 0], rollDeg: 5, fovDeg: 40 }),
      {
        ...IDENTITY_MODEL3D_CAMERA_CHANNELS,
        cameraPosX: 1,
        cameraPosY: -1,
        cameraPosZ: 2,
        cameraTargetX: 0.5,
        cameraTargetY: 0.25,
        cameraTargetZ: -1,
        cameraRoll: 10,
        cameraFov: -5
      }
    );
    expect(camera.mode).toBe("free");
    expect(camera.position).toEqual([2, 1, 5]);
    expect(camera.target).toEqual([0.5, 1.25, -1]);
    expect(camera.rollDeg).toBe(15);
    expect(camera.fovDeg).toBe(35);
  });

  it("falls back to the default eye and target", () => {
    const camera = resolveModel3DCamera(freeStyle(), IDENTITY_MODEL3D_CAMERA_CHANNELS);
    expect(camera.position).toEqual([0, 1.6, 5]);
    expect(camera.target).toEqual([0, 1, 0]);
    expect(camera.rollDeg).toBe(0);
    expect([...DEFAULT_FREE_CAMERA_POSITION]).toEqual([0, 1.6, 5]);
    expect([...DEFAULT_FREE_CAMERA_TARGET]).toEqual([0, 1, 0]);
  });

  it("keeps the orbit terms stored so a mode switch loses nothing", () => {
    const camera = resolveModel3DCamera(
      freeStyle({ azimuthDeg: 70, elevationDeg: 10, zoom: 2, targetOffset: [1, 0, 0] }),
      IDENTITY_MODEL3D_CAMERA_CHANNELS
    );
    expect(camera.azimuthDeg).toBe(70);
    expect(camera.elevationDeg).toBe(10);
    expect(camera.zoom).toBe(2);
    expect(camera.targetOffset).toEqual([1, 0, 0]);
  });

  it("leaves the free fields as stored in orbit mode", () => {
    const style: ClipModel3DStyle = {
      ...DEFAULT_MODEL3D_STYLE,
      camera: { ...DEFAULT_MODEL3D_STYLE.camera, position: [1, 2, 3], rollDeg: 4 }
    };
    const camera = resolveModel3DCamera(style, {
      ...IDENTITY_MODEL3D_CAMERA_CHANNELS,
      cameraPosX: 9,
      cameraRoll: 9
    });
    expect(camera.position).toEqual([1, 2, 3]);
    expect(camera.rollDeg).toBe(4);
    expect(camera.target).toBeUndefined();
  });

  it("does not mutate the style", () => {
    const style = freeStyle({ position: [1, 2, 3] });
    const pose = model3dFreeCameraPose(style.camera);
    pose.position[0] = 99;
    expect(style.camera.position).toEqual([1, 2, 3]);
  });
});

describe("protocol schema", () => {
  it("keeps the free fields through a parse", () => {
    const camera: ClipModel3DCamera = {
      mode: "free",
      azimuthDeg: 45,
      elevationDeg: 25,
      fovDeg: 35,
      zoom: 1,
      position: [1, 2, 3],
      target: [0, 1, 0],
      rollDeg: -12
    };
    expect(clipModel3DCamera.parse(camera)).toEqual(camera);
  });
});

describe("model3dFreeCameraBasis", () => {
  it("looks down -Z with +X right and +Y up by default", () => {
    const basis = model3dFreeCameraBasis([0, 0, 5], [0, 0, 0]);
    expect(basis.forward).toEqual([0, 0, -1]);
    expect(basis.right[0]).toBeCloseTo(1);
    expect(basis.up[1]).toBeCloseTo(1);
  });

  it("turns the horizon clockwise in the picture for a positive roll", () => {
    const flat = model3dFreeCameraBasis([0, 0, 5], [0, 0, 0], 0);
    const rolled = model3dFreeCameraBasis([0, 0, 5], [0, 0, 0], 30);
    // World up, seen by the rolled camera: screen x is along `right`, screen
    // y along `up`. Clockwise from 12 o'clock is positive x, positive y.
    const worldUp: [number, number, number] = [0, 1, 0];
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const screenX = dot(worldUp, rolled.right);
    const screenY = dot(worldUp, rolled.up);
    expect(screenX).toBeCloseTo(Math.sin(Math.PI / 6));
    expect(screenY).toBeCloseTo(Math.cos(Math.PI / 6));
    // The camera's own up leans to its left.
    expect(dot(rolled.up, flat.right)).toBeCloseTo(-0.5);
    expect(rolled.forward).toEqual(flat.forward);
  });

  it("stays orthonormal for an arbitrary pose", () => {
    const { forward, right, up } = model3dFreeCameraBasis([3, 2, -4], [-1, 0.5, 2], 37);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    for (const axis of [forward, right, up]) expect(dot(axis, axis)).toBeCloseTo(1);
    expect(dot(forward, right)).toBeCloseTo(0);
    expect(dot(forward, up)).toBeCloseTo(0);
    expect(dot(right, up)).toBeCloseTo(0);
  });

  it("handles a camera looking straight down and a zero-length view", () => {
    const down = model3dFreeCameraBasis([0, 5, 0], [0, 0, 0]);
    expect(down.right).toEqual([1, 0, 0]);
    expect(down.up[2]).toBeCloseTo(-1);
    expect(model3dFreeCameraBasis([1, 1, 1], [1, 1, 1]).forward).toEqual([0, 0, -1]);
  });
});

describe("lens conversion", () => {
  it("uses a 24 mm sensor height", () => {
    expect(focalLengthMmToFovDeg(12)).toBeCloseTo(90);
    expect(focalLengthMmToFovDeg(50)).toBeCloseTo(26.9915, 3);
    expect(focalLengthMmToFovDeg(35)).toBeCloseTo(37.8493, 3);
    expect(fovDegToFocalLengthMm(90)).toBeCloseTo(12);
  });

  it("round-trips", () => {
    for (const mm of [14, 24, 35, 50, 85, 135]) {
      expect(fovDegToFocalLengthMm(focalLengthMmToFovDeg(mm))).toBeCloseTo(mm, 9);
    }
  });
});

describe("orbitCameraToFree", () => {
  const fit = { center: [0.5, 0.25, -1] as const, radius: 2, aspect: 4 / 3 };
  const orbit: ClipModel3DCamera = {
    mode: "orbit",
    azimuthDeg: 30,
    elevationDeg: 20,
    fovDeg: 40,
    zoom: 1.2
  };

  it("lands on the golden orbit position the render core and Blender share", () => {
    const framing = computeModel3DOrbitFraming(2, 40, 4 / 3, 1.2);
    expect(framing.distance).toBeCloseTo(4.873, 3);
    const offset = model3dOrbitOffset(30, 20, framing.distance);
    expect(offset[0]).toBeCloseTo(2.2896, 3);
    const free = orbitCameraToFree(orbit, fit);
    expect(free.mode).toBe("free");
    expect(free.position![0]).toBeCloseTo(2.7896, 3);
    expect(free.position![1]).toBeCloseTo(1.9167, 3);
    expect(free.position![2]).toBeCloseTo(2.9656, 3);
    expect(free.target).toEqual([0.5, 0.25, -1]);
    expect(free.rollDeg).toBe(0);
    expect(free.fovDeg).toBe(40);
  });

  it("looks at the offset target and keeps the orbit terms", () => {
    const free = orbitCameraToFree({ ...orbit, targetOffset: [1, 0, 0] }, fit);
    expect(free.target).toEqual([1.5, 0.25, -1]);
    expect(free.azimuthDeg).toBe(30);
    expect(free.zoom).toBe(1.2);
    expect(free.targetOffset).toEqual([1, 0, 0]);
  });

  it("returns a camera that is not in orbit mode unchanged", () => {
    const scene: ClipModel3DCamera = { ...orbit, mode: "scene" };
    expect(orbitCameraToFree(scene, fit)).toEqual(scene);
  });
});
