/**
 * useClipDrag
 *
 * The clip body's pointer gesture: move the clip along its lane, carry a
 * multi-selection with it, re-parent it into another lane, or — with the cut
 * tool active — split it where the pointer landed.
 *
 * Snapping happens here, not in the store: both edges of the primary clip are
 * resolved against a candidate set snapshotted at pointerdown, the closer hit
 * wins, and the store receives the already-snapped delta with snapping off.
 * Alt held disables it. The engaged candidate is published as the snap guide
 * and the clip's live geometry as the gesture readout.
 *
 * When the pointer nears either edge of the scroll container the lanes
 * auto-scroll, and the move is re-applied with the new scroll offset so the
 * clip keeps following the pointer.
 */

import { useCallback, useRef } from "react";
import type React from "react";

import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import type { useLongPress } from "../../../hooks/timeline/useLongPress";
import type { TimelineTool } from "../../../stores/timeline/TimelineUIStore";
import { isCompatibleWithTrack } from "../dnd/assetToClipAdapter";
import {
  clearGestureFeedback,
  collectSnapCandidates,
  publishGestureFeedback,
  readoutFor,
  snapClipWindow
} from "./clipSnap";

/** Clip-side wrapper: TimelineClip.mediaType also includes "overlay";
 *  treat those as video-track-compatible. */
export function isClipCompatibleWithTrack(
  clipMediaType: TimelineClip["mediaType"],
  trackType: TimelineTrack["type"]
): boolean {
  if (
    clipMediaType === "overlay" ||
    clipMediaType === "text" ||
    clipMediaType === "shape" ||
    clipMediaType === "group"
  ) {
    return trackType === "video" || trackType === "overlay";
  }
  return isCompatibleWithTrack(clipMediaType, trackType);
}

/** Pointer travel below which a press is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

/** Distance from a scroll-container edge inside which auto-scroll engages. */
export const AUTO_SCROLL_EDGE_PX = 32;
/** Fastest auto-scroll, reached when the pointer is at or past the edge. */
export const AUTO_SCROLL_MAX_PX_PER_FRAME = 24;

const SCROLL_AREA_SELECTOR = "[data-testid='tracks-scroll-area']";

function isTrackLocked(tracks: readonly TimelineTrack[], trackId: string) {
  return tracks.find((t) => t.id === trackId)?.locked ?? false;
}

/**
 * Signed auto-scroll speed for a pointer x against the container's edges:
 * negative scrolls left, positive right, 0 outside both edge zones. Grows
 * linearly with how far into the zone the pointer is, capped at the max.
 */
export function autoScrollSpeed(
  pointerX: number,
  rect: { left: number; right: number }
): number {
  const leftOvershoot = rect.left + AUTO_SCROLL_EDGE_PX - pointerX;
  const rightOvershoot = pointerX - (rect.right - AUTO_SCROLL_EDGE_PX);
  const scale = AUTO_SCROLL_MAX_PX_PER_FRAME / AUTO_SCROLL_EDGE_PX;
  if (leftOvershoot > 0) {
    return -Math.min(AUTO_SCROLL_MAX_PX_PER_FRAME, leftOvershoot * scale);
  }
  if (rightOvershoot > 0) {
    return Math.min(AUTO_SCROLL_MAX_PX_PER_FRAME, rightOvershoot * scale);
  }
  return 0;
}

interface UseClipDragOptions {
  clip: TimelineClip | undefined;
  clipId: string;
  msPerPx: number;
  activeTool: TimelineTool;
  /** True when the clip or its track is locked: the gesture is refused. */
  interactionLocked: boolean;
  longPress: ReturnType<typeof useLongPress>;
}

interface ClipDragHandlers {
  handleDragPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** True from the first effective move until just after pointerup, so the
   *  click that follows a drag can be told apart from a plain click. */
  isDraggingRef: React.MutableRefObject<boolean>;
}

