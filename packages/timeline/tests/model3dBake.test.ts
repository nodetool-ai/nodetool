/**
 * T11: the bake's sample list, its dependency hash, and the camera DTO.
 *
 * The list is what Blender renders — one model time and one camera per output
 * frame — so these are the assertions that a trim, a speed change, a reversed
 * remap and a camera preset reach the render at all. The hash is what decides
 * whether the result still plays.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL3D_STYLE,
  clipModel3DCameraFromBakeParams,
  computeModel3DBakeHash,
  makeClip,
  model3dBakeCameraParams,
  setKeyframe,
  type ClipModel3DCamera,
  type ClipModel3DStyle,
  type Model3DBakeRenderSettings,
  type TimelineClip
} from "../src/index.js";
import { computeModel3DBakeSamples } from "../src/render/model3dBakeSamples.js";

const SEQUENCE = { fps: 10, width: 1920, height: 1080 };

/** Long enough that nothing in the timing cases wraps or clamps by accident. */
const LONG = [{ name: "Take", durationSec: 60 }];

const opaque = (overrides: Partial<ClipModel3DStyle> = {}): ClipModel3DStyle => ({
  ...DEFAULT_MODEL3D_STYLE,
  background: { transparent: false, color: "#101010" },
  ...overrides
});

const model3dClip = (overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    id: "clip_1",
    trackId: "track_1",
    name: "Model",
    startMs: 2000,
    durationMs: 1000,
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_glb",
    model3dStyle: opaque(),
    ...overrides
  });

describe("computeModel3DBakeSamples", () => {
  it("resolves the in point and the speed at every output frame", () => {
    const clip = model3dClip({ inPointMs: 5000, speedMultiplier: 2 });
    const { frameTimes } = computeModel3DBakeSamples(clip, SEQUENCE, LONG);

    expect(frameTimes).toHaveLength(10);
    frameTimes.forEach((time, i) => {
      expect(time).toBeCloseTo(5 + (2 * i) / SEQUENCE.fps, 6);
    });
  });

  it("multiplies the animation speed on top of the clip's own", () => {
    const clip = model3dClip({
      inPointMs: 5000,
      speedMultiplier: 2,
      model3dStyle: opaque({
        animation: { ...DEFAULT_MODEL3D_STYLE.animation, speed: 3 }
      })
    });
    const { frameTimes } = computeModel3DBakeSamples(clip, SEQUENCE, LONG);
    frameTimes.forEach((time, i) => {
      expect(time).toBeCloseTo((5 + (2 * i) / SEQUENCE.fps) * 3, 6);
    });
  });

  it("plays the model backwards under a reversed time remap", () => {
    const clip = model3dClip({
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 4000 },
          { t: 1, sourceMs: 0 }
        ]
      }
    });
    const { frameTimes } = computeModel3DBakeSamples(clip, SEQUENCE, LONG);
    for (let i = 1; i < frameTimes.length; i += 1) {
      expect(frameTimes[i]!).toBeLessThan(frameTimes[i - 1]!);
    }
    expect(frameTimes[0]).toBeCloseTo(4, 6);
  });

  it("wraps past the animation's end with loop on", () => {
    // A 0.4 s animation under a 1 s clip: the model time runs 0 → 0.9 and
    // wraps twice.
    const clip = model3dClip();
    const { frameTimes } = computeModel3DBakeSamples(clip, SEQUENCE, [
      { name: "Take", durationSec: 0.4 }
    ]);
    expect(frameTimes.map((t) => Number(t.toFixed(3)))).toEqual([
      0, 0.1, 0.2, 0.3, 0, 0.1, 0.2, 0.3, 0, 0.1
    ]);
  });

  it("holds the last frame past the end with loop off", () => {
    const clip = model3dClip({
      model3dStyle: opaque({
        animation: { ...DEFAULT_MODEL3D_STYLE.animation, loop: false }
      })
    });
    const { frameTimes } = computeModel3DBakeSamples(clip, SEQUENCE, [
      { name: "Take", durationSec: 0.4 }
    ]);
    expect(frameTimes.map((t) => Number(t.toFixed(3)))).toEqual([
      0, 0.1, 0.2, 0.3, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4
    ]);
  });

  it("takes the named animation's length, not the longest", () => {
    const durations = [
      { name: "Short", durationSec: 0.4 },
      { name: "Long", durationSec: 60 }
    ];
    const clip = model3dClip({
      model3dStyle: opaque({
        animation: { ...DEFAULT_MODEL3D_STYLE.animation, clipName: "Short" }
      })
    });
    const { frameTimes } = computeModel3DBakeSamples(clip, SEQUENCE, durations);
    expect(frameTimes[5]).toBeCloseTo(0.1, 6);

    // With no name every animation plays, so the longest is what wraps.
    const all = computeModel3DBakeSamples(model3dClip(), SEQUENCE, durations);
    expect(all.frameTimes[5]).toBeCloseTo(0.5, 6);
  });

  it("renders the rest pose at every frame when the model has no animation", () => {
    const { frameTimes } = computeModel3DBakeSamples(model3dClip(), SEQUENCE, []);
    expect(frameTimes.every((t) => t === 0)).toBe(true);
  });

  it("sweeps the orbit preset's degrees across the clip", () => {
    const clip = model3dClip({
      animations: [
        {
          id: "orbit_1",
          role: "loop",
          preset: "orbit",
          durationMs: 1000,
          params: { degrees: 180 }
        }
      ]
    });
    const { cameras } = computeModel3DBakeSamples(clip, SEQUENCE, LONG);
    const base = DEFAULT_MODEL3D_STYLE.camera.azimuthDeg;
    expect(cameras[0]!.azimuthDeg).toBeCloseTo(base, 6);
    expect(cameras[5]!.azimuthDeg).toBeCloseTo(base + 90, 6);
    expect(cameras[9]!.azimuthDeg).toBeCloseTo(base + 162, 6);
    // The other three channels stay at the clip's authored pose.
    expect(cameras[5]!.elevationDeg).toBe(
      DEFAULT_MODEL3D_STYLE.camera.elevationDeg
    );
    expect(cameras[5]!.zoom).toBe(DEFAULT_MODEL3D_STYLE.camera.zoom);
  });

  it("refuses a clip with no style rather than baking a default one", () => {
    expect(() =>
      computeModel3DBakeSamples(
        model3dClip({ model3dStyle: undefined }),
        SEQUENCE,
        LONG
      )
    ).toThrow(/no model3dStyle/);
  });
});

