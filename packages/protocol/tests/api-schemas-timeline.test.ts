import { describe, expect, it } from "vitest";
import {
  timelineDocument,
  timelineSequenceResponse,
  timelineSetup,
  timelineSetupStage,
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
