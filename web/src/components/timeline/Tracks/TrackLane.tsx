/** @jsxImportSource @emotion/react */
/**
 * TrackLane
 *
 * Horizontal strip for a single track. Renders all clips belonging to the
 * track as absolute-positioned children:
 *   left  = clip.startMs / msPerPx
 *   width = clip.durationMs / msPerPx
 *
 * Supports:
 *   - Click on empty space → clear selection
 *   - Rubber-band selection (pointer drag on empty space), which extends
 *     across every lane the band covers, not just this one
 *   - Drop target for clips dragged from other tracks
 *   - Drop target for assets dragged from AssetExplorer (NOD-304)
 */

import React, {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import AddIcon from "@mui/icons-material/Add";
import CompressOutlinedIcon from "@mui/icons-material/CompressOutlined";
import { findGap } from "@nodetool-ai/timeline";
import TitleIcon from "@mui/icons-material/Title";

import {
  makeClip,
  DEFAULT_TEXT_CLIP_COLOR,
  DEFAULT_TEXT_CLIP_DURATION_MS,
  DEFAULT_TEXT_CLIP_FONT_SIZE_PX,
  type TimelineTrack
} from "@nodetool-ai/timeline";
import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { clipIdsByTrack } from "../../../stores/timeline/clipLookup";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { Clip } from "./Clip";
import { ContextMenu, WarningBanner, MOTION, MenuItemPrimitive, Z_INDEX } from "../../ui_primitives";
import { AddClipMenu } from "../AddClipMenu";
import { deserializeDragData } from "../../../lib/dragdrop";
import type { Asset } from "../../../stores/ApiTypes";
import {
  assetMediaType,
  isCompatibleWithTrack
} from "../dnd/assetToClipAdapter";
import { useVideoAudioImport } from "../../../hooks/timeline/useVideoAudioImport";
import { useLongPress } from "../../../hooks/timeline/useLongPress";
import type { LongPressPoint } from "../../../hooks/timeline/useLongPress";

const DEFAULT_TRACK_HEIGHT_PX = 64;
const NO_CLIP_IDS: string[] = [];
/** Duration (ms) the mismatch warning banner remains visible. */
const WARNING_DISMISS_MS = 3000;

const laneStyles = (
  theme: Theme,
  heightPx: number,
  visible: boolean,
  isRubberBanding: boolean,
  isDragOver: boolean,
  isDragReject: boolean
) =>
  css({
    position: "relative",
    width: "100%",
    height: heightPx,
    flexShrink: 0,
    backgroundColor: theme.vars.palette.background.default,
    opacity: visible ? 1 : 0.55,
    borderBottom: `1px solid ${
      isDragReject
        ? theme.vars.palette.error.main
        : isDragOver
          ? theme.vars.palette.primary.main
          : theme.vars.palette.divider
    }`,
    outline: isDragOver
      ? `2px solid ${theme.vars.palette.primary.main}`
      : isDragReject
        ? `2px solid ${theme.vars.palette.error.main}`
        : "none",
    outlineOffset: "-2px",
    overflow: "hidden",
    cursor: isRubberBanding ? "crosshair" : "default",
    transition: `opacity ${MOTION.fast}`
  });

interface TrackLaneProps {
  track: TimelineTrack;
}

export const TrackLane: React.FC<TrackLaneProps> = memo(({ track }) => {
  const theme = useTheme();

  // Only this track's clip ids. clipIdsByTrack is cached per `clips` array
  // identity, so one store publish builds the index once for every lane.
  const timelineStore = useTimelineStoreApi();
  const clipIds = useStoreWithEqualityFn(
    timelineStore,
    (s) => clipIdsByTrack(s.clips).get(track.id) ?? NO_CLIP_IDS,
    // Shallow-compare the resulting string array
    (a: string[], b: string[]) =>
      a.length === b.length && a.every((id, i) => id === b[i])
  );

  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const clearSelection = useTimelineUIStore((s) => s.clearSelection);
  const seek = useTimelinePlaybackStore((s) => s.seek);
  const setSelection = useTimelineUIStore((s) => s.setSelection);
  const setRubberBand = useTimelineUIStore((s) => s.setRubberBand);
  const addImportedClip = useTimelineStore((s) => s.addImportedClip);
  const addClip = useTimelineStore((s) => s.addClip);
  const closeGapAt = useTimelineStore((s) => s.closeGapAt);
  const importVideoWithAudio = useVideoAudioImport();

  const heightPx = track.heightPx ?? DEFAULT_TRACK_HEIGHT_PX;

  const laneRef = useRef<HTMLDivElement>(null);
  const isRubberBandingRef = useRef(false);
  /** Band origin in lanes-content space. */
  const rbStartRef = useRef({ x: 0, y: 0 });
  /** Selection snapshot taken at pointerdown when Shift is held (union mode). */
  const rbBaseSelectionRef = useRef<Set<string> | null>(null);
  /** Every clip, snapshotted at pointerdown. The band can reach any lane, so
   *  the hit-test is not limited to this track; the clip list doesn't change
   *  during the gesture, so the full array is read once instead of per move. */
  const rbClipsRef = useRef<
    Array<{
      id: string;
      trackId: string;
      startMs: number;
      durationMs: number;
    }>
  >([]);
  /** Each lane's vertical extent in lanes-content space, snapshotted at
   *  pointerdown alongside the clips. Lanes don't move during the gesture. */
  const rbTrackBoundsRef = useRef<
    Map<string, { top: number; bottom: number }>
  >(new Map());
  /** Coalesces selection updates to one per animation frame. */
  const rbLastAppliedRef = useRef<{
    startMs: number;
    endMs: number;
    topPx: number;
    bottomPx: number;
  } | null>(null);
  /** Lanes container rect, captured once at pointerdown. The container can't
   *  move during a captured rubber-band gesture, so pointermove reuses this
   *  instead of calling getBoundingClientRect() (forces layout) per move. */
  const rbContainerRectRef = useRef<DOMRect | null>(null);
  /** True while this lane owns a band gesture — drives the lane cursor only,
   *  the band rect itself lives in the UI store so the overlay can draw it
   *  across lanes. */
  const [isRubberBanding, setIsRubberBanding] = useState(false);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragReject, setIsDragReject] = useState(false);
  const [dropWarning, setDropWarning] = useState<string | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
    startMs: number;
  } | null>(null);
  const [addClipState, setAddClipState] = useState<{
    x: number;
    y: number;
    startMs: number;
  } | null>(null);
  const [addClipAnchorEl, setAddClipAnchorEl] = useState<HTMLElement | null>(
    null
  );

  // Clear any pending warning timer / scheduled selection frame on unmount
  useEffect(() => {
    return () => {
      if (warningTimerRef.current !== null) {
        clearTimeout(warningTimerRef.current);
      }
    };
  }, []);

  const showWarning = useCallback((message: string, isReject = false) => {
    setDropWarning(message);
    setIsDragReject(isReject);
    if (warningTimerRef.current !== null) {
      clearTimeout(warningTimerRef.current);
    }
    warningTimerRef.current = setTimeout(() => {
      setDropWarning(null);
      setIsDragReject(false);
      warningTimerRef.current = null;
    }, WARNING_DISMISS_MS);
  }, []);

  /**
   * Returns true if the dataTransfer looks like an asset drag (single or multi).
   * The legacy "asset" key is only set by single-asset drags; "selectedAssetIds"
   * is set by multi-asset drags. We intentionally do NOT check DRAG_DATA_MIME
   * alone because that MIME type is shared with create-node and other drag types.
   */
  const isAssetDrag = useCallback((e: React.DragEvent): boolean => {
    // Check for both the unified MIME type and the legacy "asset" key.
    // useAssetActions sets both for backward compatibility: serializeDragData
    // writes DRAG_DATA_MIME, and a separate line writes the legacy "asset" key.
    return (
      e.dataTransfer.types.includes("asset") ||
      e.dataTransfer.types.includes("selectedAssetIds")
    );
  }, []);

  const handleAssetDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isAssetDrag(e)) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    },
    [isAssetDrag]
  );

  const handleAssetDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Only clear when leaving the lane itself (not a child element).
      // relatedTarget is null or an Element, both of which are Nodes.
      if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
        setIsDragOver(false);
        setIsDragReject(false);
      }
    },
    []
  );

  const handleAssetDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      setIsDragOver(false);
      setIsDragReject(false);

      if (!isAssetDrag(e)) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const dragData = deserializeDragData(e.dataTransfer);
      if (!dragData) {
        return;
      }

      // Multi-asset drags are not supported for clip creation — guide the user.
      if (dragData.type === "assets-multiple") {
        showWarning("Drop one asset at a time onto a track.", true);
        return;
      }

      // Resolve asset: only single-asset drags are supported for clip creation
      let asset: Asset | null = null;
      if (dragData.type === "asset") {
        asset = dragData.payload;
      }

      if (!asset) {
        return;
      }

      const mediaType = assetMediaType(asset.content_type);
      if (!mediaType) {
        showWarning(`Cannot import "${asset.name}": unsupported media type.`);
        return;
      }

      if (!isCompatibleWithTrack(mediaType, track.type)) {
        const expected =
          mediaType === "audio" ? "an audio" : "a video or overlay";
        showWarning(
          `Cannot drop ${mediaType} asset onto this ${track.type} track — use ${expected} track.`,
          true
        );
        return;
      }

      // The lane lives inside the scrolling lanes container, so lane-local
      // coordinates are already content-space — no scroll offset needed.
      const rect = e.currentTarget.getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const startMs = Math.max(0, Math.round(dropX * msPerPx));

      // Video dropped on a video track: also create a linked audio clip from
      // the video's audio track. Everything else imports as a single clip.
      if (mediaType === "video" && track.type === "video") {
        void importVideoWithAudio(asset, track.id, startMs);
      } else {
        addImportedClip(asset, track.id, startMs);
      }
    },
    [
      isAssetDrag,
      track.type,
      track.id,
      msPerPx,
      addImportedClip,
      importVideoWithAudio,
      showWarning
    ]
  );

  /** Open the lane menu at a viewport point, resolving the time under it. */
  const openLaneMenuAt = useCallback(
    (clientX: number, clientY: number, laneEl: HTMLDivElement) => {
      if (track.locked) {
        return;
      }
      const rect = laneEl.getBoundingClientRect();
      const dropX = clientX - rect.left;
      const startMs = Math.max(0, Math.round(dropX * msPerPx));
      setContextMenuPos({ x: clientX, y: clientY, startMs });
    },
    [track.locked, msPerPx]
  );

  // Touch equivalent of the right-click menu below: without it a phone has no
  // way to add a clip to an empty lane.
  const laneLongPress = useLongPress(
    useCallback(
      (point: LongPressPoint) => {
        const laneEl = laneRef.current;
        if (!laneEl || point.target !== laneEl) {
          return;
        }
        // The hold became a menu, not a band — drop the gesture pointerdown
        // started so releasing doesn't re-select.
        isRubberBandingRef.current = false;
        setIsRubberBanding(false);
        setRubberBand(null);
        openLaneMenuAt(point.clientX, point.clientY, laneEl);
      },
      [openLaneMenuAt, setRubberBand]
    )
  );

  const handleLanePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only respond to primary button on the lane itself (not clips)
      if (e.target !== e.currentTarget) {
        return;
      }
      if (e.button !== 0) {
        return;
      }

      // Touch: a drag across empty lane means "scroll the timeline", so the
      // gesture is left to the scroller. Rubber-band marquee needs a second
      // pointer to hold a modifier and has no equivalent on a phone; only the
      // seek and the long-press menu below apply. (Capturing the pointer here
      // would also suppress the native scroll outright.)
      if (e.pointerType === "touch") {
        laneLongPress.start(e);
        const touchRect = e.currentTarget.getBoundingClientRect();
        seek(Math.round((e.clientX - touchRect.left) * msPerPx));
        return;
      }

      if (!e.shiftKey) {
        clearSelection();
        rbBaseSelectionRef.current = null;
      } else {
        // Shift+band: remember the existing selection so the band's contents
        // can be unioned with it instead of replacing it.
        rbBaseSelectionRef.current = new Set(
          useTimelineUIStore.getState().selectedClipIds
        );
      }

      const laneEl = e.currentTarget;
      // The band is measured against the lanes container so it can cross into
      // the lanes above and below this one. Standalone renders (tests) have no
      // container, in which case the starting lane is the whole space.
      const containerEl =
        laneEl.closest<HTMLElement>("[data-timeline-lanes]") ??
        laneEl.parentElement ??
        laneEl;
      const containerRect = containerEl.getBoundingClientRect();
      rbContainerRectRef.current = containerRect;

      // Snapshot the clips and each lane's vertical extent once — neither
      // changes during the band gesture, so the hit-test on pointermove reads
      // these instead of touching the DOM or re-filtering clips each frame.
      rbClipsRef.current = useTimelineStore.getState().clips.map((c) => ({
        id: c.id,
        trackId: c.trackId,
        startMs: c.startMs,
        durationMs: c.durationMs
      }));

      const bounds = new Map<string, { top: number; bottom: number }>();
      containerEl
        .querySelectorAll<HTMLElement>("[data-track-lane-id]")
        .forEach((el) => {
          const laneTrackId = el.dataset.trackLaneId;
          if (!laneTrackId) {
            return;
          }
          const laneRect = el.getBoundingClientRect();
          bounds.set(laneTrackId, {
            top: laneRect.top - containerRect.top,
            bottom: laneRect.bottom - containerRect.top
          });
        });
      rbTrackBoundsRef.current = bounds;

      laneEl.setPointerCapture(e.pointerId);
      const localX = e.clientX - containerRect.left;
      rbStartRef.current = {
        x: localX,
        y: e.clientY - containerRect.top
      };
      isRubberBandingRef.current = true;

      // Move the playhead to the clicked position. The lanes container is
      // inside the scrolling element, so localX is already content-space.
      const timeMs = Math.round(localX * msPerPx);
      seek(timeMs);
    },
    [clearSelection, laneLongPress, msPerPx, seek]
  );

  // Apply the rubber-band selection for the given content-space range. Deduped
  // by range: pointer events that don't change the band (sub-pixel jitter, the
  // browser already coalesces moves to ~one per frame) skip the O(n) overlap
  // filter and the setSelection call entirely.
  const applyRubberBandSelection = useCallback(
    (startMs: number, endMs: number, topPx: number, bottomPx: number) => {
      const last = rbLastAppliedRef.current;
      if (
        last &&
        last.startMs === startMs &&
        last.endMs === endMs &&
        last.topPx === topPx &&
        last.bottomPx === bottomPx
      ) {
        return;
      }
      rbLastAppliedRef.current = { startMs, endMs, topPx, bottomPx };

      const trackBounds = rbTrackBoundsRef.current;
      const selected = rbClipsRef.current
        .filter((c) => {
          // A clip counts when the band covers both its lane vertically and
          // its span horizontally. Lane bounds are compared inclusively so a
          // lane the band only grazes still takes part, and so a lane that
          // measured zero-height (jsdom, display:none) is not dropped.
          const laneBounds = trackBounds.get(c.trackId);
          if (
            !laneBounds ||
            laneBounds.top > bottomPx ||
            laneBounds.bottom < topPx
          ) {
            return false;
          }
          const clipEnd = c.startMs + c.durationMs;
          return clipEnd > startMs && c.startMs < endMs;
        })
        .map((c) => c.id);

      // Shift+band unions with the selection snapshotted at pointerdown;
      // a plain band replaces the selection.
      const base = rbBaseSelectionRef.current;
      setSelection(base ? [...new Set([...base, ...selected])] : selected);
    },
    [setSelection]
  );

  const handleLanePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      laneLongPress.move(e);
      if (!isRubberBandingRef.current || e.buttons !== 1) {
        return;
      }
      const rect = rbContainerRectRef.current;
      if (!rect) {
        return;
      }
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      const left = Math.min(rbStartRef.current.x, curX);
      const top = Math.min(rbStartRef.current.y, curY);
      const width = Math.abs(curX - rbStartRef.current.x);
      const height = Math.abs(curY - rbStartRef.current.y);

      setIsRubberBanding(true);
      setRubberBand({ left, top, width, height });

      // Compute which clips the rubber-band covers. The lanes container
      // renders inside the scrolling element, so container-local coordinates
      // are already content-space — no scroll offset.
      const rbStartMs = left * msPerPx;
      applyRubberBandSelection(
        rbStartMs,
        rbStartMs + width * msPerPx,
        top,
        top + height
      );
    },
    [laneLongPress, msPerPx, applyRubberBandSelection, setRubberBand]
  );

  const handleLanePointerUp = useCallback(() => {
    laneLongPress.cancel();
    isRubberBandingRef.current = false;
    rbBaseSelectionRef.current = null;
    rbLastAppliedRef.current = null;
    rbClipsRef.current = [];
    rbTrackBoundsRef.current = new Map();
    rbContainerRectRef.current = null;
    setIsRubberBanding(false);
    setRubberBand(null);
  }, [laneLongPress, setRubberBand]);

  const handleLaneContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only on empty lane space — let clips handle their own context menu.
      if (e.target !== e.currentTarget) {
        return;
      }
      if (track.locked) {
        return;
      }
      e.preventDefault();
      openLaneMenuAt(e.clientX, e.clientY, e.currentTarget);
    },
    [track.locked, openLaneMenuAt]
  );

  // Read once per menu open, not subscribed: the lane must not re-render on
  // every clip mutation for a menu that is closed almost all the time.
  const menuGap =
    contextMenuPos === null
      ? null
      : findGap(timelineStore.getState().clips, track.id, contextMenuPos.startMs);

  const handleCloseGap = useCallback(() => {
    if (!contextMenuPos) {
      return;
    }
    closeGapAt(track.id, contextMenuPos.startMs);
    setContextMenuPos(null);
  }, [closeGapAt, contextMenuPos, track.id]);

  const handleAddClipFromMenu = useCallback(() => {
    if (!contextMenuPos) {
      return;
    }
    setAddClipState({
      x: contextMenuPos.x,
      y: contextMenuPos.y,
      startMs: contextMenuPos.startMs
    });
    setContextMenuPos(null);
  }, [contextMenuPos]);

  const handleAddText = useCallback(() => {
    if (!contextMenuPos) return;
    const clip = makeClip({
      trackId: track.id,
      startMs: contextMenuPos.startMs,
      durationMs: DEFAULT_TEXT_CLIP_DURATION_MS,
      name: "Text",
      mediaType: "text",
      sourceType: "imported",
      status: "generated",
      textStyle: {
        text: "Text",
        fontSizePx: DEFAULT_TEXT_CLIP_FONT_SIZE_PX,
        color: DEFAULT_TEXT_CLIP_COLOR
      }
    });
    addClip(clip);
    setSelection([clip.id]);
    setContextMenuPos(null);
  }, [addClip, contextMenuPos, setSelection, track.id]);

  const handleAddClipClose = useCallback(() => {
    setAddClipState(null);
    setAddClipAnchorEl(null);
  }, []);

  const laneCss = useMemo(
    () =>
      laneStyles(
        theme,
        heightPx,
        track.visible,
        isRubberBanding,
        isDragOver,
        isDragReject
      ),
    [theme, heightPx, track.visible, isRubberBanding, isDragOver, isDragReject]
  );

  return (
    <div
      ref={laneRef}
      css={laneCss}
      data-testid={`track-lane-${track.id}`}
      data-track-lane-id={track.id}
      onPointerDown={handleLanePointerDown}
      onPointerMove={handleLanePointerMove}
      onPointerUp={handleLanePointerUp}
      onPointerCancel={handleLanePointerUp}
      onDragOver={handleAssetDragOver}
      onDragLeave={handleAssetDragLeave}
      onDrop={handleAssetDrop}
      onContextMenu={handleLaneContextMenu}
      role="listbox"
      tabIndex={0}
      aria-label={`Track: ${track.name}`}
      aria-multiselectable="true"
    >
      {clipIds.map((id) => (
        <Clip key={id} clipId={id} />
      ))}

      {/* Right-click context menu (lane background) */}
      <ContextMenu
        open={contextMenuPos !== null}
        position={
          contextMenuPos
            ? { x: contextMenuPos.x, y: contextMenuPos.y }
            : null
        }
        onClose={() => setContextMenuPos(null)}
        compact
      >
        {/* Text is the one clip you can author outright — no workflow, no
            generation — so it sits at the top level rather than behind the
            generated-clip picker. */}
        {(track.type === "overlay" || track.type === "video") && (
          <MenuItemPrimitive
            label="Add text"
            icon={<TitleIcon fontSize="small" />}
            onClick={handleAddText}
            compact
          />
        )}
        <MenuItemPrimitive
          label="Add generated clip here…"
          icon={<AddIcon fontSize="small" />}
          onClick={handleAddClipFromMenu}
          compact
        />
        {menuGap && (
          <MenuItemPrimitive
            label="Close gap"
            icon={<CompressOutlinedIcon fontSize="small" />}
            onClick={handleCloseGap}
            compact
          />
        )}
      </ContextMenu>

      {/* Invisible anchor for AddClipMenu, positioned at click location */}
      {addClipState && (
        <div
          ref={setAddClipAnchorEl}
          style={{
            position: "fixed",
            top: addClipState.y,
            left: addClipState.x,
            width: 1,
            height: 1,
            pointerEvents: "none"
          }}
          aria-hidden="true"
        />
      )}

      {/* AddClipMenu — workflow picker */}
      {addClipState && addClipAnchorEl && (
        <AddClipMenu
          trackId={track.id}
          startMs={addClipState.startMs}
          trackType={track.type}
          anchorEl={addClipAnchorEl}
          onClose={handleAddClipClose}
        />
      )}

      {/* Mismatch / error warning banner (auto-dismissed) */}
      {dropWarning && (
        <div
          style={{
            position: "absolute",
            bottom: 4,
            left: 4,
            right: 4,
            zIndex: Z_INDEX.sticky + 10,
            pointerEvents: "none"
          }}
          aria-live="polite"
        >
          <WarningBanner
            message={dropWarning}
            variant="warning"
            compact
          />
        </div>
      )}
    </div>
  );
});

TrackLane.displayName = "TrackLane";