describe("model3dBakeCameraParams", () => {
  const render: Model3DBakeRenderSettings = {
    engine: "cycles",
    samples: 64,
    denoise: false,
    resolutionPercentage: 50
  };

  it("maps a clip camera onto the job DTO", () => {
    const camera: ClipModel3DCamera = {
      mode: "orbit",
      azimuthDeg: 120,
      elevationDeg: -10,
      fovDeg: 50,
      zoom: 1.5,
      targetOffset: [1, 2, 3]
    };
    const params = model3dBakeCameraParams(camera, opaque(), render);
    expect(params).toMatchObject({
      camera_mode: "orbit",
      azimuth: 120,
      elevation: -10,
      fov: 50,
      zoom: 1.5,
      lighting: "studio",
      background_color: "#101010",
      transparent: false,
      engine: "cycles",
      samples: 64,
      denoise: false,
      resolution_percentage: 50,
      target_offset: [1, 2, 3]
    });
    expect(params.scene_camera_name).toBeUndefined();
  });

  it("carries a scene camera by name", () => {
    const camera: ClipModel3DCamera = {
      ...DEFAULT_MODEL3D_STYLE.camera,
      mode: "scene",
      sceneCameraName: "Shot02"
    };
    const params = model3dBakeCameraParams(camera, opaque(), render);
    expect(params.camera_mode).toBe("scene");
    expect(params.scene_camera_name).toBe("Shot02");
  });

  it("round-trips every field a clip camera owns", () => {
    for (const camera of [
      {
        mode: "orbit",
        azimuthDeg: 33,
        elevationDeg: 7,
        fovDeg: 28,
        zoom: 0.75
      } satisfies ClipModel3DCamera,
      {
        mode: "scene",
        azimuthDeg: 45,
        elevationDeg: 25,
        fovDeg: 35,
        zoom: 1,
        sceneCameraName: "Hero",
        targetOffset: [0, 0.5, -2]
      } satisfies ClipModel3DCamera
    ]) {
      expect(
        clipModel3DCameraFromBakeParams(
          model3dBakeCameraParams(camera, opaque(), render)
        )
      ).toEqual(camera);
    }
  });
});

describe("model3dBakeCameraParams in free mode", () => {
  const render: Model3DBakeRenderSettings = {
    engine: "eevee",
    samples: 16,
    denoise: true,
    resolutionPercentage: 100
  };
  const free: ClipModel3DCamera = {
    mode: "free",
    azimuthDeg: 45,
    elevationDeg: 25,
    fovDeg: 42,
    zoom: 1,
    position: [3, 2, -4],
    target: [-1, 0.5, 2],
    rollDeg: 37
  };

  it("sends the eye, the target, the roll and the lens", () => {
    const params = model3dBakeCameraParams(free, opaque(), render);
    expect(params.camera_mode).toBe("free");
    expect(params.position).toEqual([3, 2, -4]);
    expect(params.target).toEqual([-1, 0.5, 2]);
    expect(params.roll).toBe(37);
    expect(params.fov).toBe(42);
  });

  it("fills in the default pose so the op never has to know it", () => {
    const params = model3dBakeCameraParams(
      { ...DEFAULT_MODEL3D_STYLE.camera, mode: "free" },
      opaque(),
      render
    );
    expect(params.position).toEqual([0, 1.6, 5]);
    expect(params.target).toEqual([0, 1, 0]);
    expect(params.roll).toBe(0);
  });

  it("round-trips a free camera", () => {
    expect(
      clipModel3DCameraFromBakeParams(model3dBakeCameraParams(free, opaque(), render))
    ).toEqual(free);
  });

  it("samples the free channels per output frame", () => {
    let clip = model3dClip({
      durationMs: 1000,
      model3dStyle: { ...DEFAULT_MODEL3D_STYLE, camera: free }
    });
    clip = { ...clip, animations: setKeyframe(clip, "cameraPosX", 0, 0) };
    clip = { ...clip, animations: setKeyframe(clip, "cameraPosX", 1000, 10) };
    clip = { ...clip, animations: setKeyframe(clip, "cameraRoll", 0, 0) };
    clip = { ...clip, animations: setKeyframe(clip, "cameraRoll", 1000, 20) };
    const samples = computeModel3DBakeSamples(clip, { fps: 10, width: 640, height: 360 }, []);
    expect(samples.cameras).toHaveLength(10);
    expect(samples.cameras[0].position).toEqual([3, 2, -4]);
    expect(samples.cameras[5].position![0]).toBeCloseTo(8);
    expect(samples.cameras[5].rollDeg).toBeCloseTo(47);
    expect(samples.cameras[5].target).toEqual([-1, 0.5, 2]);
  });
});

