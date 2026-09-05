/**
 * useTransitionHandle
 *
 * Drag the right edge of a clip's incoming-transition wedge to change how
 * long the dissolve runs. The store grows the predecessor under the clip as
 * the window grows (see `applyTransitionAtCut`), so the wedge is the whole
 * transition, the way a transition object sits on a cut in other editors.
 * One undo entry per gesture.
 */

import { useCallback, useRef } from "react";
import type React from "react";

import type { TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";

type Handler = (e: React.PointerEvent<HTMLDivElement>) => void;

export interface TransitionHandleHandlers {
  handleTransitionPointerDown: Handler;
  handleTransitionPointerMove: Handler;
  handleTransitionPointerEnd: () => void;
}

export function useTransitionHandle(
  clip: TimelineClip | undefined,
  msPerPx: number,
  interactionLocked: boolean
): TransitionHandleHandlers {
  const setTransitionDuration = useTimelineStore((s) => s.setTransitionDuration);
  const history = useTimelineHistoryBatch();
  const gestureRef = useRef<{ startX: number; startMs: number } | null>(null);

  const handleTransitionPointerDown = useCallback<Handler>(
    (e) => {
      if (!clip || interactionLocked) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      gestureRef.current = {
        startX: e.clientX,
        startMs: clip.transitionIn?.durationMs ?? 0
      };
      history.begin();
    },
    [clip, interactionLocked, history]
  );

  const handleTransitionPointerMove = useCallback<Handler>(
    (e) => {
      const gesture = gestureRef.current;
      if (!gesture || !clip || e.buttons !== 1) return;
      e.stopPropagation();
      const fps = useTimelineStore.getState().fps;
      const minMs = Math.round(1000 / Math.max(1, fps));
      const wanted = Math.max(
        minMs,
        Math.round(gesture.startMs + (e.clientX - gesture.startX) * msPerPx)
      );
      setTransitionDuration(clip.id, wanted);
      history.mark();
    },
    [clip, msPerPx, setTransitionDuration, history]
  );

  const handleTransitionPointerEnd = useCallback(() => {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    history.end();
  }, [history]);

  return {
    handleTransitionPointerDown,
    handleTransitionPointerMove,
    handleTransitionPointerEnd
  };
}
