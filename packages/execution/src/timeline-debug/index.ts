/**
 * `@nodetool-ai/execution/timeline-debug` — timeline validation + debug report.
 *
 * Pure, dependency-injected core: no DB, no ffmpeg, no browser. Hosts (the
 * CLI `timeline` command today) resolve the target and write the bundle.
 */

export type {
  TimelineDebugIssue,
  TimelineValidation,
  TimelineInteractionRecord,
  TimelineDebugTarget,
  TimelineSequenceMeta,
  TimelineDebugReport
} from "./types.js";

export {
  validateTimelineSequence,
  collectStrippedPaths
} from "./validate.js";
export { buildTimelineDebugReport } from "./report.js";
export { renderTimelineReportMarkdown } from "./markdown.js";
export {
  scoreTimelineCraft,
  computeTimelineCraftMetrics,
  summarizeTimelineCraftReferenceBand,
  loadTimelineCraftReferenceEntries,
  TIMELINE_CRAFT_METRIC_KEYS,
  type TimelineCraftMetricKey,
  type TimelineCraftMetrics,
  type TimelineCraftMetricScore,
  type TimelineCraftReferenceEntry,
  type TimelineCraftReferenceBand,
  type TimelineCraftScoreResult,
  type ScoreTimelineCraftOptions
} from "./score.js";
