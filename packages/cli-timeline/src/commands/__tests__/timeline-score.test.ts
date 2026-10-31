import { describe, expect, it } from "vitest";
import type { TimelineCraftScoreResult } from "@nodetool-ai/execution/timeline-debug";
import { evenlySpacedFrames, renderTimelineScore } from "../timeline-score.js";

const metric = (
  overrides: Partial<TimelineCraftScoreResult["metricScores"][number]>
) => ({
  metric: "animationsPerSecond" as const,
  value: 1,
  referenceMedian: 1,
  ratio: 1,
  credit: 1,
  ...overrides
});

const result = (
  overrides: Partial<TimelineCraftScoreResult> = {}
): TimelineCraftScoreResult => ({
  score: 80,
  rawScore: 80,
  penalty: 0,
  metrics: {
    clipCount: 2,
    visibleSeconds: 2,
    animationsPerSecond: 1,
    keyframesPerSecond: 1,
    distinctAnimatedProperties: 1,
    distinctEffectTypes: 1,
    featureFlagsUsed: 1,
    styleTracks: 1,
    textAnimators: 1,
    authoredTransitions: 1,
    sceneCount: 1
  },
  metricScores: [metric({})],
  reference: { entries: [{ slug: "kite", metrics: {} as never }], median: {} as never },
  showcaseWarnings: [],
  showcaseWarningCodeCounts: {},
  validation: { ok: true, errors: [], warnings: [] },
  ...overrides
});

describe("evenlySpacedFrames", () => {
  it("spans first to last frame inclusive, deduped and sorted", () => {
    expect(evenlySpacedFrames(100, 5)).toEqual([0, 25, 50, 74, 99]);
  });

  it("never asks for more frames than the timeline has", () => {
    expect(evenlySpacedFrames(3, 12)).toEqual([0, 1, 2]);
  });

  it("returns frame 0 for a single-frame or empty timeline", () => {
    expect(evenlySpacedFrames(1, 12)).toEqual([0]);
    expect(evenlySpacedFrames(0, 12)).toEqual([0]);
  });
});

describe("renderTimelineScore", () => {
  it("reports the score, penalty and reference band", () => {
    const lines = renderTimelineScore(result());
    expect(lines[0]).toContain("80.0/100");
    expect(lines[0]).toContain("raw 80.0");
    expect(lines.find((l) => l.includes("Reference band"))).toContain("kite");
  });

  it("lists showcase warnings when present, penalizing once per distinct code", () => {
    const lines = renderTimelineScore(
      result({
        score: 65,
        rawScore: 75,
        penalty: 10,
        showcaseWarnings: [
          {
            severity: "warning",
            code: "showcase_text_collision",
            message: "text overlaps text 1"
          },
          {
            severity: "warning",
            code: "showcase_text_collision",
            message: "text overlaps text 2"
          },
          {
            severity: "warning",
            code: "showcase_camera_missing",
            message: "no camera moves the scene"
          }
        ],
        showcaseWarningCodeCounts: {
          showcase_text_collision: 2,
          showcase_camera_missing: 1
        }
      })
    );
    expect(lines[0]).toContain("65.0/100");
    expect(lines[0]).toContain("-10 for 2 distinct showcase warning code(s)");
    expect(lines.some((l) => l.includes("showcase_text_collision ×2"))).toBe(
      true
    );
    expect(
      lines.some((l) => l.includes("showcase_camera_missing ×1"))
    ).toBe(true);
    expect(
      lines.some((l) => l.includes("[showcase_text_collision] text overlaps text 1"))
    ).toBe(true);
  });

  it("flags a document that failed validation", () => {
    const lines = renderTimelineScore(
      result({
        validation: {
          ok: false,
          errors: [
            { severity: "error", code: "schema_invalid", message: "bad" }
          ],
          warnings: []
        }
      })
    );
    expect(lines.some((l) => l.includes("1 validation error"))).toBe(true);
  });
});
