/**
 * useRedrawScheduler
 *
 * Owns rAF batching, dirty-rect merging, and pending stroke drain.
 * Exposes immediate and deferred (rAF) redraw entry-points.
 *
 * When a `DisplayFrameCoordinator` is provided via `coordinatorRef`, all
 * redraw entry-points route through the coordinator's typed `requestFrame`
 * surface instead of managing their own rAF scheduling. This ensures every
 * visual change has a declared reason and urgency, and the coordinator's
 * readiness / tracing / drain ordering invariants are enforced from one place.
 */

import { useCallback, useRef } from "react";
import type { DirtyRect, ActiveStrokeInfo } from "../rendering";
import type { DisplayFrameCoordinator, RedrawReason } from "./DisplayFrameCoordinator";

export interface UseRedrawSchedulerParams {
  /** Direct composite callback for immediate (non-deferred) redraws. */
  compositeToDisplay: (dirtyRect?: DirtyRect | null) => boolean | void;
  /** Ref for deferred rAF callbacks (always reads the latest composite fn). */
  compositeToDisplayRef: React.MutableRefObject<
    (dirtyRect?: DirtyRect | null) => boolean
  >;
  activeStrokeRef: React.MutableRefObject<ActiveStrokeInfo | null>;
  /** Optional coordinator for typed redraw requests. */
  coordinatorRef?: React.MutableRefObject<DisplayFrameCoordinator | null>;
}

export interface UseRedrawSchedulerResult {
  /** Ref holding the current rAF id (needed by the orchestrator for cleanup). */
  redrawRequestRef: React.MutableRefObject<number | null>;
  redraw: () => void;
  redrawDirty: (x: number, y: number, w: number, h: number) => void;
  requestRedraw: () => void;
  requestDirtyRedraw: (x: number, y: number, w: number, h: number) => void;
  drainPendingStrokeCommit: () => void;
}

export function useRedrawScheduler({
  compositeToDisplay,
  compositeToDisplayRef,
  activeStrokeRef,
  coordinatorRef
}: UseRedrawSchedulerParams): UseRedrawSchedulerResult {
  const redrawRequestRef = useRef<number | null>(null);
  /** Pending dirty rect. Null means full redraw. */
  const pendingDirtyRef = useRef<DirtyRect | null>(null);
  const isFullRedrawRef = useRef(false);

  const mergePendingDirtyRect = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const next: DirtyRect = { x, y, w, h };
      const prev = pendingDirtyRef.current;
      if (!prev) {
        pendingDirtyRef.current = next;
        return next;
      }

      const minX = Math.min(prev.x, next.x);
      const minY = Math.min(prev.y, next.y);
      const maxX = Math.max(prev.x + prev.w, next.x + next.w);
      const maxY = Math.max(prev.y + prev.h, next.y + next.h);
      const merged = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      pendingDirtyRef.current = merged;
      return merged;
    },
    []
  );

  // ─── Full redraw ───────────────────────────────────────────────────

  const redraw = useCallback(
    (reason: RedrawReason = "external") => {
      const coord = coordinatorRef?.current;
      if (coord) {
        coord.requestFrame(reason, "immediate");
        return;
      }
      compositeToDisplay(null);
    },
    [compositeToDisplay, coordinatorRef]
  );

  const redrawDirty = useCallback(
    (x: number, y: number, w: number, h: number, reason: RedrawReason = "external") => {
      const coord = coordinatorRef?.current;
      if (coord) {
        if (w <= 0 || h <= 0) {
          coord.requestFrame(reason, "immediate");
        } else {
          coord.setHasLiveBufferedStroke(activeStrokeRef.current != null);
          coord.requestFrame(reason, "immediate", { x, y, w, h });
        }
        return;
      }

      if (w <= 0 || h <= 0) {
        compositeToDisplay(null);
        return;
      }

      if (redrawRequestRef.current !== null) {
        cancelAnimationFrame(redrawRequestRef.current);
        redrawRequestRef.current = null;
      }
      pendingDirtyRef.current = null;
      isFullRedrawRef.current = false;
      // Brush/eraser use a stroke buffer (activeStrokeRef). Clipped composites
      // only repaint a sub-rect; merging layer+buffer for the active layer then
      // stacks incorrectly with the rest of the frame and reads as washed-out /
      // wrong layer opacity. Pencil is "direct" and keeps dirty redraws.
      if (activeStrokeRef.current != null) {
        compositeToDisplay(null);
        return;
      }
      compositeToDisplay({ x, y, w, h });
    },
    [compositeToDisplay, activeStrokeRef, coordinatorRef]
  );

  const drainPendingStrokeCommit = useCallback(() => {
    const stroke = activeStrokeRef.current;
    const pending = stroke?.pendingCommit;
    if (pending) {
      stroke!.pendingCommit = null;
      pending();
    }
  }, [activeStrokeRef]);

  /**
   * Batched redraw using requestAnimationFrame.
   * During active drawing, multiple pointer move events can fire per frame.
   * This coalesces redraws so we only composite layers once per animation frame.
   */
  const requestRedraw = useCallback(
    (reason: RedrawReason = "external") => {
      const coord = coordinatorRef?.current;
      if (coord) {
        coord.requestFrame(reason, "raf");
        return;
      }

      // Mark as full redraw needed
      isFullRedrawRef.current = true;
      pendingDirtyRef.current = null;

      if (redrawRequestRef.current === null) {
        redrawRequestRef.current = requestAnimationFrame(() => {
          redrawRequestRef.current = null;
          isFullRedrawRef.current = false;
          pendingDirtyRef.current = null;
          // Drain any pending stroke buffer merge BEFORE compositing.
          drainPendingStrokeCommit();
          compositeToDisplayRef.current(null);
        });
      }
    },
    [drainPendingStrokeCommit, compositeToDisplayRef, coordinatorRef]
  );

  /**
   * Schedule a partial redraw over a dirty region.
   * Multiple dirty rects are merged into one bounding box.
   * Falls back to full redraw if requestRedraw() was called in the same frame.
   */
  const requestDirtyRedraw = useCallback(
    (x: number, y: number, w: number, h: number, reason: RedrawReason = "external") => {
      const coord = coordinatorRef?.current;
      if (coord) {
        coord.setHasLiveBufferedStroke(activeStrokeRef.current != null);
        coord.requestFrame(reason, "raf", { x, y, w, h });
        return;
      }

      // A full redraw covers the entire canvas, so dirty tracking is unnecessary
      if (isFullRedrawRef.current && redrawRequestRef.current !== null) {
        return;
      }

      mergePendingDirtyRect(x, y, w, h);

      if (redrawRequestRef.current === null) {
        redrawRequestRef.current = requestAnimationFrame(() => {
          redrawRequestRef.current = null;
          const dirty = pendingDirtyRef.current;
          const isFull = isFullRedrawRef.current;
          pendingDirtyRef.current = null;
          isFullRedrawRef.current = false;

          // Drain pending stroke buffer merge before compositing.
          drainPendingStrokeCommit();

          const liveBufferedStroke = activeStrokeRef.current != null;
          if (isFull || !dirty || liveBufferedStroke) {
            compositeToDisplayRef.current(null);
          } else {
            compositeToDisplayRef.current(dirty);
          }
        });
      }
    },
    [
      mergePendingDirtyRect,
      activeStrokeRef,
      drainPendingStrokeCommit,
      compositeToDisplayRef,
      coordinatorRef
    ]
  );

  return {
    redrawRequestRef,
    redraw,
    redrawDirty,
    requestRedraw,
    requestDirtyRedraw,
    drainPendingStrokeCommit
  };
}
