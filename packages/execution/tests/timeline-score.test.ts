import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  computeTimelineCraftMetrics,
  scoreTimelineCraft,
  summarizeTimelineCraftReferenceBand,
  TIMELINE_CRAFT_METRIC_KEYS
} from "../src/timeline-debug/index.js";

const track = (id: string) => ({
  id,
  name: id,
  type: "overlay",
  index: 0,
  visible: true,
  locked: false
});
const clip = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  trackId: id,
  name: id,
  startMs: 0,
  durationMs: 2000,
  mediaType: "shape",
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  shapeStyle: { kind: "rect", fill: "#ffffff" },
  ...overrides
});
const document = (clips: Record<string, unknown>[]) => ({
  tracks: clips.map((c) => track(c.trackId as string)),
  clips,
  markers: []
});

describe("computeTimelineCraftMetrics", () => {
  it("counts a minimal hand-built document exactly", () => {
    const doc = document([
      clip("a", {
        startMs: 0,
        durationMs: 1000,
        effects: [{ id: "e1", type: "glow", enabled: true, intensity: 1 }],
        animations: [
          {
            id: "in",
            role: "in",
            preset: "custom",
            durationMs: 500,
            custom: {
              curves: [
                {
                  property: "opacity",
                  keyframes: [
                    { t: 0, value: 0 },
                    { t: 1, value: 1 }
                  ]
                },
                {
                  property: "scale",
                  keyframes: [
                    { t: 0, value: 0.8 },
                    { t: 0.5, value: 1.1 },
                    { t: 1, value: 1 }
                  ]
                }
              ]
            },
            styleTracks: [
              {
                target: "opacity",
                keyframes: [
                  { t: 0, value: 0 },
                  { t: 1, value: 1 }
                ]
              }
            ]
          },
          {
            id: "emph",
            role: "emphasis",
            preset: "pulse",
            durationMs: 300
          }
        ],
        repeater: { count: 3, offsetX: 10, offsetY: 0 }
      }),
      clip("b", {
        trackId: "b",
        startMs: 1000,
        durationMs: 1000,
        transitionIn: { type: "crossfade", durationMs: 300 }
      })
    ]);

    const parsed = { tracks: doc.tracks, clips: doc.clips, markers: [] };
    const metrics = computeTimelineCraftMetrics(parsed as never);

    expect(metrics.clipCount).toBe(2);
    expect(metrics.visibleSeconds).toBe(2);
    expect(metrics.animationsPerSecond).toBe(1); // 2 animations / 2s
    expect(metrics.keyframesPerSecond).toBe(2.5); // 5 keyframes / 2s
    expect(metrics.distinctAnimatedProperties).toBe(3); // opacity, scale, preset:pulse
    expect(metrics.distinctEffectTypes).toBe(1);
    expect(metrics.featureFlagsUsed).toBe(1); // repeater only
    expect(metrics.styleTracks).toBe(1);
    expect(metrics.textAnimators).toBe(0);
    expect(metrics.authoredTransitions).toBe(1);
    expect(metrics.sceneCount).toBe(2); // startMs 0 and 1000
  });

  it("floors visible seconds at 1s so an empty or instant document never divides by zero", () => {
    const metrics = computeTimelineCraftMetrics({
      tracks: [],
      clips: [],
      markers: []
    } as never);
    expect(metrics.visibleSeconds).toBe(1);
    expect(metrics.animationsPerSecond).toBe(0);
    expect(metrics.clipCount).toBe(0);
  });
});

describe("summarizeTimelineCraftReferenceBand", () => {
  it("medians each metric across entries, 0 with no entries", () => {
    const entries = [
      { slug: "a", metrics: { animationsPerSecond: 1 } as never },
      { slug: "b", metrics: { animationsPerSecond: 3 } as never },
      { slug: "c", metrics: { animationsPerSecond: 5 } as never }
    ];
    const band = summarizeTimelineCraftReferenceBand(entries);
    expect(band.median.animationsPerSecond).toBe(3);
    expect(summarizeTimelineCraftReferenceBand([]).median.sceneCount).toBe(0);
  });
});

const exampleDir = fileURLToPath(
  new URL("../../base-nodes/nodetool/examples/timelines/", import.meta.url)
);
const exampleSlugs = readdirSync(exampleDir)
  .filter(
    (name) => name.endsWith(".timeline.json") && !name.startsWith("t-minus-30")
  )
  .map((name) => name.slice(0, -".timeline.json".length))
  .sort();

