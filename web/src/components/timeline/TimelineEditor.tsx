/** @jsxImportSource @emotion/react */
/**
 * TimelineEditor — top-level page shell for the timeline route.
 *
 * Layout (top → bottom):
 *   TopBar (48 px)
 *   ─── resizable split ─────────────────────────
 *   FlexRow: PreviewArea (55 %) | InspectorArea (45 %)
 *   ─── horizontal drag handle (mouse + keyboard resizable) ────
 *   TracksArea (user-resizable, default 240 px)
 *   BottomStatusBar (32 px)
 *
 * Loading: shows LoadingSpinner centred in the preview region.
 * Not-found / error: shows EmptyState with a "Go to dashboard" action.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  FlexColumn,
  FlexRow,
  EmptyState,
  LoadingSpinner
} from "../ui_primitives";

import { TopBar } from "./TopBar";
import { BottomStatusBar } from "./BottomStatusBar";
import { useTimeline } from "../../hooks/useTimelineSequence";
import { TracksRegion } from "./Tracks/TracksRegion";

// ── Drag-handle constants ──────────────────────────────────────────────────

const HANDLE_HEIGHT_PX = 6;
const DEFAULT_TRACKS_HEIGHT_PX = 240;
const MIN_TRACKS_HEIGHT_PX = 80;
const MAX_TRACKS_HEIGHT_PX = 600;
/** Arrow-key step for keyboard resizing (px) */
const KEYBOARD_RESIZE_STEP_PX = 20;

// ── Styles ─────────────────────────────────────────────────────────────────

const editorStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default
  });

const middleAreaStyles = (theme: Theme) =>
  css({
    overflow: "hidden",
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  });

const previewRegionStyles = (theme: Theme) =>
  css({
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default,
    borderRight: `1px solid ${theme.vars.palette.divider}`,
    alignItems: "center",
    justifyContent: "center"
  });

const inspectorRegionStyles = (theme: Theme) =>
  css({
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default,
    alignItems: "center",
    justifyContent: "center"
  });

const dragHandleStyles = (theme: Theme) =>
  css({
    height: HANDLE_HEIGHT_PX,
    cursor: "ns-resize",
    flexShrink: 0,
    backgroundColor: theme.vars.palette.divider,
    transition: "background-color 0.15s ease",
    outline: "none",
    "&:hover, &.dragging": {
      backgroundColor: theme.vars.palette.primary.main
    },
    "&:focus-visible": {
      backgroundColor: theme.vars.palette.primary.main,
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
    }
  });

// ── Sub-region placeholder components ─────────────────────────────────────

const PreviewRegion: React.FC<{ isLoading: boolean }> = ({ isLoading }) => {
  const theme = useTheme();
  return (
    <FlexColumn
      css={previewRegionStyles(theme)}
      fullHeight
      sx={{ flex: "0 0 55%" }}
    >
      {isLoading ? (
        <LoadingSpinner text="Loading sequence…" />
      ) : (
        <EmptyState
          variant="empty"
          size="small"
          title="Preview"
          description="Preview compositor (NOD-303)"
        />
      )}
    </FlexColumn>
  );
};

const InspectorRegion: React.FC = () => {
  const theme = useTheme();
  return (
    <FlexColumn
      css={inspectorRegionStyles(theme)}
      fullHeight
      sx={{ flex: "1 1 45%" }}
    >
      <EmptyState
        variant="empty"
        size="small"
        title="Inspector"
        description="Inspector (NOD-305 / NOD-308)"
      />
    </FlexColumn>
  );
};

const TracksAreaRegion: React.FC<{ heightPx: number }> = ({ heightPx }) => {
  return <TracksRegion heightPx={heightPx} />;
};

// ── Main component ─────────────────────────────────────────────────────────

export const TimelineEditor: React.FC = memo(() => {
  const { sequenceId } = useParams<{ sequenceId: string }>();
  const navigate = useNavigate();
  const theme = useTheme();

  // Data fetching ─────────────────────────────────────────────────────────
  const { data: sequence, isLoading, isError } = useTimeline(sequenceId);

  // Zoom state ────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);

  // Tracks resize ─────────────────────────────────────────────────────────
  const [tracksHeight, setTracksHeight] = useState(DEFAULT_TRACKS_HEIGHT_PX);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(DEFAULT_TRACKS_HEIGHT_PX);
  const handleRef = useRef<HTMLDivElement>(null);

  /** Begin mouse drag — capture start position and activate drag state. */
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = tracksHeight;
    setIsDragging(true);
  }, [tracksHeight]);

  /**
   * Register / unregister window-level mouse listeners for the duration of a
   * drag. Cleanup runs on unmount, preventing listener leaks if the user
   * navigates away mid-drag.
   */
  useEffect(() => {
    if (!isDragging) {
      return;
    }

    // Prevent text selection in adjacent regions during drag.
    document.body.style.userSelect = "none";
    const handleEl = handleRef.current;
    handleEl?.classList.add("dragging");

    const onMouseMove = (ev: MouseEvent) => {
      const deltaY = dragStartYRef.current - ev.clientY; // drag up → taller
      setTracksHeight(
        Math.min(
          MAX_TRACKS_HEIGHT_PX,
          Math.max(MIN_TRACKS_HEIGHT_PX, dragStartHeightRef.current + deltaY)
        )
      );
    };

    const onMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      handleEl?.classList.remove("dragging");
    };
  }, [isDragging]);

  /** Keyboard resize: ↑ enlarges, ↓ shrinks the tracks panel. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setTracksHeight((h) =>
          Math.min(MAX_TRACKS_HEIGHT_PX, h + KEYBOARD_RESIZE_STEP_PX)
        );
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setTracksHeight((h) =>
          Math.max(MIN_TRACKS_HEIGHT_PX, h - KEYBOARD_RESIZE_STEP_PX)
        );
      }
    },
    []
  );

  // Not-found / error ─────────────────────────────────────────────────────
  const notFound = !isLoading && (isError || !sequence);

  if (notFound) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        align="center"
        justify="center"
        css={editorStyles(theme)}
      >
        <EmptyState
          variant="error"
          title="Sequence not found"
          description="The timeline sequence you requested does not exist or you do not have access to it."
          actionText="Go to dashboard"
          onAction={() => navigate("/dashboard")}
        />
      </FlexColumn>
    );
  }

  return (
    <FlexColumn fullWidth fullHeight css={editorStyles(theme)}>
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <TopBar sequenceName={sequence?.name} />

      {/* ── Middle: preview + inspector ───────────────────────────── */}
      <FlexRow
        fullWidth
        css={middleAreaStyles(theme)}
        sx={{ flex: "1 1 auto", overflow: "hidden" }}
      >
        <PreviewRegion isLoading={isLoading} />
        <InspectorRegion />
      </FlexRow>

      {/* ── Horizontal drag handle (mouse + keyboard resizable) ───── */}
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize tracks panel"
        aria-valuenow={tracksHeight}
        aria-valuemin={MIN_TRACKS_HEIGHT_PX}
        aria-valuemax={MAX_TRACKS_HEIGHT_PX}
        tabIndex={0}
        css={dragHandleStyles(theme)}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      />

      {/* ── Tracks ────────────────────────────────────────────────── */}
      <TracksAreaRegion heightPx={tracksHeight} />

      {/* ── Bottom status bar ─────────────────────────────────────── */}
      <BottomStatusBar
        mode="local"
        zoom={zoom}
        onZoomChange={setZoom}
      />
    </FlexColumn>
  );
});

TimelineEditor.displayName = "TimelineEditor";

export default TimelineEditor;
