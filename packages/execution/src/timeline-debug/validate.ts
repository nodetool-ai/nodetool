/**
 * Static validation of a timeline document.
 *
 * Pure and structural: everything here is decidable from the document alone —
 * no database, no assets, no decode, no rendering. The check catalog follows
 * the landmines in `packages/timeline/AGENTS.md` (timeline-space vs.
 * source-space, boundary properties on split, overlap) plus the schema's own
 * history: every `Without this field Zod strips it on every PATCH` comment in
 * `@nodetool-ai/protocol/api-schemas/timeline.ts` is a data-loss bug that
 * shipped, which is what `field_stripped` exists to catch mechanically.
 */
import {
  timelineDocument,
  type TimelineClip,
  type TimelineDocument
} from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { ANIMATION_PRESETS, sourceRate } from "@nodetool-ai/timeline";

import type { TimelineDebugIssue, TimelineValidation } from "./types.js";

export interface TimelineValidationMeta {
  fps?: number;
  width?: number;
  height?: number;
}

const DEFAULT_FPS = 30;

const PRESET_IDS = new Set<string>(
  ANIMATION_PRESETS.map((preset) => preset.id)
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clipLabel = (clip: TimelineClip): string => `${clip.name || clip.id}`;

/** Collect every leaf/branch path the parse output dropped from the input. */
function collectStrippedPaths(
  input: unknown,
  output: unknown,
  path: string,
  found: Set<string>
): void {
  if (Array.isArray(input)) {
    if (!Array.isArray(output)) return;
    input.forEach((item, index) => {
      collectStrippedPaths(item, output[index], `${path}[*]`, found);
    });
    return;
  }
  if (!isRecord(input)) return;
  if (!isRecord(output)) return;
  for (const [key, value] of Object.entries(input)) {
    // An explicit `undefined` carries nothing, so its absence loses nothing.
    if (value === undefined) continue;
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in output) || output[key] === undefined) {
      found.add(childPath);
      continue;
    }
    collectStrippedPaths(value, output[key], childPath, found);
  }
}

/**
 * Fields the schema silently drops. A stripped field survives in memory and
 * disappears on the next autosave round-trip, so it never fails loudly — the
 * only way to see it is to diff the input against what Zod handed back.
 */
function checkFieldStripping(
  raw: unknown,
  parsed: TimelineDocument
): TimelineDebugIssue[] {
  const paths = new Set<string>();
  collectStrippedPaths(raw, parsed, "", paths);
  return [...paths].sort().map((path) => ({
    severity: "warning" as const,
    code: "field_stripped",
    path,
    message: `\`${path}\` is present in the document but absent after schema parse — the schema strips it, so it is lost on the next save.`
  }));
}

function checkDuplicateIds(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const check = (kind: string, ids: string[]): void => {
    const seen = new Set<string>();
    const reported = new Set<string>();
    for (const id of ids) {
      if (seen.has(id) && !reported.has(id)) {
        reported.add(id);
        const issue: TimelineDebugIssue = {
          severity: "error",
          code: "duplicate_id",
          message: `Duplicate ${kind} id "${id}".`
        };
        if (kind === "track") {
          issue.trackId = id;
        }
        if (kind === "clip") {
          issue.clipId = id;
        }
        issues.push(issue);
      }
      seen.add(id);
    }
  };
  check(
    "track",
    doc.tracks.map((track) => track.id)
  );
  check(
    "clip",
    doc.clips.map((clip) => clip.id)
  );
  check(
    "marker",
    doc.markers.map((marker) => marker.id)
  );
  return issues;
}

