/**
 * Tests for audio-led shot timing (script-link.ts).
 */

import { describe, it, expect } from "vitest";
import type { Shot } from "@nodetool-ai/protocol";
import type { ScriptLine } from "@nodetool-ai/protocol/api-schemas/scripts.js";
import { PLACEHOLDER_LINE_MS } from "../src/script.js";
import {
  effectiveShotDuration,
  linkedLineDurationMs,
  linkedShotDurationMs,
  scriptLinesById
} from "../src/script-link.js";

function voicedLine(
  id: string,
  durationMs: number,
  overrides: Partial<ScriptLine> = {}
): ScriptLine {
  return {
    id,
    speakerId: "speaker-1",
    text: `line ${id}`,
    currentTakeId: `take-${id}`,
    takes: [
      {
        id: `take-${id}`,
        assetId: `asset-${id}`,
        durationMs,
        words: [],
        textSnapshot: `line ${id}`,
        voiceSnapshot: null,
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    ...overrides
  };
}

const draftLine = (id: string): ScriptLine => ({
  id,
  speakerId: "speaker-1",
  text: `line ${id}`,
  takes: []
});

const linkedShot = (
  lineIds: string[],
  overrides: Partial<Shot> = {}
): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  action: "a lighthouse at dusk",
  status: "rendered",
  script_line_ids: lineIds,
  ...overrides
});

describe("linkedLineDurationMs", () => {
  it("adds the authored pause to the take length", () => {
    expect(
      linkedLineDurationMs(voicedLine("a", 1200, { pauseAfterMs: 300 }))
    ).toBe(1500);
  });

  it("uses the placeholder when the take has no measured length", () => {
    expect(linkedLineDurationMs(voicedLine("a", 0))).toBe(PLACEHOLDER_LINE_MS);
  });

  it("is null for a line with no take, and for a take with no asset", () => {
    expect(linkedLineDurationMs(draftLine("a"))).toBeNull();
    const noAsset = voicedLine("a", 1000);
    noAsset.takes[0].assetId = "";
    expect(linkedLineDurationMs(noAsset)).toBeNull();
  });
});

describe("linkedShotDurationMs", () => {
  const linesById = scriptLinesById([
    {
      id: "section-1",
      lines: [
        voicedLine("a", 1000, { pauseAfterMs: 250 }),
        voicedLine("b", 2000),
        draftLine("c")
      ]
    }
  ]);

  it("sums the linked takes and their pauses", () => {
    expect(linkedShotDurationMs(linkedShot(["a", "b"]), linesById)).toBe(3250);
  });

  it("is null when any linked line is unvoiced", () => {
    expect(linkedShotDurationMs(linkedShot(["a", "c"]), linesById)).toBeNull();
  });

  it("is null when a linked line is missing from the script", () => {
    expect(
      linkedShotDurationMs(linkedShot(["a", "gone"]), linesById)
    ).toBeNull();
  });

  it("is null for a shot that links no lines", () => {
    expect(linkedShotDurationMs(linkedShot([]), linesById)).toBeNull();
  });

  it("is null when duration_source pins the shot to manual", () => {
    expect(
      linkedShotDurationMs(
        linkedShot(["a", "b"], { duration_source: "manual" }),
        linesById
      )
    ).toBeNull();
    expect(
      linkedShotDurationMs(
        linkedShot(["a", "b"], { duration_source: "audio" }),
        linesById
      )
    ).toBe(3250);
  });
});

describe("effectiveShotDuration", () => {
  const linesById = scriptLinesById([
    {
      id: "section-1",
      lines: [
        voicedLine("a", 1000, { pauseAfterMs: 250 }),
        voicedLine("b", 2000),
        draftLine("c")
      ]
    }
  ]);

  it("rounds the audio-derived length up to whole seconds", () => {
    expect(
      effectiveShotDuration(
        linkedShot(["a", "b"], { duration_seconds: 5 }),
        linesById
      )
    ).toEqual({ seconds: 4, source: "audio" });
  });

  it("keeps the shot's own length when it is pinned to manual", () => {
    expect(
      effectiveShotDuration(
        linkedShot(["a", "b"], { duration_seconds: 5, duration_source: "manual" }),
        linesById
      )
    ).toEqual({ seconds: 5, source: "manual" });
  });

  it("falls back to the shot's own length when a linked line is unvoiced", () => {
    expect(
      effectiveShotDuration(
        linkedShot(["a", "c"], { duration_seconds: 6 }),
        linesById
      )
    ).toEqual({ seconds: 6, source: "manual" });
  });

  it("reports no seconds for an unlinked shot that sets none", () => {
    expect(effectiveShotDuration(linkedShot([]), linesById)).toEqual({
      seconds: undefined,
      source: "manual"
    });
  });
});
