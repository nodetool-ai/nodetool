import { describe, expect, it } from "vitest";
import {
  effectiveAssetId,
  extractedAudioLinkIds,
  makeClip,
  makeTrack,
  videoClipsWithOwnAudio
} from "../src/index.js";
import type { TimelineClip, TimelineTrack } from "../src/index.js";

const video = makeTrack({ id: "v", type: "video" });
const audio = makeTrack({ id: "a", type: "audio" });

const shot = (overrides: Partial<TimelineClip> = {}): TimelineClip =>
  makeClip({
    id: "shot",
    trackId: "v",
    mediaType: "video",
    status: "generated",
    currentAssetId: "asset",
    durationMs: 1000,
    ...overrides
  });

const ids = (clips: TimelineClip[], tracks: TimelineTrack[] = [video, audio]) =>
  videoClipsWithOwnAudio(clips, tracks).map((clip) => clip.id);

describe("effectiveAssetId", () => {
  it("plays nothing for a clip whose regeneration failed", () => {
    expect(effectiveAssetId(shot({ status: "failed" }))).toBeUndefined();
    expect(effectiveAssetId(shot({ status: "generating" }))).toBe("asset");
  });
});

describe("videoClipsWithOwnAudio", () => {
  it("sounds a video with no extracted-audio partner", () => {
    expect(ids([shot()])).toEqual(["shot"]);
  });

  it("leaves out a video whose audio sits on an audio track", () => {
    const linked = shot({ linkId: "L" });
    const partner = makeClip({
      id: "partner", trackId: "a", mediaType: "audio", linkId: "L",
      status: "generated", currentAssetId: "asset", durationMs: 1000
    });
    expect(extractedAudioLinkIds([linked, partner], [video, audio])).toEqual(new Set(["L"]));
    expect(ids([linked, partner])).toEqual([]);
  });

  it("follows mute, solo and the clip status", () => {
    expect(ids([shot({ muted: true })])).toEqual([]);
    expect(ids([shot()], [{ ...video, muted: true }, audio])).toEqual([]);
    expect(ids([shot()], [video, { ...audio, solo: true }])).toEqual([]);
    expect(ids([shot({ status: "failed" })])).toEqual([]);
    expect(ids([shot({ mediaType: "image" })])).toEqual([]);
  });
});
