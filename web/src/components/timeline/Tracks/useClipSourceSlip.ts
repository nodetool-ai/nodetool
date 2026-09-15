/**
 * Horizontal two-finger slip editing for media clips.
 *
 * A swipe over a video or audio clip moves its source window without moving
 * the clip in the sequence. The same source-rate conversion used by trimming
 * keeps the gesture visually consistent for clips playing faster or slower
 * than real time.
 */

import { useCallback, useEffect, useRef } from "react";

import { sourceRate, type TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";

const SLIP_GESTURE_IDLE_MS = 150;

export function slipSourceWindow(
  clip: Pick<
    TimelineClip,
    | "durationMs"
    | "inPointMs"
    | "outPointMs"
    | "speedBaked"
    | "speedMultiplier"
  >,
  sourceDeltaMs: number,
  sourceDurationMs: number | undefined
): Pick<TimelineClip, "inPointMs" | "outPointMs"> {
  const inPointMs = clip.inPointMs ?? 0;
  const sourceSpanMs =
    (clip.outPointMs ?? inPointMs + clip.durationMs * sourceRate(clip)) -
    inPointMs;
  const maxInPointMs =
    sourceDurationMs === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, sourceDurationMs - sourceSpanMs);
  const nextInPointMs = Math.min(
    maxInPointMs,
    Math.max(0, inPointMs + sourceDeltaMs)
  );

  if (clip.outPointMs === undefined) {
    return { inPointMs: nextInPointMs };
  }
  return {
    inPointMs: nextInPointMs,
    outPointMs: nextInPointMs + sourceSpanMs
  };
}

interface UseClipSourceSlipOptions {
  clip: TimelineClip | undefined;
  interactionLocked: boolean;
  msPerPx: number;
  sourceDurationMs: number | undefined;
}

/**
 * Binds a non-passive wheel listener to the clip body. It handles a
 * horizontal two-finger swipe before the timeline's scroll listener sees it.
 */
export function useClipSourceSlip({
  clip,
  interactionLocked,
  msPerPx,
  sourceDurationMs
}: UseClipSourceSlipOptions): (element: HTMLDivElement | null) => void {
  const patchClip = useTimelineStore((state) => state.patchClip);
  const { begin, mark, end } = useTimelineHistoryBatch();
  const elementRef = useRef<HTMLDivElement | null>(null);
  const slippingRef = useRef(false);
  const idleTimerRef = useRef<number | null>(null);

  const finishGesture = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (slippingRef.current) {
      slippingRef.current = false;
      end();
    }
  }, [end]);

  useEffect(() => finishGesture, [finishGesture]);

  const setElement = useCallback((element: HTMLDivElement | null) => {
    elementRef.current = element;
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    const supportsSlip =
      clip?.mediaType === "video" || clip?.mediaType === "audio";
    if (!element || !clip || !supportsSlip || interactionLocked || clip.timeRemap) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      // Leave pinch-to-zoom, Shift+wheel, and vertical scrolling to the
      // timeline. A horizontal touchpad gesture has deltaX dominance.
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        Math.abs(event.deltaX) <= Math.abs(event.deltaY)
      ) {
        return;
      }
      const fresh = findClipById(useTimelineStore.getState().clips, clip.id);
      if (
        !fresh ||
        fresh.locked ||
        fresh.timeRemap ||
        (fresh.mediaType !== "video" && fresh.mediaType !== "audio")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (!slippingRef.current) {
        slippingRef.current = true;
        begin();
      }
      const patch = slipSourceWindow(
        fresh,
        event.deltaX * msPerPx * sourceRate(fresh),
        sourceDurationMs
      );
      patchClip(fresh.id, patch);
      mark();
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(
        finishGesture,
        SLIP_GESTURE_IDLE_MS
      );
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [
    clip,
    finishGesture,
    interactionLocked,
    begin,
    mark,
    msPerPx,
    patchClip,
    sourceDurationMs
  ]);

  return setElement;
}
