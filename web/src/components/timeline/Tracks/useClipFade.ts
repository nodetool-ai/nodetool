/**
 * useClipFade
 *
 * Drag the fade handle at either end of a clip to set how long its audio
 * ramps in or out, the way Final Cut's fade handles work: pull the left one
 * right to fade in, the right one left to fade out, and push it back to the
 * edge to remove the fade. Right-clicking a handle opens the shape menu.
 *
 * A fade cannot swallow the other one: each is capped at what the clip has
 * left, so the two meet at most in the middle. One undo entry per gesture.
 */

import { useCallback, useMemo, useRef } from "react";
import type React from "react";

import type { ClipFadeShape, TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";

export type ClipFadeEdge = "in" | "out";

export interface ClipFadeHandlers {
  onFadePointerDown: (
    edge: ClipFadeEdge,
    e: React.PointerEvent<HTMLElement>
  ) => void;
  onFadePointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onFadePointerEnd: () => void;
  onFadeContextMenu: (edge: ClipFadeEdge, e: React.MouseEvent) => void;
  onFadeKeyDown: (
    edge: ClipFadeEdge,
    e: React.KeyboardEvent<HTMLElement>
  ) => void;
}

/** Arrow-key step on a focused handle, and its fine-grained Shift variant. */
const KEY_STEP_MS = 100;
const KEY_FINE_STEP_MS = 10;

export interface UseClipFadeOptions {
  clip: TimelineClip | undefined;
  msPerPx: number;
  interactionLocked: boolean;
  /** Opens the fade-shape menu for one edge at the pointer. */
  onRequestShapeMenu: (edge: ClipFadeEdge, x: number, y: number) => void;
}

/** The longest `edge`'s fade can be without eating into the other one. */
export function maxFadeMs(clip: TimelineClip, edge: ClipFadeEdge): number {
  const other = edge === "in" ? clip.fadeOutMs : clip.fadeInMs;
  return Math.max(0, clip.durationMs - Math.max(0, other ?? 0));
}

export function useClipFade({
  clip,
  msPerPx,
  interactionLocked,
  onRequestShapeMenu
}: UseClipFadeOptions): ClipFadeHandlers {
  const patchClip = useTimelineStore((s) => s.patchClip);
  const history = useTimelineHistoryBatch();
  const gestureRef = useRef<{
    edge: ClipFadeEdge;
    startX: number;
    startMs: number;
  } | null>(null);

  const onFadePointerDown = useCallback<ClipFadeHandlers["onFadePointerDown"]>(
    (edge, e) => {
      // Right-click opens the shape menu instead of starting a drag.
      if (!clip || interactionLocked || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      gestureRef.current = {
        edge,
        startX: e.clientX,
        startMs: (edge === "in" ? clip.fadeInMs : clip.fadeOutMs) ?? 0
      };
      history.begin();
    },
    [clip, interactionLocked, history]
  );

  const onFadePointerMove = useCallback<ClipFadeHandlers["onFadePointerMove"]>(
    (e) => {
      const gesture = gestureRef.current;
      if (!gesture || !clip || e.buttons !== 1) return;
      e.stopPropagation();
      // The in handle grows rightwards, the out handle leftwards.
      const dragged =
        (e.clientX - gesture.startX) * msPerPx * (gesture.edge === "in" ? 1 : -1);
      const wanted = Math.round(
        Math.min(maxFadeMs(clip, gesture.edge), Math.max(0, gesture.startMs + dragged))
      );
      patchClip(
        clip.id,
        gesture.edge === "in" ? { fadeInMs: wanted } : { fadeOutMs: wanted }
      );
      history.mark();
    },
    [clip, msPerPx, patchClip, history]
  );

  const onFadePointerEnd = useCallback(() => {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    history.end();
  }, [history]);

  const onFadeContextMenu = useCallback<ClipFadeHandlers["onFadeContextMenu"]>(
    (edge, e) => {
      if (!clip) return;
      e.preventDefault();
      e.stopPropagation();
      onRequestShapeMenu(edge, e.clientX, e.clientY);
    },
    [clip, onRequestShapeMenu]
  );

  // The pointer is not the only way in: a focused handle takes arrow keys,
  // so a fade can be set without a drag.
  const onFadeKeyDown = useCallback<ClipFadeHandlers["onFadeKeyDown"]>(
    (edge, e) => {
      if (!clip || interactionLocked) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? KEY_FINE_STEP_MS : KEY_STEP_MS;
      // Both handles grow when pulled into the clip: right for the in handle,
      // left for the out one.
      const towardsMiddle = edge === "in" ? 1 : -1;
      const delta = (e.key === "ArrowRight" ? 1 : -1) * towardsMiddle * step;
      const current = (edge === "in" ? clip.fadeInMs : clip.fadeOutMs) ?? 0;
      const wanted = Math.min(
        maxFadeMs(clip, edge),
        Math.max(0, current + delta)
      );
      patchClip(
        clip.id,
        edge === "in" ? { fadeInMs: wanted } : { fadeOutMs: wanted }
      );
    },
    [clip, interactionLocked, patchClip]
  );

  return useMemo(
    () => ({
      onFadePointerDown,
      onFadePointerMove,
      onFadePointerEnd,
      onFadeContextMenu,
      onFadeKeyDown
    }),
    [
      onFadePointerDown,
      onFadePointerMove,
      onFadePointerEnd,
      onFadeContextMenu,
      onFadeKeyDown
    ]
  );
}

/** Sets one edge's curve, leaving its length alone. */
export function useSetClipFadeShape(): (
  clipId: string,
  edge: ClipFadeEdge,
  shape: ClipFadeShape
) => void {
  const patchClip = useTimelineStore((s) => s.patchClip);
  return useCallback(
    (clipId, edge, shape) =>
      patchClip(
        clipId,
        edge === "in" ? { fadeInShape: shape } : { fadeOutShape: shape }
      ),
    [patchClip]
  );
}