function checkClip(
  clip: TimelineClip,
  trackIds: ReadonlySet<string>,
  fps: number
): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const at = { clipId: clip.id, trackId: clip.trackId };
  const label = clipLabel(clip);

  if (!trackIds.has(clip.trackId)) {
    issues.push({
      severity: "error",
      code: "clip_track_missing",
      message: `Clip "${label}" sits on track "${clip.trackId}", which the document does not declare.`,
      ...at
    });
  }

  if (clip.startMs < 0) {
    issues.push({
      severity: "error",
      code: "negative_timing",
      message: `Clip "${label}" starts at ${clip.startMs}ms — before the timeline origin.`,
      path: "startMs",
      ...at
    });
  }
  if (clip.durationMs <= 0) {
    issues.push({
      severity: "error",
      code: "negative_timing",
      message: `Clip "${label}" has durationMs ${clip.durationMs} — a clip must last longer than zero.`,
      path: "durationMs",
      ...at
    });
  }

  const fadeIn = clip.fadeInMs ?? 0;
  const fadeOut = clip.fadeOutMs ?? 0;
  if (fadeIn + fadeOut > clip.durationMs) {
    issues.push({
      severity: "error",
      code: "fade_exceeds_duration",
      message: `Clip "${label}" fades ${fadeIn}ms in + ${fadeOut}ms out over a ${clip.durationMs}ms clip — the fades overlap.`,
      ...at
    });
  }

  const { inPointMs, outPointMs } = clip;
  if (inPointMs !== undefined && inPointMs < 0) {
    issues.push({
      severity: "error",
      code: "in_out_points_invalid",
      message: `Clip "${label}" has inPointMs ${inPointMs} — a source point cannot be negative.`,
      path: "inPointMs",
      ...at
    });
  }
  if (outPointMs !== undefined && outPointMs < 0) {
    issues.push({
      severity: "error",
      code: "in_out_points_invalid",
      message: `Clip "${label}" has outPointMs ${outPointMs} — a source point cannot be negative.`,
      path: "outPointMs",
      ...at
    });
  }
  if (
    inPointMs !== undefined &&
    outPointMs !== undefined &&
    outPointMs <= inPointMs
  ) {
    issues.push({
      severity: "error",
      code: "in_out_points_invalid",
      message: `Clip "${label}" has outPointMs ${outPointMs} at or before inPointMs ${inPointMs} — the source span is empty.`,
      ...at
    });
  } else if (
    inPointMs !== undefined &&
    outPointMs !== undefined &&
    clip.durationMs > 0
  ) {
    // Timeline duration and source span are different quantities: the source
    // consumes `rate` ms per timeline ms. Comparing them without the rate is
    // the bug `sourceRate` exists to prevent.
    const rate = sourceRate(clip);
    const expected = clip.durationMs * rate;
    const actual = outPointMs - inPointMs;
    if (Math.abs(actual - expected) > 1) {
      issues.push({
        severity: "warning",
        code: "in_out_duration_mismatch",
        message: `Clip "${label}" spans ${actual}ms of source but ${clip.durationMs}ms of timeline at rate ${rate} (expected ${Math.round(expected)}ms of source).`,
        ...at
      });
    }
  }

  if (clip.speedMultiplier !== undefined && clip.speedMultiplier <= 0) {
    issues.push({
      severity: "error",
      code: "speed_multiplier_invalid",
      message: `Clip "${label}" has speedMultiplier ${clip.speedMultiplier} — playback rate must be positive.`,
      path: "speedMultiplier",
      ...at
    });
  }

  if (clip.transitionIn && clip.transitionIn.durationMs > clip.durationMs) {
    issues.push({
      severity: "warning",
      code: "transition_exceeds_duration",
      message: `Clip "${label}" opens with a ${clip.transitionIn.durationMs}ms ${clip.transitionIn.type} over a ${clip.durationMs}ms clip.`,
      ...at
    });
  }

  for (const animation of clip.animations ?? []) {
    if (!PRESET_IDS.has(animation.preset)) {
      issues.push({
        severity: "error",
        code: "unknown_animation_preset",
        message: `Clip "${label}" animation "${animation.id}" uses preset "${animation.preset}", which this build does not ship.`,
        path: "animations[*].preset",
        ...at
      });
    }
  }

  if (clip.sourceType === "generated" && !clip.workflowId && !clip.prompt) {
    issues.push({
      severity: "warning",
      code: "binding_incomplete",
      message: `Clip "${label}" is generated but names neither a workflowId nor a prompt — nothing can produce its media.`,
      ...at
    });
  }

  for (const word of clip.caption?.words ?? []) {
    if (
      word.endMs <= word.startMs ||
      word.startMs < 0 ||
      word.endMs > clip.durationMs
    ) {
      issues.push({
        severity: "warning",
        code: "caption_out_of_range",
        message: `Clip "${label}" caption word "${word.word}" spans ${word.startMs}–${word.endMs}ms, outside the clip's 0–${clip.durationMs}ms window.`,
        ...at
      });
      break;
    }
  }

  const frameMs = 1000 / fps;
  if (clip.durationMs > 0 && clip.durationMs < frameMs) {
    issues.push({
      severity: "warning",
      code: "clip_shorter_than_frame",
      message: `Clip "${label}" lasts ${clip.durationMs}ms, less than one frame at ${fps}fps (${frameMs.toFixed(2)}ms) — it may never be sampled.`,
      ...at
    });
  }

  return issues;
}

