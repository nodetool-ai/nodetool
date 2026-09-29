/**
 * Deterministic craft scorecard for a timeline document.
 *
 * `timeline validate` answers "is this document sound." This answers a
 * different question — "does this document approach the density and polish
 * of the shipped showcase examples" — without an LLM judge, so an agent
 * harness change can be measured against a fixed baseline run after run.
 *
 * The metric set mirrors what a human reviewer counted by hand: motion
 * density (animations/keyframes per visible second), the breadth of what is
 * animated (distinct properties, effect types, showcase-only feature flags),
 * and structural craft (style tracks, text animators, authored transitions,
 * scene count — the number of distinct cut points on the timeline). Each
 * metric is compared against the **reference band**: the same metrics
 * computed for the shipped showcase examples
 * (`packages/base-nodes/nodetool/examples/timelines/*.timeline.json`,
 * excluding `t-minus-30`, which is footage-based rather than motion
 * graphics) via `@nodetool-ai/timeline/examples/node` — the same loader the
 * product uses to install and preview them, so the band tracks the shipped
 * set without a second copy of it.
 *
 * Score formula, kept simple and explainable rather than clever: each metric
 * earns 0.4 credit outright, plus up to 0.6 more for reaching the reference
 * median (capped at 1.0 credit — exceeding the median earns nothing further).
 * The score is the mean credit across metrics, as a percentage, minus 5
 * points per *distinct* showcase-tier warning code the document carries
 * (`checkShowcase` in `showcase.ts`, run through
 * `validateTimelineSequence(doc, { tier: "showcase" })` — new codes land here
 * automatically). Distinct, not per instance: four `showcase_text_collision`
 * findings on four different clip pairs are one craft gap, not four, and
 * penalizing by instance count lets one noisy, high-cardinality check
 * dominate the score. `showcaseWarnings` still lists every instance (with
 * its clip and message) and `showcaseWarningCodeCounts` breaks that list down
 * by code, so nothing about volume is hidden — only the penalty is capped to
 * "how many distinct things are wrong," not "how many places." The floor
 * keeps one missing technique from cratering an otherwise dense, polished
 * document; the median cap keeps a pathologically bloated document from
 * buying an unbounded score by piling on one metric.
 */
import {
  timelineDocument,
  type TimelineDocument
} from "@nodetool-ai/protocol/api-schemas/timeline.js";

import { validateTimelineSequence } from "./validate.js";
import type { TimelineDebugIssue, TimelineValidation } from "./types.js";

/** Clip-level boolean/object flags that mark showcase-grade technique. */
const FEATURE_FLAGS = [
  "repeater",
  "motionBlur",
  "layout",
  "blendMode",
  "mask",
  "animationLinks",
  "temporalEcho"
] as const;

/** The metrics scored, in the order they are reported. */
export const TIMELINE_CRAFT_METRIC_KEYS = [
  "animationsPerSecond",
  "keyframesPerSecond",
  "distinctAnimatedProperties",
  "distinctEffectTypes",
  "featureFlagsUsed",
  "styleTracks",
  "textAnimators",
  "authoredTransitions",
  "sceneCount"
] as const;

export type TimelineCraftMetricKey =
  (typeof TIMELINE_CRAFT_METRIC_KEYS)[number];

export interface TimelineCraftMetrics
  extends Record<TimelineCraftMetricKey, number> {
  /** Context, not scored: raw clip count. */
  clipCount: number;
  /** Context, not scored: seconds from 0 to the latest clip's end, floored at 1s. */
  visibleSeconds: number;
}

const MIN_VISIBLE_SECONDS = 1;

