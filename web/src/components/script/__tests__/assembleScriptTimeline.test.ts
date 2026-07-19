/**
 * @jest-environment node
 */
import type {
  ScriptDraft,
  ScriptLine,
  ScriptTake
} from "../../../stores/script/ScriptStore";
import {
  buildScriptTimelineDocument,
  isAssemblableLine,
  currentTake
} from "../assembleScriptTimeline";

const take = (overrides: Partial<ScriptTake> = {}): ScriptTake => ({
  id: "take-0",
  assetId: "asset-0",
  durationMs: 2000,
  words: [{ word: "hello", startMs: 0, endMs: 500 }],
  textSnapshot: "Hello",
  voiceSnapshot: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

const line = (overrides: Partial<ScriptLine> = {}): ScriptLine => ({
  id: "line-0",
  text: "Hello",
  takes: [],
  ...overrides
});

const voicedLine = (
  id: string,
  overrides: Partial<ScriptLine> = {},
  takeOverrides: Partial<ScriptTake> = {}
): ScriptLine => {
  const t = take({ id: `${id}-take`, assetId: `asset-${id}`, ...takeOverrides });
  return line({ id, takes: [t], currentTakeId: t.id, ...overrides });
};

const script = (overrides: Partial<ScriptDraft> = {}): ScriptDraft => ({
  id: "script-1",
  title: "My script",
  cast: [],
  sections: [],
  timelineId: null,
  updatedAt: 0,
  ...overrides
});

describe("isAssemblableLine", () => {
  it("requires a current take with a persisted asset", () => {
    expect(isAssemblableLine(voicedLine("a"))).toBe(true);
    expect(isAssemblableLine(line({ text: "draft" }))).toBe(false);
    // A take exists but is not the current one.
    expect(
      isAssemblableLine(line({ takes: [take()], currentTakeId: null }))
    ).toBe(false);
  });
});

describe("currentTake", () => {
  it("returns the take matching currentTakeId, else undefined", () => {
    const l = voicedLine("a");
    expect(currentTake(l)?.id).toBe("a-take");
    expect(currentTake(line())).toBeUndefined();
  });
});

describe("buildScriptTimelineDocument", () => {
  it("lays voiced lines end to end in reading order with script links", () => {
    const doc = buildScriptTimelineDocument(
      script({
        sections: [
          { id: "s1", lines: [voicedLine("a"), voicedLine("b")] }
        ]
      })
    );
    expect(doc.tracks).toHaveLength(1);
    expect(doc.tracks[0].type).toBe("audio");
    expect(doc.clips).toHaveLength(2);
    expect(doc.clips[0].startMs).toBe(0);
    expect(doc.clips[1].startMs).toBe(2000);
    expect(doc.durationMs).toBe(4000);
    for (const clip of doc.clips) {
      expect(clip.scriptId).toBe("script-1");
      expect(clip.bindingKind).toBe("text-to-audio");
      expect(clip.mediaType).toBe("audio");
      expect(clip.trackId).toBe(doc.tracks[0].id);
    }
    expect(doc.clips[0].scriptLineId).toBe("a");
    expect(doc.clips[0].currentAssetId).toBe("asset-a");
    expect(doc.clips[0].caption?.words).toEqual([
      { word: "hello", startMs: 0, endMs: 500 }
    ]);
  });

  it("inserts each line's pauseAfterMs as a gap in the cursor", () => {
    const doc = buildScriptTimelineDocument(
      script({
        sections: [
          {
            id: "s1",
            lines: [voicedLine("a", { pauseAfterMs: 500 }), voicedLine("b")]
          }
        ]
      })
    );
    expect(doc.clips[0].startMs).toBe(0);
    expect(doc.clips[1].startMs).toBe(2500);
  });

  it("skips unvoiced lines and reports them", () => {
    const doc = buildScriptTimelineDocument(
      script({
        sections: [
          { id: "s1", lines: [line({ id: "draft" }), voicedLine("b")] }
        ]
      })
    );
    expect(doc.clips).toHaveLength(1);
    expect(doc.clips[0].scriptLineId).toBe("b");
    expect(doc.skippedLineIds).toEqual(["draft"]);
  });

  it("stamps the speaker label from the cast", () => {
    const doc = buildScriptTimelineDocument(
      script({
        cast: [{ id: "spk1", name: "Narrator", voice: null }],
        sections: [
          { id: "s1", lines: [voicedLine("a", { speakerId: "spk1" })] }
        ]
      })
    );
    expect(doc.clips[0].speaker).toBe("Narrator");
  });

  it("falls back to a placeholder duration for an unprobed take", () => {
    const doc = buildScriptTimelineDocument(
      script({
        sections: [
          { id: "s1", lines: [voicedLine("a", {}, { durationMs: 0 })] }
        ]
      })
    );
    expect(doc.clips[0].durationMs).toBe(3000);
  });
});
