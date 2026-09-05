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
import {
  MOBILE_TRACK_HEADER_WIDTH_PX,
  TRACK_HEADER_WIDTH_PX,
  TRACK_HEADER_WIDTH_VAR,
  trackHeaderWidthCss
} from "./TrackHeader";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import { RubberBandOverlay } from "./RubberBandOverlay";
import { SnapGuideOverlay } from "./SnapGuideOverlay";
import { GestureReadout } from "./GestureReadout";
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
import { useTimelineIsMobile } from "../../../hooks/timeline/useTimelineIsMobile";
import { useVideoAudioImport } from "../../../hooks/timeline/useVideoAudioImport";
import { deserializeDragData } from "../../../lib/dragdrop";
import { assetMediaType } from "../dnd/assetToClipAdapter";
import { buildTypedIndexMap } from "./trackVisuals";
import { partitionTimelineWheel, normalizeWheelDeltaPx } from "./timelineWheel";
import { resolveTimelineAction } from "../timelineKeymap";
import { performSourceEdit } from "../sourceEdit";
import {
  getSelectedAssetForExplorer,
  useAssetsSelectedAsset,
  useLibrarySelectedAsset
} from "../../../stores/AssetGridStore";
import { usePanelStore } from "../../../stores/PanelStore";
import {
  hasKeyframeAt,
  keyframeTimesMs,
  keyframeValueAt
} from "@nodetool-ai/timeline";
import { useSettingsStore } from "../../../stores/SettingsStore";

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

const TOOLBAR_HEIGHT_PX = 36;
/** Phone toolbar: tall enough for the app-wide 44px touch target. */
const TOUCH_TOOLBAR_HEIGHT_PX = 44;

const toolbarStyles = (theme: Theme, compact: boolean) =>
  css({
    height: compact ? TOUCH_TOOLBAR_HEIGHT_PX : TOOLBAR_HEIGHT_PX,
    flexShrink: 0,
    padding: compact
      ? `0 ${getSpacingPx(SPACING.sm)}`
      : `0 ${getSpacingPx(SPACING.lg)} 0 ${getSpacingPx(SPACING.md)}`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper
  });