/** Compute the craft metric set for a parsed timeline document. */
export function computeTimelineCraftMetrics(
  document: TimelineDocument
): TimelineCraftMetrics {
  const clips = document.clips;
  const clipCount = clips.length;
  const durationMs = clips.reduce(
    (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
    0
  );
  const visibleSeconds = Math.max(MIN_VISIBLE_SECONDS, durationMs / 1000);

  let animations = 0;
  let keyframes = 0;
  let styleTracks = 0;
  let textAnimators = 0;
  let authoredTransitions = 0;
  const properties = new Set<string>();
  const effectTypes = new Set<string>();
  const sceneBoundaries = new Set<number>();

  for (const clip of clips) {
    sceneBoundaries.add(Math.round(clip.startMs));
    if (clip.transitionIn) authoredTransitions += 1;
    for (const effect of clip.effects ?? []) {
      effectTypes.add(effect.type);
    }
    for (const animation of clip.animations ?? []) {
      animations += 1;
      for (const curve of animation.custom?.curves ?? []) {
        properties.add(curve.property);
        keyframes += curve.keyframes.length;
      }
      styleTracks += (animation.styleTracks ?? []).length;
      if (animation.textAnimator) textAnimators += 1;
      // A named preset animates a property too, even without a baked curve —
      // "spin" or "kenBurns" is as much an animated property as a custom
      // curve on `rotation` is.
      if (animation.preset && animation.preset !== "custom") {
        properties.add(`preset:${animation.preset}`);
      }
    }
  }

  const featureFlagsUsed = FEATURE_FLAGS.filter((flag) =>
    clips.some((clip) => Boolean((clip as Record<string, unknown>)[flag]))
  ).length;

  return {
    clipCount,
    visibleSeconds,
    animationsPerSecond: animations / visibleSeconds,
    keyframesPerSecond: keyframes / visibleSeconds,
    distinctAnimatedProperties: properties.size,
    distinctEffectTypes: effectTypes.size,
    featureFlagsUsed,
    styleTracks,
    textAnimators,
    authoredTransitions,
    sceneCount: sceneBoundaries.size
  };
}

export interface TimelineCraftReferenceEntry {
  slug: string;
  metrics: TimelineCraftMetrics;
}

export interface TimelineCraftReferenceBand {
  entries: TimelineCraftReferenceEntry[];
  /** Median of each metric across `entries`. 0 when there are no entries. */
  median: Record<TimelineCraftMetricKey, number>;
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Reduce a set of reference entries to the per-metric median a score compares against. */
export function summarizeTimelineCraftReferenceBand(
  entries: readonly TimelineCraftReferenceEntry[]
): TimelineCraftReferenceBand {
  const median = Object.fromEntries(
    TIMELINE_CRAFT_METRIC_KEYS.map((key) => [
      key,
      medianOf(entries.map((entry) => entry.metrics[key]))
    ])
  ) as Record<TimelineCraftMetricKey, number>;
  return { entries: [...entries], median };
}

/** File suffix the shipped example bundles are named with. */
const EXAMPLE_SUFFIX = ".timeline.json";
/** Footage-based, not motion graphics — excluded from the reference band. */
const EXCLUDED_EXAMPLE_SLUGS = new Set(["t-minus-30"]);

/**
 * The reference band, computed at runtime from the shipped examples — the
 * same files and the same loader (`@nodetool-ai/timeline/examples/node`) the
 * product installs and previews them from, so this never drifts from a second
 * copy of the set.
 */
export async function loadTimelineCraftReferenceEntries(): Promise<
  TimelineCraftReferenceEntry[]
> {
  const { resolveExampleTimelinesDir, getExampleTimelineBundle } =
    await import("@nodetool-ai/timeline/examples/node");
  const dir = resolveExampleTimelinesDir();
  if (!dir) return [];
  const { readdirSync } = await import("node:fs");
  const slugs = readdirSync(dir)
    .filter((file) => file.endsWith(EXAMPLE_SUFFIX))
    .map((file) => file.slice(0, -EXAMPLE_SUFFIX.length))
    .filter((slug) => !EXCLUDED_EXAMPLE_SLUGS.has(slug))
    .sort();
  const entries: TimelineCraftReferenceEntry[] = [];
  for (const slug of slugs) {
    const bundle = getExampleTimelineBundle({}, slug);
    if (!bundle) continue;
    entries.push({
      slug,
      metrics: computeTimelineCraftMetrics(bundle.document)
    });
  }
  return entries;
}

/** Each metric's reported value against the reference band, plus its credit. */
export interface TimelineCraftMetricScore {
  metric: TimelineCraftMetricKey;
  value: number;
  referenceMedian: number;
  /** `value / referenceMedian`, uncapped — for display, not part of the score math. */
  ratio: number;
  /** 0..1 contribution to the score: the floor, plus a ramp to the median, capped at 1. */
  credit: number;
}

/** Every metric earns this much credit outright, even at zero. */
const CREDIT_FLOOR = 0.4;
/** Points subtracted per distinct showcase-tier warning code the document carries. */
const PENALTY_PER_SHOWCASE_WARNING_CODE = 5;

export interface TimelineCraftScoreResult {
  /** 0-100, clamped: `rawScore` minus the showcase-warning penalty. */
  score: number;
  /** 0-100 before the penalty: the mean metric credit. */
  rawScore: number;
  /** `PENALTY_PER_SHOWCASE_WARNING_CODE` × the number of distinct codes in `showcaseWarnings`. */
  penalty: number;
  metrics: TimelineCraftMetrics;
  metricScores: TimelineCraftMetricScore[];
  reference: TimelineCraftReferenceBand;
  /** Every showcase-tier warning instance — one row per finding, not deduplicated. */
  showcaseWarnings: TimelineDebugIssue[];
  /** `showcaseWarnings` grouped by code, e.g. `{ showcase_text_collision: 4 }` — instance volume, kept visible even though the penalty is per code. */
  showcaseWarningCodeCounts: Record<string, number>;
  validation: TimelineValidation;
}

function creditFor(value: number, median: number): number {
  if (median <= 0) return value > 0 ? 1 : CREDIT_FLOOR;
  return Math.min(1, CREDIT_FLOOR + (1 - CREDIT_FLOOR) * (value / median));
}

export interface ScoreTimelineCraftOptions {
  fps?: number;
  width?: number;
  height?: number;
  /** Defaults to `loadTimelineCraftReferenceEntries`. Tests inject a fixed band. */
  referenceEntries?: readonly TimelineCraftReferenceEntry[];
}

/**
 * Score a timeline document's craft against the shipped showcase examples.
 * Never throws on a malformed document — an unparseable document scores 0 on
 * every metric, and `validation.ok` says why.
 */
export async function scoreTimelineCraft(
  raw: unknown,
  options: ScoreTimelineCraftOptions = {}
): Promise<TimelineCraftScoreResult> {
  const validation = validateTimelineSequence(raw, {
    tier: "showcase",
    fps: options.fps,
    width: options.width,
    height: options.height
  });
  const parsed = timelineDocument.safeParse(raw);
  const document: TimelineDocument = parsed.success
    ? parsed.data
    : { tracks: [], clips: [], markers: [] };
  const metrics = computeTimelineCraftMetrics(document);

  const entries =
    options.referenceEntries ?? (await loadTimelineCraftReferenceEntries());
  const reference = summarizeTimelineCraftReferenceBand(entries);

  const showcaseWarnings = validation.warnings.filter((warning) =>
    warning.code.startsWith("showcase_")
  );

  const metricScores: TimelineCraftMetricScore[] =
    TIMELINE_CRAFT_METRIC_KEYS.map((metric) => {
      const value = metrics[metric];
      const referenceMedian = reference.median[metric];
      return {
        metric,
        value,
        referenceMedian,
        ratio: referenceMedian > 0 ? value / referenceMedian : value > 0 ? 1 : 0,
        credit: creditFor(value, referenceMedian)
      };
    });

  const rawScore =
    (metricScores.reduce((sum, entry) => sum + entry.credit, 0) /
      metricScores.length) *
    100;
  const showcaseWarningCodeCounts: Record<string, number> = {};
  for (const warning of showcaseWarnings) {
    showcaseWarningCodeCounts[warning.code] =
      (showcaseWarningCodeCounts[warning.code] ?? 0) + 1;
  }
  const distinctShowcaseCodes = Object.keys(showcaseWarningCodeCounts).length;
  const penalty = distinctShowcaseCodes * PENALTY_PER_SHOWCASE_WARNING_CODE;
  const score = Math.max(0, Math.min(100, rawScore - penalty));

  return {
    score,
    rawScore,
    penalty,
    metrics,
    metricScores,
    reference,
    showcaseWarnings,
    showcaseWarningCodeCounts,
    validation
  };
}
