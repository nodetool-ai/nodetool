/** @jsxImportSource @emotion/react */
/**
 * TimelineEditor — top-level page shell for the timeline route.
 *
 * Layout (top → bottom):
 *   TopBar (48 px)
 *   ─── resizable split ─────────────────────────
 *   FlexRow: PreviewArea (55 %) | InspectorArea (45 %)
 *   ─── horizontal drag handle ──────────────────
 *   TracksArea (user-resizable, default ≈ 33 % of remaining height)
 *   BottomStatusBar (32 px)
 *
 * Loading: shows LoadingSpinner centred in the preview region.
 * Not-found / error: shows EmptyState with a "Go back" action.
 */

import React, { memo, useCallback, useRef, useState } from "react";
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

// ── Drag-handle constants ──────────────────────────────────────────────────

const HANDLE_HEIGHT_PX = 6;
const DEFAULT_TRACKS_HEIGHT_PX = 240;
const MIN_TRACKS_HEIGHT_PX = 80;
const MAX_TRACKS_HEIGHT_PX = 600;

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

const regionStyles = (theme: Theme) =>
  css({
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default,
    ".region-inner": {
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  });

const previewBorderStyle = (theme: Theme) =>
  css({
    borderRight: `1px solid ${theme.vars.palette.divider}`
  });

const dragHandleStyles = (theme: Theme) =>
  css({
    height: HANDLE_HEIGHT_PX,
    cursor: "ns-resize",
    flexShrink: 0,
    backgroundColor: theme.vars.palette.divider,
    transition: "background-color 0.15s ease",
    userSelect: "none",
    "&:hover, &.dragging": {
      backgroundColor: theme.vars.palette.primary.main
    }
  });

const tracksStyles = (theme: Theme) =>
  css({
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.paper,
    ".region-inner": {
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  });

// ── Sub-region placeholder components ─────────────────────────────────────

const PreviewRegion: React.FC<{ isLoading: boolean }> = ({ isLoading }) => {
  const theme = useTheme();
  return (
    <FlexColumn
      css={[regionStyles(theme), previewBorderStyle(theme)]}
      fullHeight
      sx={{ flex: "0 0 55%", maxWidth: "55%" }}
    >
      <div className="region-inner">
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
      </div>
    </FlexColumn>
  );
};

const InspectorRegion: React.FC = () => {
  const theme = useTheme();
  return (
    <FlexColumn
      css={regionStyles(theme)}
      fullHeight
      sx={{ flex: "1 1 45%" }}
    >
      <div className="region-inner">
        <EmptyState
          variant="empty"
          size="small"
          title="Inspector"
          description="Inspector (NOD-305 / NOD-308)"
        />
      </div>
    </FlexColumn>
  );
};

const TracksRegion: React.FC<{ heightPx: number }> = ({ heightPx }) => {
  const theme = useTheme();
  return (
    <FlexColumn
      css={tracksStyles(theme)}
      fullWidth
      sx={{ height: heightPx }}
    >
      <div className="region-inner">
        <EmptyState
          variant="empty"
          size="small"
          title="Tracks"
          description="Tracks, ruler & playhead (NOD-302)"
        />
      </div>
    </FlexColumn>
  );
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
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(DEFAULT_TRACKS_HEIGHT_PX);
  const handleRef = useRef<HTMLDivElement>(null);

  const handleDragMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDraggingRef.current = true;
      dragStartYRef.current = e.clientY;
      dragStartHeightRef.current = tracksHeight;
      handleRef.current?.classList.add("dragging");

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) {
          return;
        }
        const deltaY = dragStartYRef.current - ev.clientY; // drag up → taller
        const newHeight = Math.min(
          MAX_TRACKS_HEIGHT_PX,
          Math.max(MIN_TRACKS_HEIGHT_PX, dragStartHeightRef.current + deltaY)
        );
        setTracksHeight(newHeight);
      };

      const onMouseUp = () => {
        isDraggingRef.current = false;
        handleRef.current?.classList.remove("dragging");
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [tracksHeight]
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
          actionText="Go back"
          onAction={() => navigate(-1)}
        />
      </FlexColumn>
    );
  }

  return (
    <FlexColumn fullWidth fullHeight css={editorStyles(theme)}>
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <TopBar
        sequenceName={sequence?.name}
        saveStatus={isLoading ? undefined : "Saved"}
        onRenderAll={() => {
          /* TODO: NOD-311 */
        }}
      />

      {/* ── Middle: preview + inspector ───────────────────────────── */}
      <FlexRow
        fullWidth
        css={middleAreaStyles(theme)}
        sx={{ flex: "1 1 auto", overflow: "hidden" }}
      >
        <PreviewRegion isLoading={isLoading} />
        <InspectorRegion />
      </FlexRow>

      {/* ── Horizontal drag handle ────────────────────────────────── */}
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize tracks panel"
        css={dragHandleStyles(theme)}
        onMouseDown={handleDragMouseDown}
      />

      {/* ── Tracks ────────────────────────────────────────────────── */}
      <TracksRegion heightPx={tracksHeight} />

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
