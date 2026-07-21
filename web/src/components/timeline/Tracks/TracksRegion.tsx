/** @jsxImportSource @emotion/react */
/**
 * TracksRegion
 *
 * Composes the full multi-track surface:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ [TimeRuler]  ← spans header + scrollable area        │
 *   │─────────────────────────────────────────────────────  │
 *   │ [TrackHeader] │  [TrackLane]  ← one row per track    │
 *   │ [TrackHeader] │  [TrackLane]                         │
 *   │ ...           │  ...                                 │
 *   │                                                      │
 *   │ [Playhead]   ← absolute-positioned over all lanes    │
 *   └──────────────────────────────────────────────────────┘
 *
 * Also registers window-level keyboard shortcuts for clip operations:
 *   Delete/Backspace → deleteSelected
 *   ← / →            → nudge selected clips one frame (Shift: 1 s)
 *   Ctrl+A           → select every clip
 *   Escape           → clear selection and return to the select tool
 *   Ctrl+C / X / V   → copy / cut / paste clips (paste lands at the playhead)
 *   Ctrl+D           → duplicateSelected (places duplicate right after source)
 *   Ctrl+Shift+D     → duplicateSelected with extra 1 s gap after source
 *   S                → splitSelectedAtPlayhead
 *   V / C            → select / cut tool
 *   + / =  and  - / _ → zoom in / out (keyboard; playhead stays pinned)
 *   Shift+Z          → zoom to fit all content in the viewport
 *   Ctrl+Z / Ctrl+Y  → undo / redo
 *   ?                → toggle the keyboard-shortcut reference sheet
 * Shortcuts are skipped when focus is in a text input or contenteditable.
 *
 * The user-facing reference for these bindings lives in
 * ../TimelineShortcutsDialog.tsx — keep the two in sync when a shortcut
 * changes.
 *
 * Zoom: Ctrl/Cmd+wheel (or a trackpad pinch) on the lane area changes msPerPx,
 *   anchored at the cursor.
 * Horizontal scroll: a trackpad two-finger horizontal swipe or Shift+wheel
 *   scrolls the lanes left/right. The handler takes the gesture over so the
 *   browser's back/forward swipe never fires at the scroll edges; a plain
 *   vertical wheel still scrolls the tracks list, and the native overflow-x
 *   scrollbar stays available.
 */

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  useTimelineStore,
  useTimelineStoreApi,
  getTimelineTemporal
} from "../../../stores/timeline/TimelineStore";
import {
  useTimelineUIStore,
  useTimelineUIStoreApi,
  MIN_MS_PER_PX,
  MAX_MS_PER_PX
} from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import {
  buildPastedClips,
  copyClipsToClipboard,
  hasClipboardClips
} from "../../../stores/timeline/clipboardOps";
import { TRACK_HEADER_WIDTH_PX } from "./TrackHeader";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import { TimeRuler } from "./TimeRuler";
import { Playhead } from "./Playhead";
import { AddTrackButton } from "./AddTrackButton";
import { ScriptToggleButton } from "./ScriptToggleButton";
import {
  TimelineScrollbar,
  TIMELINE_SCROLLBAR_HEIGHT_PX
} from "./TimelineScrollbar";
import { TrackEffectsPanel } from "./TrackEffectsPanel";
import {
  ScriptLane,
  ScriptLaneHeader,
  SCRIPT_LANE_HEIGHT_PX
} from "./ScriptLane";
import { FX_PANEL_HEIGHT_PX } from "./trackHeight";
import { ToolToggle } from "../ToolToggle";
import { TimelineShortcutsDialog } from "../TimelineShortcutsDialog";
import { FlexRow, HelpButton, FONT_SIZE_MONO, FONT_WEIGHT, BORDER_RADIUS, SPACING, getSpacingPx, Z_INDEX } from "../../ui_primitives";
import { useHasScript } from "../../../hooks/timeline/useHasScript";
import { useVideoAudioImport } from "../../../hooks/timeline/useVideoAudioImport";
import { deserializeDragData } from "../../../lib/dragdrop";
import type { Asset } from "../../../stores/ApiTypes";
import { assetMediaType } from "../dnd/assetToClipAdapter";
import { buildTypedIndexMap } from "./trackVisuals";
import { partitionTimelineWheel, normalizeWheelDeltaPx } from "./timelineWheel";

