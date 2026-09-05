/**
 * clipSnap
 *
 * Snap resolution shared by the clip drag and trim gestures. The hooks snap
 * the edge they move and hand the store an already-snapped delta, so the
 * store never snaps on its own during a pointer gesture.
 *
 * Also owns the gesture-feedback publishing (snap guide + geometry readout)
 * so both hooks write the UI store the same way: only when a value changed,
 * and cleared together on gesture end.
 */

import { buildSnapPoints, resolveSnap } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import type {
  GestureReadout,
  TimelineUIState
} from "../../../stores/timeline/TimelineUIStore";

/** Pointer distance (px) within which an edge locks onto a candidate. */
export const SNAP_THRESHOLD_PX = 8;

/** Gridline spacing for the tick candidates. */
const TICK_INTERVAL_MS = 1000;

/**
 * The candidate set for one gesture, snapshotted at pointerdown: the
 * playhead, every second gridline across the document, and every clip edge
 * except those of `excludeClipIds`. Linked siblings of the excluded clips are
 * excluded too — they move with the gesture and share its edges, so keeping
 * them would glue the clip to where it started.
 */
export function collectSnapCandidates(
  clips: readonly TimelineClip[],
  durationMs: number,
  playheadMs: number,
  excludeClipIds: ReadonlySet<string>
): number[] {
  const linkIds = new Set<string>();
  for (const c of clips) {
    if (excludeClipIds.has(c.id) && c.linkId !== undefined) {
      linkIds.add(c.linkId);
    }
  }
  const exclude = new Set(excludeClipIds);
  if (linkIds.size > 0) {
    for (const c of clips) {
      if (c.linkId !== undefined && linkIds.has(c.linkId)) {
        exclude.add(c.id);
      }
    }
  }
  return buildSnapPoints({
    clips,
    excludeClipIds: exclude,
    playheadMs,
    tickIntervalMs: TICK_INTERVAL_MS,
    maxTimeMs: durationMs + TICK_INTERVAL_MS
  });
}

export interface EdgeSnap {
  /** The edge position after snapping (unchanged when nothing hit). */
  valueMs: number;
  /** The candidate the edge locked onto, or null when it did not snap. */
  guideMs: number | null;
}

/** Snap one edge to the closest candidate within the threshold. */
export function snapEdge(
  edgeMs: number,
  candidates: number[],
  msPerPx: number
): EdgeSnap {
  const hit = resolveSnap(edgeMs, candidates, SNAP_THRESHOLD_PX, msPerPx);
  return { valueMs: hit.value, guideMs: hit.snapped ? hit.value : null };
}

export interface WindowSnap {
  /** The clip's start after snapping whichever edge was closer to a hit. */
  startMs: number;
  /** The candidate an edge locked onto, or null when neither edge snapped. */
  guideMs: number | null;
}

/**
 * Snap a whole clip window: try both the start and the end edge and keep
 * the closer hit, shifting the start so that edge lands on its candidate.
 */
export function snapClipWindow(
  startMs: number,
  durationMs: number,
  candidates: number[],
  msPerPx: number
): WindowSnap {
  const start = resolveSnap(startMs, candidates, SNAP_THRESHOLD_PX, msPerPx);
  const end = resolveSnap(
    startMs + durationMs,
    candidates,
    SNAP_THRESHOLD_PX,
    msPerPx
  );
  if (start.snapped && (!end.snapped || start.distanceMs <= end.distanceMs)) {
    return { startMs: start.value, guideMs: start.value };
  }
  if (end.snapped) {
    return { startMs: end.value - durationMs, guideMs: end.value };
  }
  return { startMs, guideMs: null };
}

type FeedbackStore = Pick<
  TimelineUIState,
  "snapGuideMs" | "gestureReadout" | "setSnapGuide" | "setGestureReadout"
>;

/** Build the readout for a clip's current geometry. */
export function readoutFor(
  clip: TimelineClip,
  kind: GestureReadout["kind"]
): GestureReadout {
  return {
    clipId: clip.id,
    kind,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    inPointMs: clip.inPointMs ?? 0
  };
}

const sameReadout = (a: GestureReadout | null, b: GestureReadout) =>
  a !== null &&
  a.clipId === b.clipId &&
  a.kind === b.kind &&
  a.startMs === b.startMs &&
  a.durationMs === b.durationMs &&
  a.inPointMs === b.inPointMs;

/**
 * Write the guide and readout, publishing only the values that changed —
 * pointermove fires far more often than either value moves.
 */
export function publishGestureFeedback(
  ui: FeedbackStore,
  guideMs: number | null,
  readout: GestureReadout
): void {
  if (ui.snapGuideMs !== guideMs) {
    ui.setSnapGuide(guideMs);
  }
  if (!sameReadout(ui.gestureReadout, readout)) {
    ui.setGestureReadout(readout);
  }
}

/** Clear both on pointerup/cancel. No-op when nothing was published. */
export function clearGestureFeedback(ui: FeedbackStore): void {
  if (ui.snapGuideMs !== null) {
    ui.setSnapGuide(null);
  }
  if (ui.gestureReadout !== null) {
    ui.setGestureReadout(null);
  }
}
