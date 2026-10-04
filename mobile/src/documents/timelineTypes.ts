/**
 * The timeline document as mobile reads it. Timelines are view only on mobile:
 * `TimelineViewerScreen` and the inline chat preview draw these values, and
 * nothing on the phone writes them.
 *
 * Document types come straight from `@nodetool-ai/timeline` rather than being
 * re-declared here, so the viewer reads the same shape the desktop editor
 * writes. The import is type-only; no timeline engine code reaches the bundle.
 */

import type {
  TimelineClip,
  TimelineMarker,
  TimelineTrack,
  TranscriptLine,
} from '@nodetool-ai/timeline';

export type TimelineTrackType = TimelineTrack['type'];
export type TimelineMediaType = TimelineClip['mediaType'];
export type TimelineClipStatus = TimelineClip['status'];

/** Document-shaped aliases, kept so existing call sites read unchanged. */
export type TimelineTrackData = TimelineTrack;
export type TimelineClipData = TimelineClip;
export type TimelineMarkerData = TimelineMarker;

/**
 * The timeline document body — the wire shape of `timelineDocument` in
 * `@nodetool-ai/protocol/api-schemas/timeline`, expressed with the engine's
 * types (the protocol module is zod, is not re-exported from the package root,
 * and mobile has no zod).
 *
 * `fps`, `width`, and `height` live on the resource row, not in the body, so
 * they are unavailable here — duration comes from the clips.
 */
export interface TimelineDocument {
  tracks: TimelineTrackData[];
  clips: TimelineClipData[];
  markers: TimelineMarkerData[];
  transcript?: TranscriptLine[];
  scriptEnabled?: boolean;
}

/** Sequence length: the end of the last clip. Zero when there are none. */
export function timelineDurationMs(clips: readonly TimelineClipData[]): number {
  return clips.reduce(
    (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
    0
  );
}
