/**
 * Where a track lands when it is moved.
 *
 * Track order is z-order — index 0 draws on top (see `render/sceneModel.ts`) —
 * and a new track is appended to the bottom, so a picture track added after
 * the overlays covers all of them. There was no way to fix that from a tool:
 * the only remedy was to author the tracks in the reverse of the order they
 * are read in, which is a trap sprung at `add_track` and only visible at
 * render. This is the shared arithmetic behind `move_track` on both surfaces,
 * so the editor's drag and the agent's call land a track in the same slot.
 */

/** A track as far as ordering is concerned. */
export interface OrderedTrackLike {
  id: string;
  index: number;
}

/** Exactly one of these says where the track goes. */
export interface TrackDestination {
  /** Raw slot; 0 is the top. Clamped into range. */
  toIndex?: number;
  /** The track it should draw in front of. */
  beforeId?: string;
  /** The track it should draw behind. */
  afterId?: string;
}

/**
 * The track ids in their new order, top first.
 *
 * `beforeId`/`afterId` are read against the list with the moving track still
 * in it — "before Picture" means the slot Picture occupies right now, which is
 * what a caller reading the current state means by it.
 *
 * Throws when the destination is missing, names the moving track itself, or
 * names a track the list does not hold: each of those silently produced a
 * no-op reorder, which reads as the tool ignoring the call.
 */
export function moveTrackOrder(
  tracks: readonly OrderedTrackLike[],
  targetId: string,
  destination: TrackDestination
): string[] {
  const ordered = [...tracks].sort((a, b) => a.index - b.index);
  const from = ordered.findIndex((track) => track.id === targetId);
  if (from < 0) {
    throw new Error(`move_track: no track "${targetId}" to move.`);
  }
  const to = resolveDestination(ordered, from, destination);
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved!);
  return ordered.map((track) => track.id);
}

function resolveDestination(
  ordered: readonly OrderedTrackLike[],
  from: number,
  { toIndex, beforeId, afterId }: TrackDestination
): number {
  const anchorId = beforeId ?? afterId;
  if (anchorId !== undefined) {
    if (anchorId === ordered[from]!.id) {
      throw new Error(
        "move_track cannot place a track relative to itself — name another track, or use toIndex."
      );
    }
    const at = ordered.findIndex((track) => track.id === anchorId);
    if (at < 0) {
      throw new Error(`move_track: no track "${anchorId}" to move relative to.`);
    }
    const target = beforeId !== undefined ? at : at + 1;
    // The insert happens after the moving track is spliced out, so a
    // destination below it shifts up by one.
    return target > from ? target - 1 : target;
  }
  if (toIndex === undefined || !Number.isFinite(toIndex)) {
    throw new Error(
      "move_track needs one of `toIndex`, `before`, or `after` to say where the track goes."
    );
  }
  return Math.max(0, Math.min(ordered.length - 1, Math.trunc(toIndex)));
}