/**
 * `serein` carries one documented, deliberately unsilenced finding
 * (`packages/execution/tests/timeline-showcase.test.ts`'s
 * `KNOWN_EXAMPLE_FINDINGS`): clips t476/t477/t478 are three text options
 * drawn on top of each other with nothing distinguishing them — a genuine
 * issue in the reference document itself, not a proxy false positive. A
 * craft score for a real reference example should still see it (and pay the
 * showcase-warning penalty for it), so this is not filtered out of
 * `showcaseWarnings` — only accounted for when picking the score floor below.
 * All three instances share one code (`showcase_text_collision`), so the
 * penalty is one code's worth (5), not three (15) — the point of penalizing
 * per distinct code rather than per instance.
 */
// serein's three `showcase_text_collision` warnings were an artifact of the
// pre-flex row/relative resolver (a tone-tag row whose children measured
// wider than the gap accounted for); the flex migration's serein bake
// (scripts/migrate-serein-layout.mjs) fixed the underlying spacing, so
// serein now scores with zero showcase warnings like every other example.
const KNOWN_EXAMPLE_WARNING_COUNT: Record<string, number> = {};
const KNOWN_EXAMPLE_DISTINCT_CODES: Record<string, number> = {};

describe("scoreTimelineCraft — shipped examples are the reference, so they score well", () => {
  it.each(exampleSlugs)("%s scores at least 70", async (slug) => {
    const raw = JSON.parse(
      readFileSync(`${exampleDir}${slug}.timeline.json`, "utf8")
    );
    const result = await scoreTimelineCraft(raw.document, {
      fps: raw.fps,
      width: raw.width,
      height: raw.height
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.showcaseWarnings).toHaveLength(
      KNOWN_EXAMPLE_WARNING_COUNT[slug] ?? 0
    );
    const distinctCodes = KNOWN_EXAMPLE_DISTINCT_CODES[slug] ?? 0;
    expect(Object.keys(result.showcaseWarningCodeCounts)).toHaveLength(
      distinctCodes
    );
    expect(result.penalty).toBe(distinctCodes * 5);
    // sanity: every reported metric key is one of the fixed set, in order
    expect(result.metricScores.map((m) => m.metric)).toEqual([
      ...TIMELINE_CRAFT_METRIC_KEYS
    ]);
  });
});

/**
 * A trimmed stand-in for a real agent-authored motion-graphics timeline
 * (`e8fbc60c73ba409a92ffdb326ea05fc5` in the local eval run): dense
 * opacity/scale animation on parented shape/text clips, but no style tracks,
 * no authored transitions, and none of the showcase feature flags — the
 * structural gap a by-hand review found between agent output and the shipped
 * examples.
 */
function buildAgentLikeDocument() {
  const clips: Record<string, unknown>[] = [];
  for (let i = 0; i < 20; i += 1) {
    clips.push(
      clip(`shape-${i}`, {
        trackId: `shape-${i}`,
        startMs: i * 1000,
        durationMs: 1500,
        mediaType: "shape",
        animations: [
          {
            id: `in-${i}`,
            role: "in",
            preset: "custom",
            durationMs: 400,
            custom: {
              curves: [
                {
                  property: "opacity",
                  keyframes: [
                    { t: 0, value: 0 },
                    { t: 1, value: 1 }
                  ]
                },
                {
                  property: "scale",
                  keyframes: [
                    { t: 0, value: 0.9 },
                    { t: 1, value: 1 }
                  ]
                }
              ]
            }
          }
        ]
      })
    );
  }
  return document(clips);
}

describe("scoreTimelineCraft — a flat, agent-shaped timeline", () => {
  it("scores lower than every shipped example", async () => {
    const doc = buildAgentLikeDocument();
    const agentResult = await scoreTimelineCraft(doc);

    const exampleScores = await Promise.all(
      exampleSlugs.map(async (slug) => {
        const raw = JSON.parse(
          readFileSync(`${exampleDir}${slug}.timeline.json`, "utf8")
        );
        const result = await scoreTimelineCraft(raw.document, {
          fps: raw.fps,
          width: raw.width,
          height: raw.height
        });
        return { slug, score: result.score };
      })
    );

    for (const example of exampleScores) {
      expect(agentResult.score).toBeLessThan(example.score);
    }
  });
});
