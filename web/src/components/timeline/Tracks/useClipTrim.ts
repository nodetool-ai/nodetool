/**
 * useClipTrim
 *
 * Pointer gestures for a clip's two trim handles. The start handle moves the
 * clip's in-point (startMs and durationMs change together); the end handle
 * changes durationMs only, capped at the source length when one is known.
 *
 * The moving edge is targeted absolutely from the pointer (edge at
 * pointerdown + pointer travel), snapped against a candidate set snapshotted
 * at pointerdown unless Alt is held, and converted to the delta the store's
 * trim convention expects from the clip's *current* edge. The engaged
 * candidate is published as the snap guide and the clip's live geometry as
 * the gesture readout.
 */

import { useCallback, useRef } from "react";
import type React from "react";

import type { TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import type { TimelineTool } from "../../../stores/timeline/TimelineUIStore";
import {
  clearGestureFeedback,
  collectSnapCandidates,
  publishGestureFeedback,
  readoutFor,
  snapEdge
} from "./clipSnap";

interface UseClipTrimOptions {
  clip: TimelineClip | undefined;
  msPerPx: number;
  activeTool: TimelineTool;
  /** True when the clip or its track is locked: the gesture is refused. */
  interactionLocked: boolean;
  /** Source length (audio decoded, video probed); trim-end cannot grow past it. */
  sourceDurationMs: number | undefined;
}

type TrimPointerHandler = (e: React.PointerEvent<HTMLDivElement>) => void;

interface ClipTrimHandlers {
  handleTrimStartPointerDown: TrimPointerHandler;
  handleTrimStartPointerMove: TrimPointerHandler;
  handleTrimEndPointerDown: TrimPointerHandler;
  handleTrimEndPointerMove: TrimPointerHandler;
  /** Shared end-of-trim handler (pointerup AND pointercancel). */
  handleTrimPointerEnd: () => void;
}

interface TrimGesture {
  /** Pointer x at pointerdown. */
  startX: number;
  /** Where the moving edge was at pointerdown. */
  edgeMsAtStart: number;
  /** Snap candidates snapshotted at pointerdown. */
  candidates: number[];
}

/** The snapped edge the pointer is asking for, and the guide to show. */
function targetEdge(
  gesture: TrimGesture,
  e: React.PointerEvent<HTMLDivElement>,
  msPerPx: number
) {
  const rawMs = gesture.edgeMsAtStart + (e.clientX - gesture.startX) * msPerPx;
  if (e.altKey) {
    return { valueMs: rawMs, guideMs: null };
  }
  return snapEdge(rawMs, gesture.candidates, msPerPx);
}

export function useClipTrim({
  clip,
  msPerPx,
  activeTool,
  interactionLocked,
  sourceDurationMs
}: UseClipTrimOptions): ClipTrimHandlers {
  const trimClipStart = useTimelineStore((s) => s.trimClipStart);
  const trimClipEnd = useTimelineStore((s) => s.trimClipEnd);

  // One undo entry per trim gesture; see useTimelineHistoryBatch.
  const history = useTimelineHistoryBatch();

  // Gesture-ownership flags: each trim handle's move handler only runs when
  // *its own* pointerdown started the gesture. Without this, dragging another
  // clip across the handle (with the primary button held) would fire the move
  // handler and corrupt this clip's geometry.
  const isTrimmingStartRef = useRef(false);
  const isTrimmingEndRef = useRef(false);

  const gestureRef = useRef<TrimGesture>({
    startX: 0,
    edgeMsAtStart: 0,
    candidates: []
  });

  const beginGesture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, edge: "start" | "end") => {
      if (!clip) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const state = useTimelineStore.getState();
      gestureRef.current = {
        startX: e.clientX,
        edgeMsAtStart:
          edge === "start" ? clip.startMs : clip.startMs + clip.durationMs,
        candidates: collectSnapCandidates(
          state.clips,
          state.durationMs,
          useTimelinePlaybackStore.getState().getTimeMs(),
          new Set([clip.id])
        )
      };
      history.begin();
    },
    [clip, history]
  );

  const handleTrimStartPointerDown = useCallback<TrimPointerHandler>(
    (e) => {
      // In cut mode, let the event bubble up so the clip body splits instead.
      if (!clip || interactionLocked || activeTool === "cut") {
        return;
      }
      beginGesture(e, "start");
      isTrimmingStartRef.current = true;
    },
    [clip, interactionLocked, activeTool, beginGesture]
  );

  const handleTrimStartPointerMove = useCallback<TrimPointerHandler>(
    (e) => {
      if (
        !isTrimmingStartRef.current ||
        !clip ||
        interactionLocked ||
        e.buttons !== 1
      ) {
        return;
      }
      // Stop bubbling so the parent clip body's drag-pointermove handler
      // does not also fire and shift `startMs`. Without this the clip
      // appears to move and shrink simultaneously.
      e.stopPropagation();
      const fresh = findClipById(useTimelineStore.getState().clips, clip.id);
      if (!fresh) {
        return;
      }
      const { valueMs, guideMs } = targetEdge(gestureRef.current, e, msPerPx);
      // trimClip(edge="start", deltaMs) convention (packages/timeline/src/trimClip.ts):
      //   nextStartMs    = clip.startMs    - deltaMs  (positive = move start left = grow)
      //   nextDurationMs = clip.durationMs + deltaMs
      // so the delta that lands the start edge on `valueMs` is start - value.
      trimClipStart(clip.id, fresh.startMs - valueMs);
      history.mark();
      const trimmed = findClipById(useTimelineStore.getState().clips, clip.id);
      if (trimmed) {
        // An invalid trim leaves the clip alone; then the snap did not land.
        const applied = trimmed.startMs === valueMs ? guideMs : null;
        publishGestureFeedback(
          useTimelineUIStore.getState(),
          applied,
          readoutFor(trimmed, "trim-start")
        );
      }
    },
    [clip, interactionLocked, msPerPx, trimClipStart, history]
  );

  const handleTrimEndPointerDown = useCallback<TrimPointerHandler>(
    (e) => {
      // In cut mode, let the event bubble up so the clip body splits instead.
      if (!clip || interactionLocked || activeTool === "cut") {
        return;
      }
      beginGesture(e, "end");
      isTrimmingEndRef.current = true;
    },
    [clip, interactionLocked, activeTool, beginGesture]
  );

  const handleTrimEndPointerMove = useCallback<TrimPointerHandler>(
    (e) => {
      if (
        !isTrimmingEndRef.current ||
        !clip ||
        interactionLocked ||
        e.buttons !== 1
      ) {
        return;
      }
      // Stop bubbling so the parent clip body's drag-pointermove handler
      // does not also fire and shift `startMs`. Without this the clip
      // appears to move and grow simultaneously.
      e.stopPropagation();
      const fresh = findClipById(useTimelineStore.getState().clips, clip.id);
      if (!fresh) {
        return;
      }
      const { valueMs, guideMs } = targetEdge(gestureRef.current, e, msPerPx);
      // trimClip(edge="end", deltaMs): nextDurationMs = durationMs + deltaMs,
      // so the delta that lands the end edge on `valueMs` is value - end.
      const currentEndMs = fresh.startMs + fresh.durationMs;
      trimClipEnd(clip.id, valueMs - currentEndMs, sourceDurationMs);
      history.mark();
      const trimmed = findClipById(useTimelineStore.getState().clips, clip.id);
      if (trimmed) {
        // The source cap or an invalid trim can stop the edge short of the
        // candidate; only a landed snap shows a guide.
        const applied =
          trimmed.startMs + trimmed.durationMs === valueMs ? guideMs : null;
        publishGestureFeedback(
          useTimelineUIStore.getState(),
          applied,
          readoutFor(trimmed, "trim-end")
        );
      }
    },
    [clip, interactionLocked, msPerPx, trimClipEnd, sourceDurationMs, history]
  );

  const handleTrimPointerEnd = useCallback(() => {
    isTrimmingStartRef.current = false;
    isTrimmingEndRef.current = false;
    clearGestureFeedback(useTimelineUIStore.getState());
    history.end();
  }, [history]);

  return {
    handleTrimStartPointerDown,
    handleTrimStartPointerMove,
    handleTrimEndPointerDown,
    handleTrimEndPointerMove,
    handleTrimPointerEnd
  };
}
