/**
 * Timeline demo "cast" format — a self-contained, backend-free capture of one
 * editing session, replayed through the real timeline UI (`PreviewArea` +
 * `TracksRegion`). Sibling to `../castTypes.ts` (the graph-editor cast): a
 * base document plus a time-stamped timeline of small edit events, folded
 * into the timeline stores as a pure function of elapsed time.
 */
import type { TimelineClip, TimelineSequence } from "@nodetool-ai/timeline";

/** Schema version. Bump on breaking changes to the cast shape. */
export const TIMELINE_CAST_VERSION = 1 as const;

/** An inline, backend-free stand-in for a generated/imported media asset. */
export interface TimelineCastAsset {
  /** Matches a clip's `currentAssetId` / `thumbnailAssetId`. */
  key: string;
  /** Inline `data:` URI — no backend, no pinned files. */
  dataUri: string;
  contentType: string;
}

export type TimelineCastEventPayload =
  | { kind: "addClip"; clip: TimelineClip }
  | { kind: "patchClip"; clipId: string; patch: Partial<TimelineClip> }
  | { kind: "removeClip"; clipId: string }
  | { kind: "select"; clipIds: string[] }
  | { kind: "zoom"; msPerPx: number }
  | { kind: "seek"; timeMs: number }
  /** Smoothly ramp the playhead from `fromMs` to `toMs` over `rampMs` of wall-clock time. */
  | { kind: "playRange"; fromMs: number; toMs: number; rampMs: number };

export interface TimelineCastEvent {
  /** Milliseconds from the start of the timeline. */
  t: number;
  payload: TimelineCastEventPayload;
}

/** A complete, replayable timeline-editor demo recording. */
export interface TimelineDemoCast {
  version: typeof TIMELINE_CAST_VERSION;
  kind: "timeline";
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  /** Total timeline length in ms (wall-clock, i.e. the recording's own runtime). */
  durationMs: number;
  fps?: number;
  /** The starting document — tracks, project size/fps, and any clips present at t=0. */
  sequence: TimelineSequence;
  /** Inline media referenced by clips' `currentAssetId` / `thumbnailAssetId`. */
  assets: TimelineCastAsset[];
  /** Timeline of edit events, sorted ascending by `t`. */
  events: TimelineCastEvent[];
}

/** Narrow runtime guard — enough to fail fast on a malformed cast. */
export function isTimelineDemoCast(value: unknown): value is TimelineDemoCast {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    c.version === TIMELINE_CAST_VERSION &&
    c.kind === "timeline" &&
    typeof c.id === "string" &&
    typeof c.sequence === "object" &&
    c.sequence !== null &&
    Array.isArray(c.events)
  );
}
