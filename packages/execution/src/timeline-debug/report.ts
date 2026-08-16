/**
 * Assembles a `TimelineDebugReport` from a document, an optional scripted edit
 * session, and the document that session left behind.
 *
 * Pure: the host resolves the target (file, id) and writes the bundle; this
 * decides what the run means.
 */
import type { DebugVerdict } from "../debug/types.js";
import type {
  TimelineDebugIssue,
  TimelineDebugReport,
  TimelineDebugTarget,
  TimelineInteractionRecord,
  TimelineSequenceMeta,
  TimelineValidation
} from "./types.js";
import {
  validateTimelineSequence,
  type TimelineValidationMeta
} from "./validate.js";

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const DEFAULTS = { fps: 30, width: 1920, height: 1080 } as const;

/**
 * What a headless timeline run cannot answer. Fixed, because the boundary is a
 * property of the harness, not of the document it was pointed at.
 */
const NOT_SIMULATED: ReadonlyArray<string> = [
  "Rendering and compositing — no pixels are produced, so nothing here sees a frame.",
  "Playback timing — transport, scrubbing, and audio/video sync are untested.",
  "Video and audio decode — asset durations, real frame rates, and codec support are unknown.",
  "Generation providers — no clip media is produced; `generated` clips are checked structurally only.",
  "Asset I/O — asset ids are never resolved or fetched.",
  "`get_clip_frames` and any other frame-sampling tool."
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const countAndDuration = (
  document: unknown
) => {
  if (!isRecord(document))
    return { trackCount: 0, clipCount: 0, durationMs: 0 };
  const tracks = Array.isArray(document.tracks) ? document.tracks : [];
  const clips = Array.isArray(document.clips) ? document.clips : [];
  let durationMs = 0;
  for (const clip of clips) {
    if (!isRecord(clip)) continue;
    const start = typeof clip.startMs === "number" ? clip.startMs : 0;
    const length = typeof clip.durationMs === "number" ? clip.durationMs : 0;
    durationMs = Math.max(durationMs, start + Math.max(0, length));
  }
  return { trackCount: tracks.length, clipCount: clips.length, durationMs };
};

const describe = (issue: TimelineDebugIssue): string => {
  const where = issue.clipId ?? issue.trackId ?? issue.path;
  return where
    ? `[${issue.code}] ${where}: ${issue.message}`
    : `[${issue.code}] ${issue.message}`;
};

function buildTimelineVerdict(
  validation: TimelineValidation,
  interactions: ReadonlyArray<TimelineInteractionRecord>,
  finalValidation: TimelineValidation | undefined
): DebugVerdict {
  const failedSteps = interactions.filter((step) => !step.ok);
  const issues: string[] = [
    ...validation.errors.map(describe),
    ...failedSteps.map(
      (step) =>
        `Interaction \`${step.tool}\` failed${step.error ? `: ${step.error}` : ""}`
    ),
    ...(finalValidation?.errors ?? []).map(
      (issue) => `After edits — ${describe(issue)}`
    )
  ];
  const warnings: string[] = [
    ...validation.warnings.map(describe),
    ...(finalValidation?.warnings ?? []).map(
      (issue) => `After edits — ${describe(issue)}`
    )
  ];

  const ok = issues.length === 0;
  const warningCount = warnings.length;
  const headline = ok
    ? `Timeline is sound — ${interactions.length} interaction(s) ran clean` +
      (warningCount > 0 ? `, ${warningCount} warning(s)` : "") +
      "."
    : `Timeline has ${issues.length} problem(s)` +
      (failedSteps.length > 0
        ? `, ${failedSteps.length} failed interaction(s)`
        : "") +
      (warningCount > 0 ? `, ${warningCount} warning(s)` : "") +
      ` — ${issues[0]}`;

  return warningCount > 0
    ? { ok, headline, issues, warnings }
    : { ok, headline, issues };
}

export interface TimelineDebugReportInput {
  target: TimelineDebugTarget;
  /** The document as loaded — untrusted, validated here. */
  document: unknown;
  meta?: TimelineValidationMeta;
  interactions?: TimelineInteractionRecord[];
  /** Bridge snapshot after the scripted session (`TimelineBridgeFinalState`). */
  finalState?: unknown;
  /** Document reconstructed from the final state, validated as a second pass. */
  finalDocument?: unknown;
}

export function buildTimelineDebugReport(
  input: TimelineDebugReportInput
): TimelineDebugReport {
  const validation = validateTimelineSequence(input.document, input.meta);
  const finalValidation =
    input.finalDocument === undefined
      ? undefined
      : validateTimelineSequence(input.finalDocument, input.meta);
  const interactions = input.interactions ?? [];

  // The final document is what the session left behind, so it — not the input
  // — describes the sequence the report is about.
  const counted = countAndDuration(input.finalDocument ?? input.document);
  const meta: TimelineSequenceMeta = {
    fps: input.meta?.fps && input.meta.fps > 0 ? input.meta.fps : DEFAULTS.fps,
    width:
      input.meta?.width && input.meta.width > 0
        ? input.meta.width
        : DEFAULTS.width,
    height:
      input.meta?.height && input.meta.height > 0
        ? input.meta.height
        : DEFAULTS.height,
    ...counted
  };

  type ReportFields = Mutable<TimelineDebugReport>;
  const report: ReportFields = {
    target: input.target,
    meta,
    validation,
    interactions,
    notSimulated: [...NOT_SIMULATED],
    verdict: buildTimelineVerdict(validation, interactions, finalValidation)
  };
  if (input.finalState !== undefined) {
    report.finalState = input.finalState;
  }
  if (finalValidation) {
    report.finalValidation = finalValidation;
  }
  return report;
}
