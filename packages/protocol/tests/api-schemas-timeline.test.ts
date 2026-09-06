import { describe, expect, it } from "vitest";
import {
  timelineClip,
  timelineDocument,
  timelineSequenceResponse,
  timelineSetup,
  timelineSetupStage,
  type ClipModel3DStyle,
  type TimelineSetupStage
} from "../src/api-schemas/timeline.js";

/** A sequence as it was persisted before the guided flow existed. */
const legacySequence = {
  id: "seq_1",
  projectId: "proj_1",
  name: "Untitled",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 0,
  tracks: [],
  clips: [],
  markers: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const beat = {
  id: "beat_1",
  prompt: "wide shot of a pier at dawn, slow push in",
  duration_ms: 4000,
  transition: "crossfade",
  voiceover: "It starts before the light does.",
  music: true
};

describe("timeline setup (PRD § 8.5)", () => {
  it("parses a sequence that has no setup at all", () => {
    const parsed = timelineSequenceResponse.parse(legacySequence);
    expect(parsed.setup).toBeUndefined();
  });

  it("parses a document that has no setup at all", () => {
    const parsed = timelineDocument.parse({
      tracks: [],
      clips: [],
      markers: []
    });
    expect(parsed.setup).toBeUndefined();
  });

  it("round-trips every stage", () => {
    for (const stage of timelineSetupStage.options) {
      const parsed = timelineSetup.parse({ stage, brief: "a pier at dawn" });
      expect(parsed.stage).toBe(stage);
    }
  });

  it("round-trips a beat plan through the document", () => {
    const parsed = timelineDocument.parse({
      tracks: [],
      clips: [],
      markers: [],
      setup: {
        stage: "review" satisfies TimelineSetupStage,
        brief: "a pier at dawn",
        format: "ad-15",
        beats: [beat]
      }
    });
    expect(parsed.setup?.beats).toEqual([beat]);
  });

  it("keeps fields it does not know, on the setup and on a beat", () => {
    const parsed = timelineSetup.parse({
      stage: "look",
      brief: "a pier at dawn",
      lookNotes: "cold, blue",
      beats: [{ ...beat, cameraNote: "handheld" }]
    });
    expect(parsed["lookNotes"]).toBe("cold, blue");
    expect(parsed.beats?.[0]["cameraNote"]).toBe("handheld");
  });

  it("refuses a stage that is not one of the five", () => {
    expect(() => timelineSetup.parse({ stage: "shipping", brief: "" })).toThrow();
  });

  it("keeps the beat id a generated clip was cut from", () => {
    const parsed = timelineDocument.parse({
      tracks: [],
      clips: [
        {
          id: "clip_1",
          trackId: "track_1",
          name: "Beat 1",
          startMs: 0,
          durationMs: 4000,
          mediaType: "video",
          sourceType: "generated",
          beatId: "beat_1",
          status: "queued",
          locked: false,
          versions: []
        }
      ],
      markers: []
    });
    expect(parsed.clips[0].beatId).toBe("beat_1");
  });
});

/** A 3D clip with every `model3dStyle` field set, none of them defaults. */
const model3dClip = {
  id: "clip_3d",
  trackId: "track_overlay",
  name: "Statue",
  startMs: 0,
  durationMs: 4000,
  mediaType: "model3d",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  currentAssetId: "asset_glb",
  model3dStyle: {
    camera: {
      mode: "scene",
      azimuthDeg: 120,
      elevationDeg: -10,
      fovDeg: 50,
      zoom: 1.4,
      targetOffset: [0.5, -1, 2],
      sceneCameraName: "HeroCam"
    },
    animation: { clipName: "Idle", loop: false, speed: 0.5 },
    lighting: "soft",
    lightIntensity: 2.5,
    background: { transparent: false, color: "#101820" },
    bake: { assetId: "asset_bake", dependencyHash: "abc123" }
  }
} satisfies Record<string, unknown> & { model3dStyle: ClipModel3DStyle };

describe("model3d clips", () => {
  it("keeps every model3dStyle field through a clip parse", () => {
    const parsed = timelineClip.parse(model3dClip);
    // The schema strips anything it does not list, so a deep equality against
    // the input is the only check that a field actually survives a PATCH.
    expect(parsed.model3dStyle).toEqual(model3dClip.model3dStyle);
    expect(parsed.mediaType).toBe("model3d");
  });

  it("keeps a model3d clip through the whole document", () => {
    const parsed = timelineDocument.parse({
      tracks: [
        {
          id: "track_overlay",
          name: "Overlay 1",
          type: "overlay",
          index: 0,
          visible: true,
          locked: false
        }
      ],
      clips: [model3dClip],
      markers: []
    });
    expect(parsed.clips[0].model3dStyle).toEqual(model3dClip.model3dStyle);
  });

  it("parses a transparent background and a style with no bake", () => {
    const parsed = timelineClip.parse({
      ...model3dClip,
      model3dStyle: {
        camera: { mode: "orbit", azimuthDeg: 45, elevationDeg: 25, fovDeg: 35, zoom: 1 },
        animation: { loop: true, speed: 1 },
        lighting: "studio",
        lightIntensity: 1,
        background: { transparent: true }
      }
    });
    expect(parsed.model3dStyle?.background).toEqual({ transparent: true });
    expect(parsed.model3dStyle?.bake).toBeUndefined();
    expect(parsed.model3dStyle?.animation.clipName).toBeUndefined();
  });

  it("refuses an opaque background with no color", () => {
    expect(() =>
      timelineClip.parse({
        ...model3dClip,
        model3dStyle: {
          ...model3dClip.model3dStyle,
          background: { transparent: false }
        }
      })
    ).toThrow();
  });
});
