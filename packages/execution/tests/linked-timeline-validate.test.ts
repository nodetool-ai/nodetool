/**
 * A jointly-assembled cut has to survive the check every timeline goes
 * through, so `buildLinkedTimeline` is fed straight to
 * `validateTimelineSequence` here. It lives in `packages/execution` rather
 * than `packages/timeline` because the validator depends on the timeline
 * package, and the reverse edge would be a cycle.
 */

import { describe, expect, it } from "vitest";
import { buildLinkedTimeline } from "@nodetool-ai/timeline";
import type { Shot } from "@nodetool-ai/protocol";
import type {
  ScriptLine,
  ScriptSection
} from "@nodetool-ai/protocol/api-schemas/scripts.js";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

const voicedLine = (
  id: string,
  durationMs: number,
  pauseAfterMs?: number
): ScriptLine => ({
  id,
  speakerId: "speaker-1",
  text: `text of ${id}`,
  ...(pauseAfterMs === undefined ? {} : { pauseAfterMs }),
  currentTakeId: `take-${id}`,
  takes: [
    {
      id: `take-${id}`,
      assetId: `asset-${id}`,
      durationMs,
      words: [{ word: id, startMs: 0, endMs: durationMs }],
      textSnapshot: `text of ${id}`,
      voiceSnapshot: null,
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  ]
});

const section: ScriptSection = {
  id: "section-1",
  title: "Act one",
  lines: [
    voicedLine("a", 1200, 300),
    voicedLine("b", 800),
    voicedLine("c", 2000)
  ]
};

const shot = (id: string, index: number, lineIds: string[]): Shot => ({
  type: "shot",
  id,
  index,
  action: `action of ${id}`,
  status: "rendered",
  clip: { type: "video", asset_id: `clip-${id}` },
  script_line_ids: lineIds
});

describe("buildLinkedTimeline → validateTimelineSequence", () => {
  it("assembles a document the timeline validator passes", () => {
    const assembled = buildLinkedTimeline({
      boardId: "board-1",
      musicPrompt: "low strings",
      shots: [shot("s1", 0, ["a", "b"]), shot("s2", 1, ["c"])],
      script: {
        scriptId: "script-1",
        cast: [
          {
            id: "speaker-1",
            name: "Ada",
            voice: { provider: "elevenlabs", model: "v3", voice: "rachel" }
          }
        ],
        sections: [section]
      }
    });

    expect(assembled.clips).toHaveLength(6);

    const result = validateTimelineSequence({
      tracks: assembled.tracks,
      clips: assembled.clips,
      markers: []
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