const DEFAULT_TRACK_HEIGHT_PX = 64;
const ZOOM_SENSITIVITY = 0.001;
/** Extra gap (ms) inserted after the source clip when using Ctrl+Shift+D. */
const DUPLICATE_OFFSET_MS = 1000;
/** Per-keypress zoom step (msPerPx smaller = zoomed in). */
const ZOOM_IN_FACTOR = 0.8;
const ZOOM_OUT_FACTOR = 1.25;
/** Padding kept on each side when Shift+Z fits content to the viewport (px). */
const ZOOM_FIT_PADDING_PX = 64;

const containerStyles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    // Fixed-height panel: never let the flex column shrink it to make room for
    // sibling content (e.g. a tall inspector). Its height is owned solely by
    // the `heightPx` prop, which only the drag handle changes.
    flexShrink: 0,
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default
  });

const toolbarStyles = (theme: Theme) =>
  css({
    height: 36,
    flexShrink: 0,
    padding: `0 ${getSpacingPx(SPACING.lg)} 0 ${getSpacingPx(SPACING.md)}`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper
  });

const tracksSectionHeaderStyles = (theme: Theme) =>
  css({
    width: TRACK_HEADER_WIDTH_PX,
    height: 28,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.sm),
    padding: `0 ${getSpacingPx(SPACING.lg)}`,
    backgroundColor: theme.vars.palette.background.paper,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    color: theme.vars.palette.text.secondary,
    fontSize: FONT_SIZE_MONO.caption,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    userSelect: "none"
  });

const trackCountChipStyles = (theme: Theme) =>
  css({
    marginLeft: "auto",
    minWidth: 18,
    height: 16,
    padding: theme.spacing(0, 1.5),
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: theme.vars.palette.action.hover,
    color: theme.vars.palette.text.secondary,
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: FONT_SIZE_MONO.caption,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: "0"
  });

const headerColumnStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    overflowY: "hidden",
    overflowX: "hidden",
    borderRight: `1px solid ${theme.vars.palette.divider}`
  });

const scrollableAreaStyles = css({
  flex: "1 1 auto",
  overflowX: "auto",
  // Vertical scrolling lives here (not on the outer row) so the horizontal
  // scrollbar stays pinned to the bottom of the visible viewport instead of
  // sliding off-screen below a tall track stack. The header column's scrollTop
  // is synced to this element so headers track the lanes vertically.
  overflowY: "auto",
  position: "relative",
  // Keep an over-scrolled horizontal swipe from triggering the browser's
  // back/forward navigation (the wheel handler also preventDefaults).
  overscrollBehaviorX: "contain"
});

const lanesContainerStyles = css({
  position: "relative",
  // Will be set dynamically via style.width
});

export interface TracksRegionProps {
  /** Height of the tracks area in pixels. */
  heightPx: number;
}

