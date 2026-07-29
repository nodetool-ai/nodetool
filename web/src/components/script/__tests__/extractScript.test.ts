/**
 * @jest-environment node
 */
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { buildScriptFromTimeline } from "../extractScript";

const track = makeTrack({ type: "audio", name: "VO", index: 0 });

const captionClip = (overrides: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    trackId: track.id,
    mediaType: "audio",
    sourceType: "imported",
    status: "generated",
    ...overrides
  });

describe("buildScriptFromTimeline", () => {
  it("returns an empty single section when there is no transcript", () => {
    const result = buildScriptFromTimeline([]);
    expect(result.cast).toEqual([]);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].lines).toEqual([]);
  });

  it("projects captioned clips into lines with joined word text", () => {
    const result = buildScriptFromTimeline([
      captionClip({
        id: "c1",
        startMs: 0,
        durationMs: 1000,
        currentAssetId: "asset-1",
        caption: {
          words: [
            { word: "Hello", startMs: 0, endMs: 400 },
            { word: "world", startMs: 400, endMs: 900 }
          ]
        }
      })
    ]);
    expect(result.sections[0].lines).toHaveLength(1);
    const [lineRow] = result.sections[0].lines;
    expect(lineRow.text).toBe("Hello world");
    // The single-clip recording is carried across as the first take.
    expect(lineRow.takes).toHaveLength(1);
    expect(lineRow.takes[0].assetId).toBe("asset-1");
    expect(lineRow.currentTakeId).toBe(lineRow.takes[0].id);
    expect(lineRow.takes[0].words).toEqual([
      { word: "Hello", startMs: 0, endMs: 400 },
      { word: "world", startMs: 400, endMs: 900 }
    ]);
  });

  it("builds a cast from distinct speaker labels and links lines to it", () => {
    const result = buildScriptFromTimeline([
      captionClip({
        id: "c1",
        startMs: 0,
        durationMs: 1000,
        speaker: "Alice",
        currentAssetId: "asset-1",
        caption: { words: [{ word: "Hi", startMs: 0, endMs: 300 }] }
      }),
      captionClip({
        id: "c2",
        startMs: 1000,
        durationMs: 1000,
        speaker: "Bob",
        currentAssetId: "asset-2",
        caption: { words: [{ word: "Hey", startMs: 0, endMs: 300 }] }
      }),
      captionClip({
        id: "c3",
        startMs: 2000,
        durationMs: 1000,
        speaker: "Alice",
        currentAssetId: "asset-3",
        caption: { words: [{ word: "Bye", startMs: 0, endMs: 300 }] }
      })
    ]);
    expect(result.cast.map((s) => s.name)).toEqual(["Alice", "Bob"]);
    const alice = result.cast.find((s) => s.name === "Alice")!;
    const lines = result.sections[0].lines;
    expect(lines[0].speakerId).toBe(alice.id);
    expect(lines[2].speakerId).toBe(alice.id);
    expect(result.cast.every((s) => s.voice === null)).toBe(true);
  });
});