export function useClipDrag({
  clip,
  clipId,
  msPerPx,
  activeTool,
  interactionLocked,
  longPress
}: UseClipDragOptions): ClipDragHandlers {
  const moveClip = useTimelineStore((s) => s.moveClip);
  const moveSelectedClips = useTimelineStore((s) => s.moveSelectedClips);
  const resolveDrop = useTimelineStore((s) => s.resolveDrop);
  const splitClipAtTime = useTimelineStore((s) => s.splitClipAtTime);

  // Undo batching: the gesture mutates the store on every pointermove. begin()
  // on pointerdown, mark() after each mutation (pauses history once the
  // pre-gesture state has actually been checkpointed), end() on pointerup —
  // so one undo step reverts the whole drag.
  const history = useTimelineHistoryBatch();

  const dragStartXRef = useRef(0);
  const dragStartMsRef = useRef(0);
  const isDraggingRef = useRef(false);

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!clip || interactionLocked) {
        return;
      }
      // Cut tool: split the clip at the pointer's ms position instead of
      // initiating a drag. Skip primary-button check so pen/touch also work.
      if (activeTool === "cut" && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const localPx = e.clientX - rect.left;
        const atMs = clip.startMs + localPx * msPerPx;
        // Refuse no-op splits at the clip boundaries.
        if (atMs > clip.startMs && atMs < clip.startMs + clip.durationMs) {
          splitClipAtTime(clip.id, atMs);
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      // We use window-level pointer listeners (not setPointerCapture on this
      // element) because moveClip(id, _, toTrackId) re-parents the clip into
      // a different TrackLane mid-drag, which would unmount the captured
      // element and abort the gesture. Window listeners survive remounts.
      dragStartXRef.current = e.clientX;
      dragStartMsRef.current = clip.startMs;
      isDraggingRef.current = false;
      longPress.start(e);
      history.begin();

      // The scroll container, for edge auto-scroll. Its rect and scroll
      // offset are captured once: the container does not move during a drag,
      // and the pixel delta must include how far the lanes scrolled since
      // pointerdown or the clip would fall behind the pointer.
      const scrollArea =
        e.currentTarget.closest<HTMLElement>(SCROLL_AREA_SELECTOR);
      const scrollAreaRect = scrollArea?.getBoundingClientRect() ?? null;
      const scrollLeftAtStart = scrollArea?.scrollLeft ?? 0;

      // Snapshot the snap candidates ONCE at gesture start. Only the dragged
      // clip (and, in a multi-selection, its companions) moves, and those are
      // excluded, so the set is stable for the whole gesture.
      const dragStartState = useTimelineStore.getState();
      const dragStartPlayheadMs = useTimelinePlaybackStore
        .getState()
        .getTimeMs();
      const startSelection = useTimelineUIStore.getState().selectedClipIds;
      const excludeIds = new Set<string>([clipId]);
      if (startSelection.has(clipId) && startSelection.size > 1) {
        for (const id of startSelection) {
          excludeIds.add(id);
        }
      }
      const snapCandidates = collectSnapCandidates(
        dragStartState.clips,
        dragStartState.durationMs,
        dragStartPlayheadMs,
        excludeIds
      );

      // Cross-track hit-test is sampled at most once per animation frame.
      // document.elementsFromPoint forces layout/style work, so calling it on
      // every pointermove (~60–120×/s) is costly; we coalesce to one sample
      // per frame using the latest pointer coordinates.
      let crossTrackTargetId: string | undefined;
      let lastPointer = { x: e.clientX, y: e.clientY, altKey: e.altKey };
      let hitTestRafId: number | null = null;
      const sampleCrossTrack = () => {
        hitTestRafId = null;
        const state = useTimelineStore.getState();
        const freshClip = findClipById(state.clips, clipId);
        if (!freshClip) return;
        const elements = document.elementsFromPoint(
          lastPointer.x,
          lastPointer.y
        );
        let foundLaneId: string | undefined;
        for (const el of elements) {
          if (!(el instanceof HTMLElement)) continue;
          const lane = el.closest<HTMLElement>("[data-track-lane-id]");
          if (lane) {
            foundLaneId = lane.dataset.trackLaneId;
            break;
          }
        }
        if (foundLaneId && foundLaneId !== freshClip.trackId) {
          const targetTrack = state.tracks.find((t) => t.id === foundLaneId);
          if (
            targetTrack &&
            !targetTrack.locked &&
            isClipCompatibleWithTrack(freshClip.mediaType, targetTrack.type)
          ) {
            crossTrackTargetId = targetTrack.id;
            return;
          }
        }
        crossTrackTargetId = undefined;
      };

      // Apply the move for the latest known pointer position. Called from
      // pointermove and again from the auto-scroll loop after each scroll
      // step, so the clip tracks the pointer while the lanes slide under it.
      const applyMove = () => {
        const state = useTimelineStore.getState();
        const freshClip = findClipById(state.clips, clipId);
        if (
          !freshClip ||
          freshClip.locked ||
          isTrackLocked(state.tracks, freshClip.trackId)
        ) {
          return;
        }

        const scrollDeltaPx = (scrollArea?.scrollLeft ?? 0) - scrollLeftAtStart;
        const deltaPx = lastPointer.x - dragStartXRef.current + scrollDeltaPx;
        if (!isDraggingRef.current && Math.abs(deltaPx) < DRAG_THRESHOLD_PX) {
          return;
        }
        isDraggingRef.current = true;

        const rawStartMs = Math.max(
          0,
          dragStartMsRef.current + deltaPx * msPerPx
        );
        const { startMs: targetStartMs, guideMs } = lastPointer.altKey
          ? { startMs: rawStartMs, guideMs: null }
          : snapClipWindow(
              rawStartMs,
              freshClip.durationMs,
              snapCandidates,
              msPerPx
            );
        const adjustedDeltaMs = Math.max(0, targetStartMs) - freshClip.startMs;

        const ui = useTimelineUIStore.getState();
        const { selectedClipIds } = ui;
        const isMulti =
          selectedClipIds.has(freshClip.id) && selectedClipIds.size > 1;

        // In a multi-selection only the primary (pointer) clip changes track;
        // the others keep their lanes and follow by the same delta. Snapping
        // is already resolved here, so the store gets it disabled.
        if (isMulti) {
          moveSelectedClips(
            freshClip.id,
            selectedClipIds,
            adjustedDeltaMs,
            crossTrackTargetId,
            undefined,
            undefined,
            true
          );
        } else {
          moveClip(
            freshClip.id,
            adjustedDeltaMs,
            crossTrackTargetId,
            undefined,
            undefined,
            true
          );
        }
        // First effective mutation recorded the pre-drag state; batch the rest.
        history.mark();

        const movedClip = findClipById(
          useTimelineStore.getState().clips,
          clipId
        );
        if (movedClip) {
          // The store clamps at t=0; a snap that got clamped away is no snap.
          const applied = movedClip.startMs === targetStartMs ? guideMs : null;
          publishGestureFeedback(ui, applied, readoutFor(movedClip, "move"));
        }
      };

      // Edge auto-scroll: one rAF loop that runs only while the pointer is in
      // an edge zone and the container can still scroll that way.
      let autoScrollRafId: number | null = null;
      const stopAutoScroll = () => {
        if (autoScrollRafId !== null) {
          cancelAnimationFrame(autoScrollRafId);
          autoScrollRafId = null;
        }
      };
      const autoScrollStep = () => {
        autoScrollRafId = null;
        if (!scrollArea || !scrollAreaRect) return;
        const speed = autoScrollSpeed(lastPointer.x, scrollAreaRect);
        if (speed === 0) return;
        const maxScrollLeft = scrollArea.scrollWidth - scrollArea.clientWidth;
        const next = Math.max(
          0,
          Math.min(maxScrollLeft, scrollArea.scrollLeft + speed)
        );
        if (next === scrollArea.scrollLeft) return;
        scrollArea.scrollLeft = next;
        applyMove();
        autoScrollRafId = requestAnimationFrame(autoScrollStep);
      };
      const updateAutoScroll = () => {
        if (!scrollAreaRect) return;
        const inZone = autoScrollSpeed(lastPointer.x, scrollAreaRect) !== 0;
        if (!inZone) {
          stopAutoScroll();
        } else if (autoScrollRafId === null) {
          autoScrollRafId = requestAnimationFrame(autoScrollStep);
        }
      };

      const onMove = (ev: PointerEvent) => {
        longPress.move(ev);
        if (ev.buttons !== 1) return;
        lastPointer = { x: ev.clientX, y: ev.clientY, altKey: ev.altKey };
        // Sampled at most once per frame; the latest known target is applied
        // immediately so the clip still follows the cursor into a new lane.
        if (hitTestRafId === null) {
          hitTestRafId = requestAnimationFrame(sampleCrossTrack);
        }
        applyMove();
        if (isDraggingRef.current) {
          updateAutoScroll();
        }
      };

      const onUpOrCancel = (ev?: PointerEvent) => {
        longPress.cancel();
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUpOrCancel);
        window.removeEventListener("pointercancel", onUpOrCancel);
        if (hitTestRafId !== null) {
          cancelAnimationFrame(hitTestRafId);
          hitTestRafId = null;
        }
        stopAutoScroll();
        clearGestureFeedback(useTimelineUIStore.getState());
        if (isDraggingRef.current && ev?.type === "pointerup") {
          // The drop settles inside the gesture's undo entry. Ctrl/Cmd on
          // release forces insert; otherwise the toolbar's drop mode applies.
          const ui = useTimelineUIStore.getState();
          const moved =
            ui.selectedClipIds.has(clipId) && ui.selectedClipIds.size > 1
              ? new Set(ui.selectedClipIds)
              : new Set([clipId]);
          resolveDrop(
            moved,
            ev.ctrlKey || ev.metaKey ? "insert" : ui.dropMode
          );
          history.mark();
        }
        history.end();
        // Defer dragging flag reset so the synthetic click that follows
        // pointerup is still suppressed by handleClick.
        const wasDragging = isDraggingRef.current;
        if (wasDragging) {
          setTimeout(() => {
            isDraggingRef.current = false;
          }, 0);
        } else {
          isDraggingRef.current = false;
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUpOrCancel);
      window.addEventListener("pointercancel", onUpOrCancel);
    },
    [
      clip,
      clipId,
      activeTool,
      interactionLocked,
      longPress,
      msPerPx,
      splitClipAtTime,
      moveClip,
      moveSelectedClips,
      resolveDrop,
      history
    ]
  );

  return { handleDragPointerDown, isDraggingRef };
}