const tracksSectionHeaderStyles = (theme: Theme, compact: boolean) =>
  css({
    width: trackHeaderWidthCss,
    height: 28,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.sm),
    padding: `0 ${getSpacingPx(compact ? SPACING.sm : SPACING.lg)}`,
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
  // Panning stays with the browser (it scrolls this element); pinching does
  // not, so the two-finger gesture below zooms the timeline instead of the
  // page. Without this the browser claims the pinch and the handler never
  // sees the second pointer.
  touchAction: "pan-x pan-y",
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

interface TracksRegionProps {
  /** Height of the tracks area in pixels. */
  heightPx: number;
}

export const TracksRegion: React.FC<TracksRegionProps> = memo(
  ({ heightPx }) => {
    const theme = useTheme();
    const isMobile = useTimelineIsMobile();
    const activeExplorer = usePanelStore((s) =>
      s.panel.activeView === "library" || s.panel.activeView === "assets"
        ? s.panel.activeView
        : null
    );
    const assetsAsset = useAssetsSelectedAsset();
    const libraryAsset = useLibrarySelectedAsset();
    const activeAssetId = activeExplorer === "library"
      ? libraryAsset?.id ?? null
      : activeExplorer === "assets"
        ? assetsAsset?.id ?? null
        : null;
    const headerWidthPx = isMobile
      ? MOBILE_TRACK_HEADER_WIDTH_PX
      : TRACK_HEADER_WIDTH_PX;

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
    const previousSourceAssetId = useRef<string | null>(null);
    useEffect(() => {
      if (previousSourceAssetId.current !== activeAssetId) {
        uiStoreApi.getState().setSourceRange(null);
        previousSourceAssetId.current = activeAssetId;
      }
    }, [activeAssetId, uiStoreApi]);

    const addTrack = useTimelineStore((s) => s.addTrack);
    const addImportedClip = useTimelineStore((s) => s.addImportedClip);
    const importVideoWithAudio = useVideoAudioImport();
    const arrowNudgeHistory = useTimelineHistoryBatch();

    const scrollableRef = useRef<HTMLDivElement>(null);
    const headerColumnRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [toolbarNarrow, setToolbarNarrow] = useState(false);

    useEffect(() => {
      const element = toolbarRef.current;
      if (!element) return;
      // The labelled tool group is wider than the editor once the inspector
      // or asset panel is open. Switch to the compact controls before the
      // right-side actions are forced outside the toolbar.
      const update = () => {
        if (element.clientWidth === 0) return;
        setToolbarNarrow(element.clientWidth < 1100);
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    const toolbarCompact = isMobile || toolbarNarrow;

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
        const asset = dragData.payload;

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
    const TOOLBAR_HEIGHT = isMobile
      ? TOUCH_TOOLBAR_HEIGHT_PX
      : TOOLBAR_HEIGHT_PX;
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

    // A deep link into the cut (a storyboard shot's clip) selects a clip that
    // may sit off-screen. `revealRequest` carries the position it wants seen;
    // bring it a quarter-viewport in, and leave the view alone when it is
    // already comfortably inside. Zoom is read imperatively so a later zoom
    // does not re-run this against a stale request.
    const revealRequest = useTimelineUIStore((s) => s.revealRequest);
    useEffect(() => {
      const el = scrollableRef.current;
      if (!el || !revealRequest) return;
      const targetPx = revealRequest.timeMs / uiStoreApi.getState().msPerPx;
      const margin = el.clientWidth * 0.25;
      const tooFarLeft = targetPx < el.scrollLeft + margin;
      const tooFarRight = targetPx > el.scrollLeft + el.clientWidth - margin;
      if (tooFarLeft || tooFarRight) {
        el.scrollLeft = Math.max(0, targetPx - margin);
      }
    }, [revealRequest, uiStoreApi]);

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

    // Pinch-to-zoom (touch). The desktop route to zoom is Ctrl+wheel, which a
    // phone has no way to produce; without this the only zoom on a phone is the
    // status-bar buttons, and trimming to a frame needs a scale you can reach
    // mid-gesture. Feeds the same setZoom + `zoomAnchorRef` path the wheel
    // handler uses, so the point between the fingers stays put as the lanes
    // rescale.
    useEffect(() => {
      const el = scrollableRef.current;
      if (!el) return;

      const points = new Map<number, { x: number; y: number }>();
      let startDistance = 0;
      let startMsPerPx = 0;
      let rafId: number | null = null;

      const twoPoints = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
        if (points.size !== 2) return null;
        const [a, b] = [...points.values()];
        return [a, b];
      };

      const applyPinch = () => {
        rafId = null;
        const pair = twoPoints();
        if (!pair || startDistance === 0) return;
        const [a, b] = pair;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance === 0) return;

        // Fingers apart → smaller msPerPx → zoomed in.
        const next = Math.min(
          MAX_MS_PER_PX,
          Math.max(MIN_MS_PER_PX, startMsPerPx * (startDistance / distance))
        );
        const current = uiStoreApi.getState().msPerPx;
        if (next === current) return;

        const rect = el.getBoundingClientRect();
        const midPx = (a.x + b.x) / 2 - rect.left;
        zoomAnchorRef.current = {
          timeMs: (el.scrollLeft + midPx) * current,
          cursorPx: midPx
        };
        uiStoreApi.getState().setZoom(next);
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.pointerType !== "touch") return;
        points.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (points.size === 2) {
          const pair = twoPoints();
          if (!pair) return;
          startDistance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
          startMsPerPx = uiStoreApi.getState().msPerPx;
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!points.has(e.pointerId)) return;
        points.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (points.size !== 2 || startDistance === 0) return;
        // A pinch delivers well over one move per frame per finger; batch to
        // one setZoom per frame so the lanes/clips/ruler re-render once.
        if (rafId === null) rafId = requestAnimationFrame(applyPinch);
      };

      const onPointerUp = (e: PointerEvent) => {
        points.delete(e.pointerId);
        if (points.size < 2) startDistance = 0;
      };

      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", onPointerUp);
      return () => {
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
        el.removeEventListener("pointercancel", onPointerUp);
        if (rafId !== null) cancelAnimationFrame(rafId);
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

        const preset =
          useSettingsStore.getState().settings.timelineKeyboardPreset;
        const action = resolveTimelineAction(e, preset);
        if (action === null) {
          return;
        }

        // Read on demand instead of subscribing reactively — subscribing
        // would re-render the region and re-attach this listener on every
        // selection change (e.g. every rubber-band drag tick).
        const ui = uiStoreApi.getState();
        const { selectedClipIds } = ui;
        const doc = docStore.getState();
        const playback = playbackStore.getState();
        const liveMs = playback.getTimeMs();
        const frameMs = 1000 / Math.max(1, doc.fps);

        // Keyboard trims act on the selected edit point (a clicked clip edge).
        // Ripple mode decides whether later clips follow.
        const trimEdit = (edgeTargetMs: number): boolean => {
          const edit = ui.selectedEdit;
          if (!edit) return false;
          const target = doc.clips.find((c) => c.id === edit.clipId);
          if (!target) return false;
          if (edit.edge === "start") {
            const delta = target.startMs - edgeTargetMs;
            if (ui.rippleMode) doc.rippleTrimClipStart(target.id, delta);
            else doc.trimClipStart(target.id, delta);
          } else {
            const delta = edgeTargetMs - (target.startMs + target.durationMs);
            if (ui.rippleMode) doc.rippleTrimClipEnd(target.id, delta);
            else doc.trimClipEnd(target.id, delta);
          }
          return true;
        };
        const trimEditBy = (deltaMs: number): boolean => {
          const edit = ui.selectedEdit;
          const target = edit
            ? doc.clips.find((c) => c.id === edit.clipId)
            : undefined;
          if (!edit || !target) return false;
          const edgeMs =
            edit.edge === "start"
              ? target.startMs
              : target.startMs + target.durationMs;
          return trimEdit(edgeMs + deltaMs);
        };
        const nudge = (deltaMs: number) => {
          if (!arrowNudgeOpen) {
            arrowNudgeOpen = true;
            arrowNudgeHistory.begin();
          }
          const primaryId: string = selectedClipIds.values().next().value!;
          moveSelectedClips(primaryId, selectedClipIds, deltaMs);
          arrowNudgeHistory.mark();
          if (arrowNudgeTimeoutId !== null) {
            clearTimeout(arrowNudgeTimeoutId);
          }
          arrowNudgeTimeoutId = setTimeout(endArrowNudgeBatch, 400);
        };
        const seekToNeighbour = (times: number[], forward: boolean) => {
          const sorted = [...times].sort((a, b) => a - b);
          const target = forward
            ? sorted.find((t) => t > liveMs + 1)
            : sorted.filter((t) => t < liveMs - 1).at(-1);
          if (target !== undefined) playback.seek(target);
        };
        const shuttle = (dir: 1 | -1) => {
          const cur = playback.rate;
          const sameDir = playback.isPlaying && Math.sign(cur) === dir;
          const next = sameDir
            ? Math.sign(cur) * Math.min(8, Math.abs(cur) * 2)
            : dir;
          playback.setRate(next);
          if (!playback.isPlaying) {
            playback.play();
          }
          // A seek while playing restarts the clock and audio at the new
          // rate; see PreviewArea's seek-restart effect.
          playback.seek(liveMs);
        };

        switch (action) {
          case "toggleShortcuts":
            e.preventDefault();
            // Ignore auto-repeat so holding the key doesn't flip the dialog
            // open/closed every repeat tick.
            if (!e.repeat) setShortcutsOpen((open) => !open);
            return;

          case "deleteSelected":
          case "rippleDeleteSelected":
            if (selectedClipIds.size === 0) return;
            e.preventDefault();
            if (action === "rippleDeleteSelected" || ui.rippleMode) {
              doc.rippleDeleteSelected(selectedClipIds);
            } else {
              deleteSelected(selectedClipIds);
            }
            return;

          case "splitAtPlayhead":
            e.preventDefault();
            splitSelectedAtPlayhead(playback.currentTimeMs, selectedClipIds);
            return;

          case "cutAllTracks":
            e.preventDefault();
            splitSelectedAtPlayhead(playback.currentTimeMs, new Set());
            return;

          case "extendEdit":
            if (trimEdit(liveMs)) e.preventDefault();
            return;
          case "trimEditLeft":
            if (trimEditBy(-Math.round(frameMs))) e.preventDefault();
            return;
          case "trimEditRight":
            if (trimEditBy(Math.round(frameMs))) e.preventDefault();
            return;
          case "trimEditLeftLarge":
            if (trimEditBy(-Math.round(frameMs * 10))) e.preventDefault();
            return;
          case "trimEditRightLarge":
            if (trimEditBy(Math.round(frameMs * 10))) e.preventDefault();
            return;

          case "markIn":
            e.preventDefault();
            playback.setRangeIn(liveMs);
            return;
          case "markOut":
            e.preventDefault();
            playback.setRangeOut(liveMs);
            return;
          case "clearRange":
            e.preventDefault();
            playback.clearRange();
            return;

          case "shuttleBack":
            e.preventDefault();
            shuttle(-1);
            return;
          case "shuttleForward":
            e.preventDefault();
            shuttle(1);
            return;
          case "shuttleStop":
            e.preventDefault();
            if (playback.isPlaying) playback.pause();
            playback.setRate(1);
            return;

          case "addMarker":
            e.preventDefault();
            doc.addMarker({
              timeMs: liveMs,
              label: `Marker ${doc.markers.length + 1}`
            });
            return;
          case "nextMarker":
          case "prevMarker":
            e.preventDefault();
            seekToNeighbour(
              doc.markers.map((m) => m.timeMs),
              action === "nextMarker"
            );
            return;

          case "prevCut":
          case "nextCut": {
            e.preventDefault();
            const pts = new Set<number>([0]);
            for (const c of doc.clips) {
              pts.add(c.startMs);
              pts.add(c.startMs + c.durationMs);
            }
            seekToNeighbour([...pts], action === "nextCut");
            return;
          }

          case "selectAll":
            e.preventDefault();
            setSelection(doc.clips.map((c) => c.id));
            return;

          case "escape":
            // No preventDefault so Escape still closes any open menu/dialog.
            if (selectedClipIds.size > 0 || ui.selectedEdit) {
              setSelection([]);
            }
            if (ui.activeTool !== "select") {
              setActiveTool("select");
            }
            return;

          case "nudgeLeft":
          case "nudgeRight":
          case "nudgeLeftLarge":
          case "nudgeRightLarge": {
            if (selectedClipIds.size === 0) return;
            e.preventDefault();
            const large = action.endsWith("Large");
            const stepMs = large ? 1000 : Math.round(frameMs);
            nudge(action.startsWith("nudgeLeft") ? -stepMs : stepMs);
            return;
          }

          case "copy":
          case "cut": {
            if (selectedClipIds.size === 0) return;
            e.preventDefault();
            copyClipsToClipboard(
              doc.clips.filter((c) => selectedClipIds.has(c.id))
            );
            if (action === "cut") {
              deleteSelected(selectedClipIds);
            }
            return;
          }

          case "paste": {
            if (!hasClipboardClips()) return;
            e.preventDefault();
            // The earliest clip lands on the playhead, the rest keep their
            // relative offsets.
            const pasted = buildPastedClips(doc.tracks, playback.currentTimeMs);
            if (pasted.length > 0) {
              addClips(pasted);
              setSelection(pasted.map((c) => c.id));
            }
            return;
          }

          case "duplicate":
          case "duplicateWithGap": {
            e.preventDefault();
            const newIds = duplicateSelected(
              selectedClipIds,
              action === "duplicateWithGap" ? DUPLICATE_OFFSET_MS : 0
            );
            if (newIds.length > 0) setSelection(newIds);
            return;
          }

          case "selectTool":
            e.preventDefault();
            setActiveTool("select");
            return;
          case "cutTool":
            e.preventDefault();
            setActiveTool("cut");
            return;
          case "toggleSnap":
            e.preventDefault();
            ui.toggleSnap();
            return;

          // setZoom triggers the scale-change layout effect above, which
          // keeps the playhead pinned to the same viewport x as the lanes
          // rescale.
          case "zoomIn":
            e.preventDefault();
            ui.setZoom(ui.msPerPx * ZOOM_IN_FACTOR);
            return;
          case "zoomOut":
            e.preventDefault();
            ui.setZoom(ui.msPerPx * ZOOM_OUT_FACTOR);
            return;
          case "zoomFit": {
            e.preventDefault();
            const el = scrollableRef.current;
            if (!el) return;
            let end = doc.durationMs || 0;
            for (const c of doc.clips) {
              end = Math.max(end, c.startMs + c.durationMs);
            }
            const viewport = el.clientWidth - ZOOM_FIT_PADDING_PX;
            if (end > 0 && viewport > 0) {
              // Pin the content start to the left edge as the lanes rescale,
              // reusing the cursor-zoom anchor path (see the layout effect).
              zoomAnchorRef.current = { timeMs: 0, cursorPx: 0 };
              ui.setZoom(end / viewport);
            }
            return;
          }

          case "undo":
            e.preventDefault();
            getTimelineTemporal().undo();
            return;
          case "redo":
            e.preventDefault();
            getTimelineTemporal().redo();
            return;

          case "applyDefaultTransition":
            if (selectedClipIds.size === 0) return;
            e.preventDefault();
            doc.applyDefaultTransition(selectedClipIds);
            return;

          case "addKeyframe":
          case "nextKeyframe":
          case "prevKeyframe": {
            // The selected clip (one) and the inspector's armed property.
            if (selectedClipIds.size !== 1) return;
            const clipId: string = selectedClipIds.values().next().value!;
            const target = doc.clips.find((c) => c.id === clipId);
            if (!target) return;
            e.preventDefault();
            const relMs = liveMs - target.startMs;
            if (action === "addKeyframe") {
              if (relMs < 0 || relMs > target.durationMs) return;
              const property = ui.keyframeProperty;
              if (hasKeyframeAt(target, property, relMs)) {
                doc.removeClipKeyframe(clipId, property, relMs);
              } else {
                doc.setClipKeyframe(
                  clipId,
                  property,
                  relMs,
                  keyframeValueAt(target, property, relMs)
                );
              }
              return;
            }
            seekToNeighbour(
              keyframeTimesMs(target).map((t) => target.startMs + t),
              action === "nextKeyframe"
            );
            return;
          }

          case "sourceAppend":
          case "sourceInsert":
          case "sourceOverwrite": {
            const kind =
              action === "sourceAppend"
                ? "append"
                : action === "sourceInsert"
                  ? "insert"
                  : "overwrite";
            const id = performSourceEdit(kind, {
              doc,
              ui,
              playheadMs: playback.currentTimeMs,
              asset: activeExplorer
                ? getSelectedAssetForExplorer(activeExplorer) ?? undefined
                : undefined
            });
            if (id) {
              e.preventDefault();
              setSelection([id]);
            }
            return;
          }
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          endArrowNudgeBatch();
        }
      };

      // Not on the dispatcher: the arrow-nudge batch closes on keyup, and
      // KeyPressedStore only dispatches combos on keydown.
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
      arrowNudgeHistory.end,
      activeExplorer
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
        style={
          {
            height: heightPx,
            [TRACK_HEADER_WIDTH_VAR]: `${headerWidthPx}px`
          } as React.CSSProperties
        }
        data-testid="tracks-region"
        aria-label="Tracks region"
      >
        {/* ── Tool toolbar (above the ruler) ──────────────────────────── */}
        <FlexRow
          ref={toolbarRef}
          align="center"
          gap={SPACING.micro}
          css={toolbarStyles(theme, toolbarCompact)}
          data-testid="timeline-toolbar"
        >
          <ToolToggle compact={toolbarCompact} />
          <div style={{ flex: "1 1 auto" }} />
          <ScriptToggleButton compact={toolbarCompact} />
          <AddTrackButton compact={toolbarCompact} />
          {/* The shortcut sheet documents keyboard bindings — nothing a phone
              can act on, and the row has no width to spare. */}
          {!isMobile && (
            <HelpButton
              onClick={() => setShortcutsOpen(true)}
              iconVariant="helpOutline"
              tooltip="Keyboard shortcuts (?)"
            />
          )}
        </FlexRow>

        {/* ── Sub-header: TRACKS label + ruler ────────────────────────── */}
        <FlexRow align="stretch" fullWidth>
          <div css={tracksSectionHeaderStyles(theme, isMobile)}>
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
                <TrackHeader
                  track={track}
                  typedIndex={typedIndexMap.get(track.id) ?? 1}
                  compact={isMobile}
                />
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
              data-timeline-lanes="true"
            >
              {/* Zero-size sticky anchor: must be the first child so its
                  in-flow position is the container's top-left corner. */}
              <GestureReadout />
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
              {/* Marquee rect — drawn here, above every lane, because a band
                  started on one lane may cover several. */}
              <RubberBandOverlay />
              <SnapGuideOverlay />
            </div>
          </div>
        </FlexRow>

        {/* ── Horizontal scrollbar (always visible, CapCut-style) ─────────── */}
        <TimelineScrollbar
          contentWidthPx={totalWidthPx}
          viewportWidthPx={fxPanelWidth}
          leftInsetPx={headerWidthPx}
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
            left: headerWidthPx,
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