function checkOverlaps(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];
  const byTrack = new Map<string, TimelineClip[]>();
  for (const clip of doc.clips) {
    const list = byTrack.get(clip.trackId);
    if (list) list.push(clip);
    else byTrack.set(clip.trackId, [clip]);
  }
  for (const [trackId, clips] of byTrack) {
    const ordered = [...clips].sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const current = ordered[i]!;
      const end = current.startMs + Math.max(0, current.durationMs);
      for (let j = i + 1; j < ordered.length; j += 1) {
        const next = ordered[j]!;
        if (next.startMs >= end) break;
        issues.push({
          severity: "warning",
          code: "clips_overlap",
          message: `Clips "${clipLabel(current)}" (${current.startMs}–${end}ms) and "${clipLabel(next)}" (${next.startMs}–${next.startMs + next.durationMs}ms) overlap on track "${trackId}".`,
          trackId,
          clipId: current.id
        });
      }
    }
  }
  return issues;
}

function checkDocumentLevel(doc: TimelineDocument): TimelineDebugIssue[] {
  const issues: TimelineDebugIssue[] = [];

  for (const marker of doc.markers) {
    if (marker.timeMs < 0) {
      issues.push({
        severity: "error",
        code: "negative_timing",
        message: `Marker "${marker.label || marker.id}" sits at ${marker.timeMs}ms — before the timeline origin.`,
        path: "markers[*].timeMs"
      });
    }
  }

  // Only visual tracks composite, so only they compete for z-order. Audio
  // tracks sharing an index with anything is normal and harmless.
  const indexes = new Map<number, string>();
  for (const track of doc.tracks) {
    if (track.type === "audio") continue;
    const previous = indexes.get(track.index);
    if (previous !== undefined) {
      issues.push({
        severity: "warning",
        code: "duplicate_track_index",
        message: `Visual tracks "${previous}" and "${track.id}" both claim index ${track.index} — their stacking order is undefined.`,
        trackId: track.id
      });
    } else {
      indexes.set(track.index, track.id);
    }
  }

  const clipIds = new Set(doc.clips.map((clip) => clip.id));
  for (const line of doc.transcript ?? []) {
    for (const clipId of line.clipIds) {
      if (!clipIds.has(clipId)) {
        issues.push({
          severity: "warning",
          code: "transcript_clip_missing",
          message: `Transcript line "${line.id}" owns clip "${clipId}", which the document does not contain.`,
          clipId
        });
      }
    }
  }

  // A `linkId` binds a video clip to its extracted audio; a lone one means the
  // partner was deleted and moves/trims no longer travel together.
  const linked = new Map<string, string[]>();
  for (const clip of doc.clips) {
    if (!clip.linkId) continue;
    const list = linked.get(clip.linkId);
    if (list) list.push(clip.id);
    else linked.set(clip.linkId, [clip.id]);
  }
  for (const [linkId, ids] of linked) {
    if (ids.length === 1) {
      issues.push({
        severity: "warning",
        code: "link_partner_missing",
        message: `Clip "${ids[0]}" carries linkId "${linkId}" but no other clip shares it — its linked partner is gone.`,
        clipId: ids[0]
      });
    }
  }

  return issues;
}

/**
 * Validate a parsed-JSON timeline document. `raw` is untrusted: anything that
 * fails the schema is reported as `schema_invalid` and the structural checks
 * are skipped, since they read fields the parse could not establish.
 */
export function validateTimelineSequence(
  raw: unknown,
  meta?: TimelineValidationMeta
): TimelineValidation {
  const parsed = timelineDocument.safeParse(raw);
  if (!parsed.success) {
    const errors: TimelineDebugIssue[] = parsed.error.issues
      .slice(0, 25)
      .map((issue) => {
        const path = issue.path.map((p) => String(p)).join(".");
        const schemaIssue: TimelineDebugIssue = {
          severity: "error",
          code: "schema_invalid",
          message: `${path || "(root)"}: ${issue.message}`
        };
        if (path) {
          schemaIssue.path = path;
        }
        return schemaIssue;
      });
    if (errors.length === 0) {
      errors.push({
        severity: "error",
        code: "schema_invalid",
        message: "Document does not match the timeline schema."
      });
    }
    return { ok: false, errors, warnings: [] };
  }

  const doc = parsed.data;
  const fps = meta?.fps && meta.fps > 0 ? meta.fps : DEFAULT_FPS;
  const trackIds = new Set(doc.tracks.map((track) => track.id));

  const issues: TimelineDebugIssue[] = [
    ...checkFieldStripping(raw, doc),
    ...checkDuplicateIds(doc),
    ...doc.clips.flatMap((clip) => checkClip(clip, trackIds, fps)),
    ...checkOverlaps(doc),
    ...checkDocumentLevel(doc)
  ];

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { ok: errors.length === 0, errors, warnings };
}
