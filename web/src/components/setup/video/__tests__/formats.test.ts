import { describe, expect, it } from "@jest/globals";
import { timelineSequenceResponse } from "@nodetool-ai/protocol/api-schemas/timeline.js";

import {
  VIDEO_FORMATS,
  defaultBeatDurationMs,
  emptySequenceForFormat,
  tracksForFormat,
  videoFormatById
} from "../formats";

describe("video format cards (PRD § 8.2)", () => {
  it("offers the seven formats, each addressable by id", () => {
    expect(VIDEO_FORMATS).toHaveLength(7);
    expect(new Set(VIDEO_FORMATS.map((f) => f.id)).size).toBe(7);
    for (const format of VIDEO_FORMATS) {
      expect(videoFormatById(format.id)).toBe(format);
    }
  });

  it("produces a valid empty sequence for every format", () => {
    for (const format of VIDEO_FORMATS) {
      const sequence = emptySequenceForFormat(format, {
        id: `seq_${format.id}`,
        projectId: "proj_1",
        name: format.title
      });
      // The wire schema is what the server accepts, so a card whose numbers it
      // would refuse fails here rather than three steps into the flow.
      const parsed = timelineSequenceResponse.safeParse(sequence);
      expect([format.id, parsed.success]).toEqual([format.id, true]);
      expect(sequence.clips).toEqual([]);
      expect(sequence.durationMs).toBe(format.durationMs);
    }
  });

  it("lays down a picture lane and the audio lanes it names", () => {
    for (const format of VIDEO_FORMATS) {
      const tracks = tracksForFormat(format);
      expect(tracks.map((track) => track.index)).toEqual(
        tracks.map((_, index) => index)
      );
      expect(tracks.filter((track) => track.type === "video")).toHaveLength(1);
      expect(tracks.some((track) => track.name === "Music")).toBe(true);
    }
  });

  it("carries a frame the ratio it claims describes", () => {
    for (const format of VIDEO_FORMATS) {
      const [w, h] = format.aspectRatio.split(":").map(Number);
      expect(format.width / format.height).toBeCloseTo(w / h, 2);
    }
  });

  it("splits the format's length across its beats", () => {
    for (const format of VIDEO_FORMATS) {
      const beat = defaultBeatDurationMs(format);
      expect(beat * format.beatCount).toBeCloseTo(format.durationMs, -2);
    }
  });

  it("has no format for an unknown id", () => {
    expect(videoFormatById("nope")).toBeNull();
    expect(videoFormatById(undefined)).toBeNull();
  });
});
