import { describe, it, expect } from "vitest";
import {
  assembleSubtitleCues,
  cuesToSrt,
  cuesToVtt,
  formatSubtitles,
  type SubtitleEntry
} from "../src/subtitles.js";

describe("assembleSubtitleCues", () => {
  it("lays line cues end to end, offsetting by durations and pauses", () => {
    const entries: SubtitleEntry[] = [
      { text: "Hello there.", durationMs: 1500, pauseAfterMs: 500 },
      { text: "Welcome.", durationMs: 1000 }
    ];
    const cues = assembleSubtitleCues(entries);
    expect(cues).toEqual([
      { startMs: 0, endMs: 1500, text: "Hello there." },
      { startMs: 2000, endMs: 3000, text: "Welcome." }
    ]);
  });

  it("skips empty-text and non-positive-duration entries", () => {
    const cues = assembleSubtitleCues([
      { text: "   ", durationMs: 1000 },
      { text: "Kept.", durationMs: 0 },
      { text: "Real.", durationMs: 800 }
    ]);
    expect(cues).toEqual([{ startMs: 0, endMs: 800, text: "Real." }]);
  });

  it("emits per-word cues in word granularity, offset by the cursor", () => {
    const entries: SubtitleEntry[] = [
      {
        text: "Hi you",
        durationMs: 1000,
        words: [
          { word: "Hi", startMs: 0, endMs: 400 },
          { word: "you", startMs: 500, endMs: 900 }
        ],
        pauseAfterMs: 200
      },
      {
        text: "Bye",
        durationMs: 500,
        words: [{ word: "Bye", startMs: 100, endMs: 450 }]
      }
    ];
    const cues = assembleSubtitleCues(entries, { granularity: "word" });
    expect(cues).toEqual([
      { startMs: 0, endMs: 400, text: "Hi" },
      { startMs: 500, endMs: 900, text: "you" },
      // Second entry starts at 1000 + 200 pause = 1200.
      { startMs: 1300, endMs: 1650, text: "Bye" }
    ]);
  });

  it("falls back to a line cue when word granularity finds no words", () => {
    const cues = assembleSubtitleCues(
      [{ text: "No timings", durationMs: 900 }],
      { granularity: "word" }
    );
    expect(cues).toEqual([{ startMs: 0, endMs: 900, text: "No timings" }]);
  });

  it("guarantees a minimum visible span for zero-length words", () => {
    const cues = assembleSubtitleCues(
      [
        {
          text: "x",
          durationMs: 100,
          words: [{ word: "x", startMs: 50, endMs: 50 }]
        }
      ],
      { granularity: "word" }
    );
    expect(cues[0].endMs).toBeGreaterThan(cues[0].startMs);
  });
});

describe("cuesToSrt", () => {
  it("numbers blocks and uses comma-decimal timestamps", () => {
    const srt = cuesToSrt([
      { startMs: 0, endMs: 1500, text: "Hello there." },
      { startMs: 2000, endMs: 3000, text: "Welcome." }
    ]);
    expect(srt).toBe(
      "1\n00:00:00,000 --> 00:00:01,500\nHello there.\n\n" +
        "2\n00:00:02,000 --> 00:00:03,000\nWelcome.\n"
    );
  });

  it("formats hours and minutes past a minute", () => {
    const srt = cuesToSrt([
      { startMs: 3_661_234, endMs: 3_662_000, text: "Late." }
    ]);
    expect(srt).toContain("01:01:01,234 --> 01:01:02,000");
  });

  it("renders empty for no cues", () => {
    expect(cuesToSrt([])).toBe("");
  });
});

describe("cuesToVtt", () => {
  it("prepends the WEBVTT header and uses period-decimal timestamps", () => {
    const vtt = cuesToVtt([
      { startMs: 0, endMs: 1500, text: "Hello there." }
    ]);
    expect(vtt).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nHello there.\n"
    );
  });

  it("emits just the header for no cues", () => {
    expect(cuesToVtt([])).toBe("WEBVTT\n");
  });
});

describe("formatSubtitles", () => {
  it("dispatches on format", () => {
    const cues = [{ startMs: 0, endMs: 1000, text: "Hi." }];
    expect(formatSubtitles(cues, "srt")).toBe(cuesToSrt(cues));
    expect(formatSubtitles(cues, "vtt")).toBe(cuesToVtt(cues));
  });
});
