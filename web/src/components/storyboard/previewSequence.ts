/**
 * previewSequence — pure mapping from a storyboard board to the in-memory
 * timeline sequence the board-level preview player scrubs.
 *
 * The cut itself is built in `@nodetool-ai/timeline` so a headless caller and
 * the editor preview the same shots; this module only wraps it in a
 * `TimelineSequence` with the board's frame size.
 */

import {
  buildStoryboardPreviewTimeline,
  makeSequence,
  type TimelineSequence
} from "@nodetool-ai/timeline";
import type { StoryboardBoard } from "../../stores/storyboard/StoryboardStore";

export interface StoryboardPreview {
  sequence: TimelineSequence;
  /** Shots left out: neither a clip nor a keyframe asset to show. */
  skippedShotIds: string[];
  /** Shots shown as a held keyframe still because no clip exists yet. */
  stillShotIds: string[];
}

const DEFAULT_ASPECT_RATIO = "16:9";
const LONG_EDGE = 1080;

/** Round to an even number — codecs and the compositor dislike odd sizes. */
const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

/**
 * Frame size for an aspect ratio written "W:H". Landscape and square boards
 * are 1080 tall, portrait boards 1080 wide; anything unparseable falls back to
 * 1920×1080.
 */
export function previewDimensions(aspectRatio: string | undefined): {
  width: number;
  height: number;
} {
  const [w, h] = (aspectRatio ?? DEFAULT_ASPECT_RATIO)
    .split(":")
    .map((part) => Number(part.trim()));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { width: 1920, height: 1080 };
  }
  return w >= h
    ? { width: even((LONG_EDGE * w) / h), height: LONG_EDGE }
    : { width: LONG_EDGE, height: even((LONG_EDGE * h) / w) };
}

/**
 * Signature of everything the preview depends on. `TimelineRenderer` restarts
 * playback whenever the `sequence` prop changes identity, so callers memoize on
 * this instead of on the board object, which is replaced on every edit.
 */
export function previewSignature(board: StoryboardBoard | undefined): string {
  if (!board) {
    return "";
  }
  const shots = [...board.shots]
    .sort((a, b) => a.index - b.index)
    .map(
      (s) =>
        `${s.id}:${s.clip?.asset_id ?? ""}:${s.keyframe?.asset_id ?? ""}:${
          s.duration_seconds ?? ""
        }`
    )
    .join("|");
  return `${board.id}@${board.aspectRatio}#${shots}`;
}

/**
 * Build the preview sequence for a board, or null when no shot has a clip or
 * keyframe asset to play.
 */
export function buildPreviewSequence(
  board: StoryboardBoard
): StoryboardPreview | null {
  const built = buildStoryboardPreviewTimeline({
    boardId: board.id,
    shots: board.shots
  });
  if (built.clips.length === 0) {
    return null;
  }

  const { width, height } = previewDimensions(board.aspectRatio);
  return {
    sequence: makeSequence({
      id: `storyboard-preview-${board.id}`,
      name: board.title || "Storyboard preview",
      fps: 30,
      width,
      height,
      durationMs: built.durationMs,
      tracks: built.tracks,
      clips: built.clips
    }),
    skippedShotIds: built.skippedShotIds,
    stillShotIds: built.stillShotIds
  };
}
