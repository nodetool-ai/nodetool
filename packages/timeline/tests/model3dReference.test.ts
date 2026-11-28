/**
 * The Blockout reference of a `model3d` clip: its dependency hash, its
 * staleness, its fixed look and size, and the frames it is rendered from.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_MODEL3D_STYLE,
  MODEL3D_REFERENCE_BACKGROUND,
  MODEL3D_REFERENCE_MAX_SIDE,
  computeModel3DBakeHash,
  computeModel3DReferenceHash,
  isModel3DReferenceStale,
  makeClip,
  model3dBlockoutTakeKey,
  model3dReferenceSession,
  model3dReferenceSize,
  model3dReferenceStatus,
  setKeyframe,
  type ClipModel3DStyle,
  type TimelineClip
} from "../src/index.js";
import { computeModel3DBakeSamples } from "../src/render/model3dBakeSamples.js";
import { computeModel3DReferenceFrames } from "../src/render/model3dReferenceSamples.js";

const SEQUENCE = { fps: 10, width: 1920, height: 1080 };
const LONG = [{ name: "Take", durationSec: 60 }];

const freeStyle = (overrides: Partial<ClipModel3DStyle> = {}): ClipModel3DStyle => ({
  ...DEFAULT_MODEL3D_STYLE,
  camera: {
    ...DEFAULT_MODEL3D_STYLE.camera,
    mode: "free",
    position: [0, 1.6, 5],
    target: [0, 1, 0],
    rollDeg: 0
  },
  ...overrides
});

const blockoutClip = (overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    id: "clip_1",
    trackId: "track_1",
    name: "Set",
    startMs: 2000,
    durationMs: 1000,
    mediaType: "model3d",
    sourceType: "imported",
    status: "generated",
    currentAssetId: "asset_glb",
    model3dStyle: freeStyle(),
    ...overrides
  });

const withReference = (clip: TimelineClip): TimelineClip => ({
  ...clip,
  model3dStyle: {
    ...clip.model3dStyle!,
    reference: {
      assetId: "asset_ref",
      dependencyHash: computeModel3DReferenceHash(clip, SEQUENCE, "clay"),
      pass: "clay"
    }
  }
});

describe("computeModel3DReferenceHash", () => {
  const base = blockoutClip();
  const hash = computeModel3DReferenceHash(base, SEQUENCE, "clay");

  it("is stable for an unchanged clip", () => {
    expect(computeModel3DReferenceHash(blockoutClip(), SEQUENCE, "clay")).toBe(hash);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it.each<[string, TimelineClip]>([
    ["the asset", blockoutClip({ currentAssetId: "asset_other" })],
    [
      "the free camera position",
      blockoutClip({
        model3dStyle: freeStyle({
          camera: { ...freeStyle().camera, position: [1, 1.6, 5] }
        })
      })
    ],
    [
      "the free camera target",
      blockoutClip({
        model3dStyle: freeStyle({
          camera: { ...freeStyle().camera, target: [0, 1.2, 0] }
        })
      })
    ],
    [
      "the roll",
      blockoutClip({
        model3dStyle: freeStyle({ camera: { ...freeStyle().camera, rollDeg: 5 } })
      })
    ],
    [
      "the lens",
      blockoutClip({
        model3dStyle: freeStyle({ camera: { ...freeStyle().camera, fovDeg: 20 } })
      })
    ],
    [
      "the animation choice",
      blockoutClip({
        model3dStyle: freeStyle({
          animation: { ...freeStyle().animation, clipName: "Walk" }
        })
      })
    ],
    ["the duration", blockoutClip({ durationMs: 1500 })],
    ["the in point", blockoutClip({ inPointMs: 200 })],
    ["the speed", blockoutClip({ speedMultiplier: 2 })]
  ])("changes with %s", (_label, changed) => {
    expect(computeModel3DReferenceHash(changed, SEQUENCE, "clay")).not.toBe(hash);
  });

  it.each([
    "cameraPosX",
    "cameraPosY",
    "cameraPosZ",
    "cameraTargetX",
    "cameraTargetY",
    "cameraTargetZ",
    "cameraRoll",
    "cameraFov"
  ] as const)("changes when the %s channel is keyed", (property) => {
    const keyed = {
      ...base,
      animations: setKeyframe(base, property, 1000, 1)
    };
    expect(computeModel3DReferenceHash(keyed, SEQUENCE, "clay")).not.toBe(hash);
  });

  it("changes with a key's easing", () => {
    const linear = { ...base, animations: setKeyframe(base, "cameraPosX", 1000, 1) };
    const eased = {
      ...base,
      animations: setKeyframe(base, "cameraPosX", 1000, 1, "easeOutCubic")
    };
    expect(computeModel3DReferenceHash(eased, SEQUENCE, "clay")).not.toBe(
      computeModel3DReferenceHash(linear, SEQUENCE, "clay")
    );
  });

  it("changes with the sequence fps and size, and with the pass", () => {
    expect(
      computeModel3DReferenceHash(base, { ...SEQUENCE, fps: 24 }, "clay")
    ).not.toBe(hash);
    expect(
      computeModel3DReferenceHash(base, { ...SEQUENCE, width: 1080 }, "clay")
    ).not.toBe(hash);
    expect(computeModel3DReferenceHash(base, SEQUENCE, "depth")).not.toBe(hash);
    expect(computeModel3DReferenceHash(base, SEQUENCE, "normal")).not.toBe(
      computeModel3DReferenceHash(base, SEQUENCE, "depth")
    );
  });

  it("ignores the clip's lighting, light intensity and background", () => {
    for (const style of [
      freeStyle({ lighting: "flat" }),
      freeStyle({ lightIntensity: 3 }),
      freeStyle({ background: { transparent: false, color: "#ff0000" } }),
      freeStyle({ background: { transparent: true } })
    ]) {
      expect(
        computeModel3DReferenceHash(
          blockoutClip({ model3dStyle: style }),
          SEQUENCE,
          "clay"
        )
      ).toBe(hash);
    }
  });

  it("ignores where the clip sits and how it is composited", () => {
    const moved = blockoutClip({ startMs: 9000, trackId: "track_9", opacity: 0.4 });
    expect(computeModel3DReferenceHash(moved, SEQUENCE, "clay")).toBe(hash);
  });

  it("ignores a stored bake and a stored reference", () => {
    const stored = blockoutClip({
      model3dStyle: freeStyle({
        bake: { assetId: "asset_bake", dependencyHash: "x" },
        reference: { assetId: "asset_ref", dependencyHash: "y", pass: "depth" }
      })
    });
    expect(computeModel3DReferenceHash(stored, SEQUENCE, "clay")).toBe(hash);
  });
});

describe("computeModel3DBakeHash with a stored reference", () => {
  it("is not changed by storing a reference", () => {
    const clip = blockoutClip();
    expect(computeModel3DBakeHash(withReference(clip), SEQUENCE)).toBe(
      computeModel3DBakeHash(clip, SEQUENCE)
    );
  });
});

describe("model3dReferenceStatus", () => {
  it("is missing with no stored reference, and that is not stale", () => {
    const clip = blockoutClip();
    expect(model3dReferenceStatus(clip, SEQUENCE)).toBe("missing");
    expect(isModel3DReferenceStale(clip, SEQUENCE)).toBe(false);
  });

  it("is current while the clip is unchanged", () => {
    const clip = withReference(blockoutClip());
    expect(model3dReferenceStatus(clip, SEQUENCE)).toBe("current");
    expect(isModel3DReferenceStale(clip, SEQUENCE)).toBe(false);
  });

  it("goes stale when the camera is keyed after the render", () => {
    const clip = withReference(blockoutClip());
    const keyed = { ...clip, animations: setKeyframe(clip, "cameraPosZ", 1000, -2) };
    expect(model3dReferenceStatus(keyed, SEQUENCE)).toBe("stale");
    expect(isModel3DReferenceStale(keyed, SEQUENCE)).toBe(true);
  });

  it("stays current when only the lighting changes", () => {
    const clip = withReference(blockoutClip());
    const relit = {
      ...clip,
      model3dStyle: { ...clip.model3dStyle!, lighting: "flat" as const }
    };
    expect(model3dReferenceStatus(relit, SEQUENCE)).toBe("current");
  });

  it("is stale for a caller that asks for another pass", () => {
    const clip = withReference(blockoutClip());
    expect(model3dReferenceStatus(clip, SEQUENCE, { pass: "clay" })).toBe("current");
    expect(model3dReferenceStatus(clip, SEQUENCE, { pass: "depth" })).toBe("stale");
  });

  // The set editor saves the model in place, so the asset id never changes.
  it("goes stale when the set was saved after the render", () => {
    const clip = withReference(blockoutClip());
    const stored: TimelineClip = {
      ...clip,
      model3dStyle: {
        ...clip.model3dStyle!,
        reference: { ...clip.model3dStyle!.reference!, assetRevision: "2026-11-01T10:00:00Z" }
      }
    };
    expect(model3dReferenceStatus(stored, SEQUENCE, { assetRevision: "2026-11-01T10:00:00Z" })).toBe("current");
    expect(model3dReferenceStatus(stored, SEQUENCE, { assetRevision: "2026-11-02T09:00:00Z" })).toBe("stale");
    expect(isModel3DReferenceStale(stored, SEQUENCE, "2026-11-02T09:00:00Z")).toBe(true);
    // A caller that does not know the revision judges by the hash alone.
    expect(model3dReferenceStatus(stored, SEQUENCE)).toBe("current");
    // A reference stored before revisions were recorded is stale once one is known.
    expect(model3dReferenceStatus(clip, SEQUENCE, { assetRevision: "2026-11-01T10:00:00Z" })).toBe("stale");
  });
});

describe("model3dBlockoutTakeKey", () => {
  it("adds the set revision to the hash, so a take made before a set edit reads as stale", () => {
    expect(model3dBlockoutTakeKey("abc")).toBe("abc");
    expect(model3dBlockoutTakeKey("abc", "r1")).toBe("abc@r1");
    expect(model3dBlockoutTakeKey("abc", "r1")).not.toBe(model3dBlockoutTakeKey("abc", "r2"));
  });
});

describe("model3dReferenceSession", () => {
  it("fixes the lighting and an opaque neutral background", () => {
    const session = model3dReferenceSession(
      freeStyle({
        lighting: "flat",
        lightIntensity: 4,
        background: { transparent: true },
        animation: { clipName: "Walk", loop: false, speed: 2 }
      })
    );
    expect(session).toEqual({
      lighting: "studio",
      lightIntensity: 1,
      background: { transparent: false, color: MODEL3D_REFERENCE_BACKGROUND },
      animation: { clipName: "Walk", loop: false, speed: 2 }
    });
  });
});

describe("model3dReferenceSize", () => {
  it("caps the longest side and keeps the aspect ratio", () => {
    expect(model3dReferenceSize({ width: 1920, height: 1080 })).toEqual({
      width: MODEL3D_REFERENCE_MAX_SIDE,
      height: 720
    });
    expect(model3dReferenceSize({ width: 1080, height: 1920 })).toEqual({
      width: 720,
      height: MODEL3D_REFERENCE_MAX_SIDE
    });
  });

  it("never scales up and keeps both sides even", () => {
    expect(model3dReferenceSize({ width: 641, height: 361 })).toEqual({
      width: 642,
      height: 362
    });
    expect(model3dReferenceSize({ width: 1, height: 1 })).toEqual({
      width: 2,
      height: 2
    });
  });
});

describe("computeModel3DReferenceFrames", () => {
  it("is the bake sample list at the reference size with the pass on every frame", () => {
    const base = blockoutClip({ inPointMs: 500 });
    const first = { ...base, animations: setKeyframe(base, "cameraPosX", 0, 0) };
    const clip = { ...first, animations: setKeyframe(first, "cameraPosX", 1000, 2) };
    const samples = computeModel3DBakeSamples(clip, SEQUENCE, LONG);
    const frames = computeModel3DReferenceFrames(clip, SEQUENCE, LONG, "depth");

    expect(frames).toHaveLength(10);
    expect(frames.map((frame) => frame.timeSec)).toEqual(samples.frameTimes);
    expect(frames.map((frame) => frame.camera)).toEqual(samples.cameras);
    for (const frame of frames) {
      expect(frame).toMatchObject({ width: 1280, height: 720, pass: "depth" });
    }
    // The keyed move reaches the frames: the eye travels along +X.
    expect(frames[0].camera.position?.[0]).toBeCloseTo(0, 6);
    expect(frames[9].camera.position?.[0]).toBeGreaterThan(1.5);
  });
});
