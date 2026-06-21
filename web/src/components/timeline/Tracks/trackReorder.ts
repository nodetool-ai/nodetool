/**
 * Pure track-reorder helper, shared by the drag-and-drop UI and its tests.
 *
 * Reordering is constrained to within a single track type: a video track can
 * only be reordered among video tracks, audio among audio. This keeps each
 * type's block contiguous (so the script lane stays between video and audio)
 * and keeps the composite z-order coherent — `sceneModel` draws tracks by
 * ascending `index`, so order is layer order.
 */

import type { TimelineTrack } from "@nodetool-ai/timeline";

/** Where a dragged track lands relative to the track it is dropped onto. */
export type TrackDropPosition = "before" | "after";

/**
 * Compute the full ordered list of track ids after dropping `draggedId`
 * `position` the `targetId` track.
 *
 * Returns `null` when the move is invalid (unknown ids, dropping onto itself,
 * or a cross-type drop) or a no-op (the resulting order equals the current
 * one) — callers should skip the reorder in that case so no history entry is
 * recorded.
 */
export function computeReorderedTrackIds(
  tracks: Pick<TimelineTrack, "id" | "type">[],
  draggedId: string,
  targetId: string,
  position: TrackDropPosition
): string[] | null {
  if (draggedId === targetId) {
    return null;
  }

  const dragged = tracks.find((t) => t.id === draggedId);
  const target = tracks.find((t) => t.id === targetId);
  if (!dragged || !target || dragged.type !== target.type) {
    return null;
  }

  const ids = tracks.map((t) => t.id).filter((id) => id !== draggedId);
  const targetIdx = ids.indexOf(targetId);
  if (targetIdx === -1) {
    return null;
  }

  const insertAt = position === "before" ? targetIdx : targetIdx + 1;
  ids.splice(insertAt, 0, draggedId);

  const original = tracks.map((t) => t.id);
  const unchanged =
    original.length === ids.length &&
    original.every((id, i) => id === ids[i]);
  return unchanged ? null : ids;
}