describe("computeModel3DBakeHash for a free camera", () => {
  const sequence = { fps: 30, width: 1920, height: 1080 };
  const base = () =>
    model3dClip({
      model3dStyle: {
        ...DEFAULT_MODEL3D_STYLE,
        camera: {
          ...DEFAULT_MODEL3D_STYLE.camera,
          mode: "free",
          position: [0, 1, 4],
          target: [0, 1, 0],
          rollDeg: 0
        }
      }
    });
  const withCamera = (patch: Partial<ClipModel3DCamera>) => {
    const clip = base();
    return {
      ...clip,
      model3dStyle: {
        ...clip.model3dStyle!,
        camera: { ...clip.model3dStyle!.camera, ...patch }
      }
    };
  };

  it("changes with the mode, the position, the target and the roll", () => {
    const hash = computeModel3DBakeHash(base(), sequence);
    for (const patch of [
      { mode: "orbit" },
      { position: [0, 1, 5] },
      { target: [0, 2, 0] },
      { rollDeg: 5 }
    ] satisfies Partial<ClipModel3DCamera>[]) {
      expect(computeModel3DBakeHash(withCamera(patch), sequence)).not.toBe(hash);
    }
  });

  it("changes with a key on each free channel", () => {
    const clip = base();
    const hash = computeModel3DBakeHash(clip, sequence);
    for (const channel of [
      "cameraPosX",
      "cameraPosY",
      "cameraPosZ",
      "cameraTargetX",
      "cameraTargetY",
      "cameraTargetZ",
      "cameraRoll"
    ] as const) {
      const keyed = { ...clip, animations: setKeyframe(clip, channel, 500, 1) };
      expect(computeModel3DBakeHash(keyed, sequence)).not.toBe(hash);
    }
  });
});

describe("computeModel3DBakeHash", () => {
  const hashOf = (
    overrides: Partial<TimelineClip>,
    sequence = SEQUENCE
  ): string => computeModel3DBakeHash(model3dClip(overrides), sequence);

  const base = hashOf({});

  it("changes when an input of the picture changes", () => {
    expect(hashOf({ inPointMs: 500 })).not.toBe(base);
    expect(hashOf({ outPointMs: 900 })).not.toBe(base);
    expect(hashOf({ durationMs: 4000 })).not.toBe(base);
    expect(hashOf({ speedMultiplier: 2 })).not.toBe(base);
    expect(
      hashOf({
        timeRemap: {
          keyframes: [
            { t: 0, sourceMs: 0 },
            { t: 1, sourceMs: 500 }
          ]
        }
      })
    ).not.toBe(base);
    expect(
      hashOf({
        animations: [{ id: "orbit_1", role: "loop", preset: "orbit" }]
      })
    ).not.toBe(base);
    expect(hashOf({ model3dStyle: opaque({ lighting: "flat" }) })).not.toBe(base);
    expect(hashOf({ currentAssetId: "asset_other" })).not.toBe(base);
    expect(hashOf({}, { ...SEQUENCE, fps: 24 })).not.toBe(base);
    expect(hashOf({}, { ...SEQUENCE, width: 1280 })).not.toBe(base);
    expect(hashOf({}, { ...SEQUENCE, height: 720 })).not.toBe(base);
  });

  it("ignores everything that applies to the baked layer like any video", () => {
    expect(hashOf({ startMs: 9000 })).toBe(base);
    expect(hashOf({ opacity: 0.25 })).toBe(base);
    expect(hashOf({ trackId: "track_other" })).toBe(base);
    expect(hashOf({ effects: [{ type: "blur", radius: 6 }] })).toBe(base);
    expect(
      hashOf({ transform: { position: { x: 0.2, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } } })
    ).toBe(base);
  });

  it("ignores the bake it is compared against", () => {
    expect(
      hashOf({
        model3dStyle: opaque({
          bake: { assetId: "asset_bake", dependencyHash: base }
        })
      })
    ).toBe(base);
  });
});
