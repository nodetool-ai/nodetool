/**
 * @jest-environment node
 *
 * Subtitle export from a script's current takes: line and word granularity,
 * pause/duration layout, unvoiced-line skipping, and the empty-script guard.
 */

import {
  exportScriptSubtitles,
  scriptSubtitleEntries
} from "../scriptSubtitles";
import type {
  ScriptDraft,
  ScriptLine,
  ScriptTake,
  VoiceBinding
} from "../ScriptStore";

const VOICE: VoiceBinding = {
  provider: "openai",
  model: "tts-1",
  voice: "alloy"
};

const take = (over: Partial<ScriptTake>): ScriptTake => ({
  id: "take-x",
  assetId: "asset-x",
  durationMs: 1000,
  words: [],
  textSnapshot: "hello",
  voiceSnapshot: VOICE,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over
});

const line = (over: Partial<ScriptLine>): ScriptLine => ({
  id: "line-x",
  text: "",
  takes: [],
  ...over
});

const draft = (lines: ScriptLine[]): ScriptDraft => ({
  id: "script-1",
  title: "My Script",
  cast: [],
  sections: [{ id: "sec-1", lines }],
  timelineId: null,
  updatedAt: 0
});

describe("scriptSubtitleEntries", () => {
  it("keeps only voiced lines with text, in document order", () => {
    const script = draft([
      line({
        id: "l1",
        text: "Voiced.",
        currentTakeId: "t1",
        takes: [take({ id: "t1", durationMs: 1200 })]
      }),
      line({ id: "l2", text: "Draft, no take." }),
      line({
        id: "l3",
        text: "   ",
        currentTakeId: "t3",
        takes: [take({ id: "t3" })]
      })
    ]);
    const entries = scriptSubtitleEntries(script);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ text: "Voiced.", durationMs: 1200 });
  });
});

describe("exportScriptSubtitles", () => {
  const voiced = (): ScriptDraft =>
    draft([
      line({
        id: "l1",
        text: "Hello there.",
        pauseAfterMs: 500,
        currentTakeId: "t1",
        takes: [
          take({
            id: "t1",
            durationMs: 1500,
            words: [
              { word: "Hello", startMs: 0, endMs: 700 },
              { word: "there.", startMs: 800, endMs: 1400 }
            ]
          })
        ]
      }),
      line({
        id: "l2",
        text: "Welcome.",
        currentTakeId: "t2",
        takes: [take({ id: "t2", durationMs: 1000, words: [] })]
      })
    ]);

  it("renders SRT line cues offset by durations and pauses", () => {
    const result = exportScriptSubtitles(voiced(), { format: "srt" });
    expect(result).not.toBeNull();
    expect(result?.cueCount).toBe(2);
    expect(result?.text).toBe(
      "1\n00:00:00,000 --> 00:00:01,500\nHello there.\n\n" +
        "2\n00:00:02,000 --> 00:00:03,000\nWelcome.\n"
    );
  });

  it("renders WebVTT word cues from take word timings", () => {
    const result = exportScriptSubtitles(voiced(), {
      format: "vtt",
      granularity: "word"
    });
    expect(result?.format).toBe("vtt");
    expect(result?.cueCount).toBe(3);
    expect(result?.text.startsWith("WEBVTT")).toBe(true);
    expect(result?.text).toContain("00:00:00.000 --> 00:00:00.700\nHello");
  });

  it("returns null when nothing is voiced", () => {
    expect(exportScriptSubtitles(draft([line({ text: "Draft." })]))).toBeNull();
  });
});