export const TracksRegion: React.FC<TracksRegionProps> = memo(
  ({ heightPx }) => {
    const theme = useTheme();

    const tracks = useTimelineStore((s) => s.tracks);
    // Content extent for sizing the ruler / scroll width. The stored
    // `durationMs` is not recomputed when clips are added or moved, so it can
    // lag far behind the actual clips (it stays 0 for a freshly built
    // timeline). Derive the real end from the clips so the scroll width — and
    // thus the scrollbar — tracks zoom and content.
    //
    // The selector returns a single number, so Zustand already bails out of
    // re-rendering when the max end is unchanged. To also avoid the O(n) scan
    // on every unrelated store change, we cache the result keyed on the
    // `clips` array + `durationMs` identity and only recompute when either
    // actually changes (clips is replaced immutably on every edit).
    const contentEndCacheRef = useRef<{
      clips: unknown;
      durationMs: number;
      value: number;
    }>({ clips: null, durationMs: -1, value: 0 });
    const contentEndMs = useTimelineStore((s) => {
      const cache = contentEndCacheRef.current;
      if (cache.clips === s.clips && cache.durationMs === s.durationMs) {
        return cache.value;
      }
      let maxEnd = s.durationMs;
      for (const c of s.clips) {
        const end = c.startMs + c.durationMs;
        if (end > maxEnd) maxEnd = end;
      }
      cache.clips = s.clips;
      cache.durationMs = s.durationMs;
      cache.value = maxEnd;
      return maxEnd;
    });
    const hasScript = useHasScript();

    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    const setScrollLeftPx = useTimelineUIStore((s) => s.setScrollLeftPx);

    const setActiveTool = useTimelineUIStore((s) => s.setActiveTool);
    const setSelection = useTimelineUIStore((s) => s.setSelection);
    const deleteSelected = useTimelineStore((s) => s.deleteSelected);
    const duplicateSelected = useTimelineStore((s) => s.duplicateSelected);
    const splitSelectedAtPlayhead = useTimelineStore(
      (s) => s.splitSelectedAtPlayhead
    );
    const moveSelectedClips = useTimelineStore((s) => s.moveSelectedClips);
    const addClips = useTimelineStore((s) => s.addClips);
    // Store handles for values read only inside event handlers (playhead
    // time, fps, clip list, selection, zoom). Subscribing reactively to these
    // here would re-render the whole region ~60×/s during playback/zoom/pan
    // and re-attach the keydown listener on every selection change.
    const docStore = useTimelineStoreApi();
    const playbackStore = useTimelinePlaybackStoreApi();
    const uiStoreApi = useTimelineUIStoreApi();

    const addTrack = useTimelineStore((s) => s.addTrack);
    const addImportedClip = useTimelineStore((s) => s.addImportedClip);
    const importVideoWithAudio = useVideoAudioImport();
    const arrowNudgeHistory = useTimelineHistoryBatch();

    const scrollableRef = useRef<HTMLDivElement>(null);
    const headerColumnRef = useRef<HTMLDivElement>(null);

    // Keyboard-shortcut reference sheet (opened with `?` or the toolbar button).
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    // Drop on empty area: auto-create a track of matching type.
    const isAssetDrag = useCallback((e: React.DragEvent): boolean => {
      return (
        e.dataTransfer.types.includes("asset") ||
        e.dataTransfer.types.includes("selectedAssetIds")
      );
    }, []);

    const handleEmptyAreaDragOver = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        if (!isAssetDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      [isAssetDrag]
    );

    const handleEmptyAreaDrop = useCallback(
      (e: React.DragEvent<HTMLDivElement>) => {
        if (!isAssetDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();

        const dragData = deserializeDragData(e.dataTransfer);
        if (!dragData || dragData.type !== "asset") return;
        const asset = dragData.payload as Asset;

        const mediaType = assetMediaType(asset.content_type);
        if (!mediaType) return;

        const trackType: "video" | "audio" =
          mediaType === "audio" ? "audio" : "video";

        const scrollEl = scrollableRef.current;
        if (!scrollEl) return;
        const rect = scrollEl.getBoundingClientRect();
        const dropX = Math.max(0, e.clientX - rect.left);
        const startMs = Math.max(
          0,
          Math.round((dropX + scrollEl.scrollLeft) * msPerPx)
        );

        addTrack(trackType);
        const newTrack =
          useTimelineStore.getState().tracks.slice(-1)[0];
        if (!newTrack) return;
        // A video on a new video track also gets a linked audio clip
        // (extracted from the video), matching the per-lane drop path.
        if (mediaType === "video") {
          void importVideoWithAudio(asset, newTrack.id, startMs);
        } else {
          addImportedClip(asset, newTrack.id, startMs);
        }
      },
      [isAssetDrag, msPerPx, addTrack, addImportedClip, importVideoWithAudio]
    );

    // Total scrollable width from the real content extent, with a trailing pad
    // so the last clip isn't flush against the edge. Quantized to 256-px
    // steps so dragging/trimming the right-most clip (which changes
    // contentEndMs on every pointermove) only re-layouts the scroll area
    // every 256px of content growth instead of every move.
    const totalWidthPx = Math.max(
      Math.ceil((contentEndMs / msPerPx + 200) / 256) * 256,
      1000
    );

    // Track area height minus toolbar + ruler + bottom scrollbar
    const TOOLBAR_HEIGHT = 36;
    const RULER_HEIGHT = 28;
    const lanesHeight = Math.max(
      0,
      heightPx - TOOLBAR_HEIGHT - RULER_HEIGHT - TIMELINE_SCROLLBAR_HEIGHT_PX
    );

    const scrollToLeft = useCallback((px: number) => {
      if (scrollableRef.current) {
        scrollableRef.current.scrollLeft = px;
      }
    }, []);

    const handleScroll = useCallback(
      (e: React.UIEvent<HTMLDivElement>) => {
        setScrollLeftPx(e.currentTarget.scrollLeft);
        // Keep the header column vertically aligned with the lanes (the column
        // clips its own overflow and is scrolled programmatically from here).
        if (headerColumnRef.current) {
          headerColumnRef.current.scrollTop = e.currentTarget.scrollTop;
        }
      },
      [setScrollLeftPx]
    );

    // Zoom + horizontal scroll (wheel).
    // Attached as a native non-passive listener: React's onWheel is passive,
    // so preventDefault() inside it can't stop the browser's pinch-zoom or its
    // back/forward swipe. partitionTimelineWheel routes the gesture (see
    // timelineWheel.ts): Ctrl/Cmd+wheel zooms, a horizontal trackpad swipe or
    // Shift+wheel scrolls the lanes, and a plain vertical wheel is left to
    // bubble to the tracks list's native vertical scroll. Setting el.scrollLeft
    // fires the onScroll handler below, which syncs scrollLeftPx → ruler +
    // playhead.

    // Anchor zoom at the cursor: remember which timeline time sat under the
    // pointer, then restore it to the same viewport x once the lanes have
    // re-rendered at the new scale (layout effect below — scrollLeft set
    // before re-render would clamp against the old content width).
    const zoomAnchorRef = useRef<{ timeMs: number; cursorPx: number } | null>(
      null
    );
    // Previous scale, so a zoom from the buttons/slider (no cursor anchor) can
    // keep the playhead pinned to the same viewport x as the lanes rescale.
    const prevMsPerPxRef = useRef(msPerPx);

    // Zoom accumulation for the wheel listener below: a trackpad pinch
    // delivers 60–120+ Hz of wheel events, so we accumulate the compounded
    // factor from every event landing within one animation frame and apply a
    // SINGLE `setZoom` per frame (trailing rAF) instead of one store publish
    // (→ re-render of every clip/lane/ruler/scrollbar) per event.
    const pendingZoomFactorRef = useRef(1);
    const pendingZoomClientXRef = useRef(0);
    const zoomRafIdRef = useRef<number | null>(null);

    useEffect(() => {
      const el = scrollableRef.current;
      if (!el) return;

      const flushZoom = () => {
        zoomRafIdRef.current = null;
        const factor = pendingZoomFactorRef.current;
        pendingZoomFactorRef.current = 1;
        if (factor === 1) return;

        // Read the live scale from the store (not a render closure) so
        // consecutive rAF flushes compound on top of the zoom the previous
        // flush actually applied, even though this listener never re-attaches.
        const current = uiStoreApi.getState().msPerPx;
        const next = Math.min(
          MAX_MS_PER_PX,
          Math.max(MIN_MS_PER_PX, current * factor)
        );
        if (next === current) return;

        // The container rect is read at most once per flushed frame, not
        // once per wheel event.
        const rect = el.getBoundingClientRect();
        const cursorPx = pendingZoomClientXRef.current - rect.left;
        zoomAnchorRef.current = {
          timeMs: (el.scrollLeft + cursorPx) * current,
          cursorPx
        };
        uiStoreApi.getState().setZoom(next);
      };

      const onWheel = (e: WheelEvent) => {
        const { zoomDelta, scrollDelta } = partitionTimelineWheel(e);

        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          pendingZoomFactorRef.current *= 1 + zoomDelta * ZOOM_SENSITIVITY;
          pendingZoomClientXRef.current = e.clientX;
          if (zoomRafIdRef.current === null) {
            zoomRafIdRef.current = requestAnimationFrame(flushZoom);
          }
          return;
        }

        if (scrollDelta !== 0) {
          // Take the gesture over so a horizontal swipe past the edge can't
          // trigger the browser's back/forward navigation.
          e.preventDefault();
          const deltaPx = normalizeWheelDeltaPx(
            scrollDelta,
            e.deltaMode,
            el.clientWidth
          );
          const maxScrollPx = Math.max(0, el.scrollWidth - el.clientWidth);
          const nextScrollLeft = Math.min(
            maxScrollPx,
            Math.max(0, el.scrollLeft + deltaPx)
          );
          if (nextScrollLeft !== el.scrollLeft) {
            el.scrollLeft = nextScrollLeft;
          }
        }
      };
      // Attached once with stable (empty) deps — msPerPx is read fresh from
      // the store inside flushZoom, never from this closure, so events landing
      // between renders always compute from the current scale.
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        el.removeEventListener("wheel", onWheel);
        if (zoomRafIdRef.current !== null) {
          cancelAnimationFrame(zoomRafIdRef.current);
          zoomRafIdRef.current = null;
        }
      };
    }, [uiStoreApi]);

    // The header column clips its overflow, so a wheel over it would otherwise
    // do nothing. Forward a vertical wheel to the lanes scroller (whose onScroll
    // syncs the column back), matching the pre-split behavior where the whole
    // row scrolled together.
    useEffect(() => {
      const header = headerColumnRef.current;
      if (!header) return;
      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) return;
        const lanes = scrollableRef.current;
        if (!lanes) return;
        const max = Math.max(0, lanes.scrollHeight - lanes.clientHeight);
        if (max <= 0) return;
        e.preventDefault();
        lanes.scrollTop = Math.min(
          max,
          Math.max(0, lanes.scrollTop + e.deltaY)
        );
      };
      header.addEventListener("wheel", onWheel, { passive: false });
      return () => header.removeEventListener("wheel", onWheel);
    }, []);

    useLayoutEffect(() => {
      const el = scrollableRef.current;
      const prevMsPerPx = prevMsPerPxRef.current;
      prevMsPerPxRef.current = msPerPx;
      if (!el) return;

      // Ctrl+wheel set an explicit cursor anchor — keep that timeline point
      // under the pointer.
      const anchor = zoomAnchorRef.current;
      if (anchor) {
        zoomAnchorRef.current = null;
        el.scrollLeft = Math.max(0, anchor.timeMs / msPerPx - anchor.cursorPx);
        return;
      }

      // Otherwise this is a button/slider zoom: keep the playhead at the same
      // viewport x while the lanes rescale ("zoom into the playhead").
      if (prevMsPerPx === msPerPx) return;
      const playMs = playbackStore.getState().currentTimeMs;
      const playheadViewportPx = playMs / prevMsPerPx - el.scrollLeft;
      el.scrollLeft = Math.max(0, playMs / msPerPx - playheadViewportPx);
    }, [msPerPx, playbackStore]);

    // Keyboard shortcuts.
    // Attached at window level so the shortcuts work regardless of which
    // element has focus inside the timeline editor. (Clicking a clip doesn't
    // transfer focus to the tracks region, since Clip's pointerdown calls
    // preventDefault to suppress text selection — which also suppresses the
    // browser's default focus action.) Text inputs and contenteditable
    // regions are skipped so typing isn't hijacked.

    useEffect(() => {
      const isEditableTarget = (target: EventTarget | null): boolean =>
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      // Arrow-key nudge undo batching: a held key repeats ~30×/s, each nudge
      // mutating the store. Without batching that's one undo entry per
      // repeat; begin() on the first nudge of a burst, mark() per nudge, and
      // end() on keyup OR a 400ms trailing timeout (covers focus loss/OS key
      // repeat quirks that swallow the keyup) so the whole burst collapses
      // into a single undo entry.
      let arrowNudgeOpen = false;
      let arrowNudgeTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const endArrowNudgeBatch = () => {
        if (arrowNudgeTimeoutId !== null) {
          clearTimeout(arrowNudgeTimeoutId);
          arrowNudgeTimeoutId = null;
        }
        if (arrowNudgeOpen) {
          arrowNudgeOpen = false;
          arrowNudgeHistory.end();
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (isEditableTarget(e.target)) {
          return;
        }
        // Another timeline surface (e.g. the focused preview's frame-step
        // arrows) already consumed this key.
        if (e.defaultPrevented) {
          return;
        }

        const isCtrl = e.ctrlKey || e.metaKey;

        // ? → toggle the keyboard-shortcut reference sheet. Match the resolved
        // character, not the modifier state: some layouts produce "?" via AltGr
        // (reported as ctrlKey+altKey), so gating on modifiers would hide the
        // shortcut there. Editable targets are already excluded above.
        if (e.key === "?") {
          e.preventDefault();
          setShortcutsOpen((open) => !open);
          return;
        }

        // Read on demand instead of subscribing reactively — subscribing
        // would re-render the region and re-attach this listener on every
        // selection change (e.g. every rubber-band drag tick).
        const { selectedClipIds } = uiStoreApi.getState();

        // Delete / Backspace → delete selected
        if (
          (e.key === "Delete" || e.key === "Backspace") &&
          selectedClipIds.size > 0
        ) {
          e.preventDefault();
          deleteSelected(selectedClipIds);
          return;
        }

        // Ctrl/Cmd+A → select every clip
        if (isCtrl && (e.key === "a" || e.key === "A")) {
          e.preventDefault();
          setSelection(docStore.getState().clips.map((c) => c.id));
          return;
        }

        // Escape → clear selection and drop back to the select tool. No
        // preventDefault so Escape still closes any open menu/dialog.
        if (e.key === "Escape") {
          if (selectedClipIds.size > 0) {
            setSelection([]);
          }
          if (uiStoreApi.getState().activeTool !== "select") {
            setActiveTool("select");
          }
          return;
        }

        // ←/→ → nudge selected clips by one frame (Shift: 1 s)
        if (
          (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
          !isCtrl &&
          !e.altKey &&
          selectedClipIds.size > 0
        ) {
          e.preventDefault();
          if (!arrowNudgeOpen) {
            arrowNudgeOpen = true;
            arrowNudgeHistory.begin();
          }
          const fps = docStore.getState().fps;
          const stepMs = e.shiftKey ? 1000 : Math.round(1000 / Math.max(1, fps));
          const deltaMs = e.key === "ArrowLeft" ? -stepMs : stepMs;
          const primaryId: string = selectedClipIds.values().next().value!;
          moveSelectedClips(primaryId, selectedClipIds, deltaMs);
          arrowNudgeHistory.mark();
          if (arrowNudgeTimeoutId !== null) {
            clearTimeout(arrowNudgeTimeoutId);
          }
          arrowNudgeTimeoutId = setTimeout(endArrowNudgeBatch, 400);
          return;
        }

        // Ctrl+C / Ctrl+X → copy (cut) selected clips
        if (isCtrl && (e.key === "c" || e.key === "x") && selectedClipIds.size > 0) {
          e.preventDefault();
          const clips = docStore
            .getState()
            .clips.filter((c) => selectedClipIds.has(c.id));
          copyClipsToClipboard(clips);
          if (e.key === "x") {
            deleteSelected(selectedClipIds);
          }
          return;
        }

        // Ctrl+V → paste at playhead (earliest clip lands on the playhead,
        // the rest keep their relative offsets)
        if (isCtrl && e.key === "v" && hasClipboardClips()) {
          e.preventDefault();
          const pasted = buildPastedClips(
            docStore.getState().tracks,
            playbackStore.getState().currentTimeMs
          );
          if (pasted.length > 0) {
            addClips(pasted);
            setSelection(pasted.map((c) => c.id));
          }
          return;
        }

        // Ctrl+D → duplicate selected (placed right after each source)
        if (isCtrl && e.key === "d" && !e.shiftKey) {
          e.preventDefault();
          const newIds = duplicateSelected(selectedClipIds);
          if (newIds.length > 0) setSelection(newIds);
          return;
        }

        // Ctrl+Shift+D → duplicate with an extra 1 s gap after each source
        if (isCtrl && e.shiftKey && e.key === "D") {
          e.preventDefault();
          const newIds = duplicateSelected(selectedClipIds, DUPLICATE_OFFSET_MS);
          if (newIds.length > 0) setSelection(newIds);
          return;
        }

        // S → split at playhead (no modifier; avoid hijacking browser Ctrl+S)
        if (e.key === "s" && !isCtrl && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          splitSelectedAtPlayhead(
            playbackStore.getState().currentTimeMs,
            selectedClipIds
          );
          return;
        }

        // V → select tool, C → cut tool (FCP-style)
        if (
          (e.key === "v" || e.key === "c") &&
          !isCtrl &&
          !e.shiftKey &&
          !e.altKey
        ) {
          e.preventDefault();
          setActiveTool(e.key === "v" ? "select" : "cut");
          return;
        }

        // +/= → zoom in, -/_ → zoom out. setZoom triggers the scale-change
        // layout effect above, which keeps the playhead pinned to the same
        // viewport x as the lanes rescale.
        if (!isCtrl && !e.altKey && (e.key === "+" || e.key === "=")) {
          e.preventDefault();
          const cur = uiStoreApi.getState().msPerPx;
          uiStoreApi.getState().setZoom(cur * ZOOM_IN_FACTOR);
          return;
        }
        if (!isCtrl && !e.altKey && (e.key === "-" || e.key === "_")) {
          e.preventDefault();
          const cur = uiStoreApi.getState().msPerPx;
          uiStoreApi.getState().setZoom(cur * ZOOM_OUT_FACTOR);
          return;
        }

        // Shift+Z → zoom so the whole content fits the visible lane width.
        if (!isCtrl && e.shiftKey && (e.key === "z" || e.key === "Z")) {
          e.preventDefault();
          const el = scrollableRef.current;
          if (el) {
            let end = docStore.getState().durationMs || 0;
            for (const c of docStore.getState().clips) {
              end = Math.max(end, c.startMs + c.durationMs);
            }
            const viewport = el.clientWidth - ZOOM_FIT_PADDING_PX;
            if (end > 0 && viewport > 0) {
              // Pin the content start to the left edge as the lanes rescale,
              // reusing the cursor-zoom anchor path (see the layout effect).
              zoomAnchorRef.current = { timeMs: 0, cursorPx: 0 };
              uiStoreApi.getState().setZoom(end / viewport);
            }
          }
          return;
        }

        // Ctrl+Z → undo
        if (isCtrl && !e.shiftKey && e.key === "z") {
          e.preventDefault();
          getTimelineTemporal().undo();
          return;
        }

        // Ctrl+Shift+Z / Ctrl+Y → redo
        if (
          (isCtrl && e.shiftKey && e.key === "Z") ||
          (isCtrl && e.key === "y")
        ) {
          e.preventDefault();
          getTimelineTemporal().redo();
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          endArrowNudgeBatch();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        endArrowNudgeBatch();
      };
    }, [
      uiStoreApi,
      deleteSelected,
      duplicateSelected,
      setSelection,
      splitSelectedAtPlayhead,
      moveSelectedClips,
      addClips,
      docStore,
      playbackStore,
      setActiveTool,
      // useTimelineHistoryBatch() returns a fresh object per render, but
      // begin/mark/end are individually stable (useCallback over a stable
      // store api) — depend on those instead of the wrapper object so this
      // listener doesn't re-attach every render.
      arrowNudgeHistory.begin,
      arrowNudgeHistory.mark,
      arrowNudgeHistory.end
    ]);

    const expandedFxTrackId = useTimelineUIStore(
      (s) => s.expandedFxTrackId
    );

    // Precompute per-type index map (O(n)) to avoid O(n²) per-header lookups.
    const typedIndexMap = useMemo(() => buildTypedIndexMap(tracks), [tracks]);

    const totalTracksHeight =
      tracks.reduce(
        (sum, t) =>
          sum +
          (t.heightPx ?? DEFAULT_TRACK_HEIGHT_PX) +
          (t.id === expandedFxTrackId ? FX_PANEL_HEIGHT_PX : 0),
        0
      ) + (hasScript ? SCRIPT_LANE_HEIGHT_PX : 0);

    // The script lane sits just above the first audio track (between video and
    // audio, Descript-style); if there's no audio track it goes last.
    const scriptBeforeTrackId =
      tracks.find((t) => t.type === "audio")?.id ?? null;

    // The FX panel sticks to the left of the scroll viewport so it stays
    // visible while clips scroll horizontally. Its width matches the
    // scrollable area's visible width.
    const [fxPanelWidth, setFxPanelWidth] = useState(0);
    useEffect(() => {
      const el = scrollableRef.current;
      if (!el) return;
      const update = () => setFxPanelWidth(el.clientWidth);
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    return (
      <div
        css={containerStyles(theme)}
        style={{ height: heightPx }}
        data-testid="tracks-region"
        aria-label="Tracks region"
      >
        {/* ── Tool toolbar (above the ruler) ──────────────────────────── */}
        <FlexRow
          align="center"
          gap={0.5}
          css={toolbarStyles(theme)}
          data-testid="timeline-toolbar"
        >
          <ToolToggle />
          <div style={{ flex: "1 1 auto" }} />
          <ScriptToggleButton />
          <AddTrackButton />
          <HelpButton
            onClick={() => setShortcutsOpen(true)}
            iconVariant="helpOutline"
            tooltip="Keyboard shortcuts (?)"
          />
        </FlexRow>

        {/* ── Sub-header: TRACKS label + ruler ────────────────────────── */}
        <FlexRow align="stretch" fullWidth>
          <div css={tracksSectionHeaderStyles(theme)}>
            <span>Tracks</span>
            <span
              css={trackCountChipStyles(theme)}
              aria-label={`${tracks.length} tracks`}
            >
              {tracks.length}
            </span>
          </div>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <TimeRuler totalWidthPx={totalWidthPx} headerWidthPx={0} />
          </div>
        </FlexRow>

        {/* ── Track rows ──────────────────────────────────────────────── */}
        <FlexRow
          sx={{
            height: lanesHeight,
            overflow: "hidden",
            alignItems: "flex-start"
          }}
          fullWidth
          data-testid="tracks-drop-area"
          onDragOver={handleEmptyAreaDragOver}
          onDrop={handleEmptyAreaDrop}
        >
          {/* Header column — clips vertically; scrolled in sync with the lanes
              via handleScroll so headers line up with their lanes. */}
          <div
            ref={headerColumnRef}
            css={headerColumnStyles(theme)}
            style={{ height: lanesHeight }}
          >
            {tracks.map((track) => (
              <React.Fragment key={track.id}>
                {hasScript && track.id === scriptBeforeTrackId && (
                  <ScriptLaneHeader />
                )}
                <TrackHeader track={track} typedIndex={typedIndexMap.get(track.id) ?? 1} />
                {expandedFxTrackId === track.id && (
                  <div
                    style={{ height: FX_PANEL_HEIGHT_PX }}
                    aria-hidden="true"
                  />
                )}
              </React.Fragment>
            ))}
            {hasScript && scriptBeforeTrackId === null && <ScriptLaneHeader />}
          </div>

          {/* Scrollable lanes */}
          <div
            ref={scrollableRef}
            css={scrollableAreaStyles}
            style={{ height: lanesHeight }}
            onScroll={handleScroll}
            data-testid="tracks-scroll-area"
          >
            <div
              css={lanesContainerStyles}
              style={{ minWidth: totalWidthPx, width: "100%", height: totalTracksHeight }}
            >
              {tracks.map((track) => (
                <React.Fragment key={track.id}>
                  {hasScript && track.id === scriptBeforeTrackId && (
                    <ScriptLane />
                  )}
                  <TrackLane track={track} />
                  {expandedFxTrackId === track.id && (
                    <div
                      style={{
                        position: "sticky",
                        left: 0,
                        width: fxPanelWidth,
                        height: FX_PANEL_HEIGHT_PX,
                        zIndex: Z_INDEX.base + 2
                      }}
                    >
                      <TrackEffectsPanel trackId={track.id} />
                    </div>
                  )}
                </React.Fragment>
              ))}
              {hasScript && scriptBeforeTrackId === null && (
                <ScriptLane />
              )}
            </div>
          </div>
        </FlexRow>

        {/* ── Horizontal scrollbar (always visible, CapCut-style) ─────────── */}
        <TimelineScrollbar
          contentWidthPx={totalWidthPx}
          viewportWidthPx={fxPanelWidth}
          leftInsetPx={TRACK_HEADER_WIDTH_PX}
          onScrollTo={scrollToLeft}
        />

        {/* Playhead overlay: spans ruler + lanes so the pill sits in the
         *  ruler. Positioned at the TracksRegion level so it isn't clipped
         *  by the scrollable area's overflow-y. The wrapper is
         *  pointer-events:none so it doesn't swallow clicks on the ruler or
         *  lanes; the Playhead's hit-area opts back into pointer events. */}
        <div
          style={{
            position: "absolute",
            top: TOOLBAR_HEIGHT,
            bottom: 0,
            left: TRACK_HEADER_WIDTH_PX,
            right: 0,
            pointerEvents: "none",
            overflow: "hidden"
          }}
        >
          <Playhead
            heightPx={RULER_HEIGHT + lanesHeight}
            trackAreaOffsetPx={0}
          />
        </div>

        {/* ── Keyboard-shortcut reference (`?` / toolbar help button) ──── */}
        <TimelineShortcutsDialog
          open={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
        />
      </div>
    );
  }
);

TracksRegion.displayName = "TracksRegion";
