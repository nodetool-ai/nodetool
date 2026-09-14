import { describe, expect, it } from "vitest";
import { makeClip, makeSequence, makeTrack } from "../src/defaults.js";
import { adaptSequenceFormat } from "../src/retarget.js";
import type { MediaTrack } from "../src/types.js";

describe("adaptSequenceFormat", () => {
  it("creates a nondestructive smart adaptation and preserves editorial state", () => {
    const videoTrack = makeTrack({ id: "video", index: 0 });
    const audioTrack = makeTrack({ id: "audio", index: 1, type: "audio" });
    const video = makeClip({
      id: "shot",
      trackId: videoTrack.id,
      mediaType: "video",
      currentAssetId: "asset-shot",
      width: 1920,
      height: 1080,
      startMs: 400,
      durationMs: 3000
    });
    const audio = makeClip({
      id: "music",
      trackId: audioTrack.id,
      mediaType: "audio",
      startMs: 0,
      durationMs: 5000,
      volumeDb: -3
    });
    const mediaTrack: MediaTrack = {
      id: "person",
      clipId: video.id,
      sourceAssetId: "asset-shot",
      name: "Person",
      kind: "point",
      sourceStartMs: 0,
      sourceEndMs: 3000,
      samples: [
        { sourceMs: 0, x: 0.2, y: 0.5 },
        { sourceMs: 3000, x: 0.8, y: 0.5 }
      ],
      status: "ready"
    };
    const source = makeSequence({
      id: "landscape",
      width: 1920,
      height: 1080,
      durationMs: 5000,
      tracks: [videoTrack, audioTrack],
      clips: [video, audio],
      mediaTracks: [mediaTrack]
    });

    const result = adaptSequenceFormat(source, "9:16", {
      strategy: "smart",
      safeMargin: 0.1
    });

    expect(result.sequence).not.toBe(source);
    expect(result.sequence.id).not.toBe(source.id);
    expect(result.sequence.templateId).toBe(source.id);
    expect([result.sequence.width, result.sequence.height]).toEqual([
      1080, 1920
    ]);
    expect(result.sequence.clips[0]?.reframe).toMatchObject({
      mode: "auto",
      sourceAssetId: "asset-shot",
      sourceWidth: 1920,
      sourceHeight: 1080
    });
    expect(result.sequence.clips[0]?.reframe?.samples).toHaveLength(2);
    expect(result.sequence.clips[0]?.startMs).toBe(400);
    expect(result.sequence.clips[0]?.durationMs).toBe(3000);
    expect(result.sequence.clips[1]).toMatchObject({
      id: "music",
      startMs: 0,
      durationMs: 5000,
      volumeDb: -3
    });
    expect(result.sequence.mediaTracks).toEqual(source.mediaTracks);
    expect(source.clips[0]?.reframe).toBeUndefined();
  });

  it("preserves manual corrections and authored focus without a subject track", () => {
    const videoTrack = makeTrack({ id: "video", index: 0 });
    const source = makeSequence({
      id: "portrait",
      width: 1080,
      height: 1920,
      tracks: [videoTrack],
      clips: [
        makeClip({
          id: "shot",
          trackId: videoTrack.id,
          mediaType: "video",
          currentAssetId: "asset-shot",
          width: 1920,
          height: 1080,
          reframe: {
            mode: "auto",
            sourceAssetId: "asset-shot",
            samples: [{ sourceMs: 0, x: 0.7, y: 0.4 }],
            keyframes: [{ sourceMs: 500, x: 0.75, y: 0.45 }]
          }
        })
      ]
    });

    const result = adaptSequenceFormat(source, "1:1", {
      strategy: "smart",
      safeMargin: 0.1
    });

    expect(result.sequence.clips[0]?.reframe).toMatchObject({
      mode: "auto",
      samples: [{ sourceMs: 0, x: 0.7, y: 0.4 }],
      keyframes: [{ sourceMs: 500, x: 0.75, y: 0.45 }]
    });
  });

  it("refuses smart mode when no analysis or authored focus exists", () => {
    const videoTrack = makeTrack({ id: "video", index: 0 });
    const source = makeSequence({
      tracks: [videoTrack],
      clips: [
        makeClip({
          id: "shot",
          trackId: videoTrack.id,
          mediaType: "video",
          currentAssetId: "asset-shot"
        })
      ]
    });

    expect(() =>
      adaptSequenceFormat(source, "9:16", { strategy: "smart" })
    ).toThrow(/current subject track or authored framing/);
  });

  it("rejects a ready subject track after the clip asset changes", () => {
    const videoTrack = makeTrack({ id: "video", index: 0 });
    const source = makeSequence({
      tracks: [videoTrack],
      clips: [
        makeClip({
          id: "shot",
          trackId: videoTrack.id,
          mediaType: "video",
          currentAssetId: "new-asset"
        })
      ],
      mediaTracks: [
        {
          id: "subject",
          clipId: "shot",
          sourceAssetId: "old-asset",
          name: "Subject",
          kind: "point",
          sourceStartMs: 0,
          sourceEndMs: 1000,
          samples: [{ sourceMs: 0, x: 0.2, y: 0.4 }],
          status: "ready"
        }
      ]
    });

    expect(() =>
      adaptSequenceFormat(source, "9:16", { strategy: "smart" })
    ).toThrow(/Missing: shot/);
  });

  it("skips an old ready track when a current ready track follows it", () => {
    const videoTrack = makeTrack({ id: "video", index: 0 });
    const video = makeClip({
      id: "shot",
      trackId: videoTrack.id,
      mediaType: "video",
      currentAssetId: "new-asset"
    });
    const trackForAsset = (id: string, sourceAssetId: string): MediaTrack => ({
      id,
      clipId: video.id,
      sourceAssetId,
      name: id,
      kind: "point",
      sourceStartMs: 0,
      sourceEndMs: 1000,
      samples: [{ sourceMs: 0, x: 0.7, y: 0.4 }],
      status: "ready"
    });
    const source = makeSequence({
      tracks: [videoTrack],
      clips: [video],
      mediaTracks: [
        trackForAsset("old", "old-asset"),
        trackForAsset("current", "new-asset")
      ]
    });

    const result = adaptSequenceFormat(source, "9:16", { strategy: "smart" });

    expect(result.sequence.clips[0]?.reframe?.samples?.[0]).toMatchObject({
      x: 0.7,
      y: 0.4
    });
  });

  it("refuses tracks without point or box coordinates", () => {
    const videoTrack = makeTrack({ id: "video", index: 0 });
    const video = makeClip({
      id: "shot",
      trackId: videoTrack.id,
      mediaType: "video",
      currentAssetId: "asset-shot"
    });
    const source = makeSequence({
      tracks: [videoTrack],
      clips: [video],
      mediaTracks: [
        {
          id: "quad",
          clipId: video.id,
          sourceAssetId: "asset-shot",
          name: "Quad",
          kind: "quad",
          sourceStartMs: 0,
          sourceEndMs: 1000,
          samples: [{ sourceMs: 0, quad: [0, 0, 1, 0, 1, 1, 0, 1] }],
          status: "ready"
        }
      ]
    });

    expect(() =>
      adaptSequenceFormat(source, "9:16", { strategy: "smart" })
    ).toThrow(/Missing: shot/);
  });

  it("preserves captured source dimensions across repeated adaptations", () => {
    const videoTrack = makeTrack({ id: "video", index: 0 });
    const source = makeSequence({
      width: 1080,
      height: 1920,
      tracks: [videoTrack],
      clips: [
        makeClip({
          id: "shot",
          trackId: videoTrack.id,
          mediaType: "video",
          currentAssetId: "asset-shot",
          reframe: {
            mode: "auto",
            sourceAssetId: "asset-shot",
            sourceWidth: 1920,
            sourceHeight: 1080,
            samples: [{ sourceMs: 0, x: 0.5, y: 0.5 }]
          }
        })
      ]
    });

    const result = adaptSequenceFormat(source, "1:1", { strategy: "smart" });

    expect(result.sequence.clips[0]?.reframe).toMatchObject({
      sourceWidth: 1920,
      sourceHeight: 1080
    });
  });
});
