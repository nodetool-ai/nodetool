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
 * Not-found / error: shows EmptyState in the preview only; route and editor
 * chrome (tracks, inspector, status bar) stay mounted so the URL remains stable.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  Caption,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner
} from "../ui_primitives";

import { TopBar } from "./TopBar";
import { BottomStatusBar } from "./BottomStatusBar";
import { TimelineAssetPanel } from "./TimelineAssetPanel";
import {
  useCreateTimeline,
  useTimeline,
  useTimelines
} from "../../hooks/useTimelineSequence";
import { TracksRegion } from "./Tracks/TracksRegion";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import { PreviewArea } from "./preview/PreviewArea";
import { TimelineInspector } from "./Inspector/TimelineInspector";
import { ActivityIndicator } from "./ActivityIndicator";
import { StructuralDriftDialog } from "./Inspector/StructuralDriftDialog";
import {
  useGeneratingCount,
  useFailedCount
} from "../../stores/timeline/TimelineGenerationStore";
import { useWorkflowFreshnessCheck } from "../../hooks/timeline/useWorkflowFreshnessCheck";
import { useTimelineGenerationSubscriptions } from "../../hooks/timeline/useGenerateClip";
import { useLoadTimelineIntoStore } from "../../hooks/timeline/useLoadTimelineIntoStore";

// ── Drag-handle constants ──────────────────────────────────────────────────

const HANDLE_HEIGHT_PX = 6;
const DEFAULT_TRACKS_HEIGHT_PX = 240;
const MIN_TRACKS_HEIGHT_PX = 80;
const MAX_TRACKS_HEIGHT_PX = 600;
/** Arrow-key step for keyboard resizing (px) */
const KEYBOARD_RESIZE_STEP_PX = 20;
/**
 * Default msPerPx when zoom = 1. Matches TimelineUIStore default.
 * zoom = DEFAULT_MS_PER_PX / msPerPx  →  msPerPx = DEFAULT_MS_PER_PX / zoom
 */
const DEFAULT_MS_PER_PX = 10;

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

const assetPanelRegionStyles = css({
  flex: "0 0 280px",
  minWidth: 240,
  maxWidth: 360,
  overflow: "hidden"
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

const PreviewRegion: React.FC<{
  isLoading: boolean;
  sequence?: { fps?: number; width?: number; height?: number };
  sequenceUnavailable: boolean;
  onRetryFetch?: () => void;
  onCreateNewSequence?: () => void;
  createSequencePending?: boolean;
  createSequenceErrorMessage?: string | null;
}> = ({
  isLoading,
  sequence,
  sequenceUnavailable,
  onRetryFetch,
  onCreateNewSequence,
  createSequencePending,
  createSequenceErrorMessage
}) => {
  const theme = useTheme();
  return (
    <FlexColumn
      css={previewRegionStyles(theme)}
      fullHeight
      sx={{ flex: "0 1 55%", minWidth: 0, width: 0 }}
    >
      {isLoading ? (
        <LoadingSpinner text="Loading sequence…" />
      ) : sequenceUnavailable ? (
        <FlexColumn
          align="center"
          justify="center"
          gap={2}
          sx={{ flex: 1, width: "100%", px: 2 }}
        >
          <EmptyState
            variant="error"
            title="Sequence not found"
            description="The timeline sequence you requested does not exist or you do not have access to it."
          />
          <FlexRow gap={1} align="center" justify="center" sx={{ flexWrap: "wrap" }}>
            {onRetryFetch ? (
              <EditorButton
                variant="outlined"
                size="small"
                onClick={onRetryFetch}
                disabled={createSequencePending}
                aria-label="Retry loading sequence"
              >
                Retry
              </EditorButton>
            ) : null}
            {onCreateNewSequence ? (
              <EditorButton
                variant="contained"
                size="small"
                onClick={onCreateNewSequence}
                disabled={createSequencePending}
                aria-label="Create new sequence"
              >
                {createSequencePending ? "Creating…" : "New sequence"}
              </EditorButton>
            ) : null}
          </FlexRow>
          {createSequenceErrorMessage ? (
            <Caption sx={{ color: "error.main", textAlign: "center" }}>
              {createSequenceErrorMessage}
            </Caption>
          ) : null}
        </FlexColumn>
      ) : (
        <PreviewArea
          fps={sequence?.fps ?? 30}
          sequenceWidth={sequence?.width ?? 1920}
          sequenceHeight={sequence?.height ?? 1080}
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
      sx={{ flex: "0 1 45%", minWidth: 0, width: 0 }}
    >
      <TimelineInspector />
    </FlexColumn>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

export const TimelineEditor: React.FC = memo(() => {
  const { sequenceId } = useParams<{ sequenceId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();

  // Data fetching ─────────────────────────────────────────────────────────
  const { data: sequence, isLoading, isError, refetch } =
    useTimeline(sequenceId);

  // Mirror the fetched sequence into the TimelineStore so store-bound
  // components (Tracks, Inspector, ActivityIndicator) render its content.
  useLoadTimelineIntoStore(sequence);

  // Workflow freshness check — runs on mount after returning from the node editor
  const { driftItems, resolveDrift } = useWorkflowFreshnessCheck(sequenceId ?? null);
  const currentDriftItem = driftItems[0] ?? null;
  useTimelineGenerationSubscriptions();

  // Zoom ← wired to TimelineUIStore so TracksRegion + BottomStatusBar stay in sync
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const setZoom = useTimelineUIStore((s) => s.setZoom);
  // Convert msPerPx to a dimensionless ratio for ZoomControls (1 = default zoom)
  const zoom = DEFAULT_MS_PER_PX / msPerPx;
  const handleZoomChange = useCallback(
    (nextZoom: number) => setZoom(DEFAULT_MS_PER_PX / nextZoom),
    [setZoom]
  );

  // Activity counts for BottomStatusBar
  const generatingCount = useGeneratingCount();
  const failedCount = useFailedCount();

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

  /** Query finished without a usable row (disabled id, error, or empty). */
  const sequenceUnavailable = !isLoading && (isError || !sequence);

  const { data: userTimelines } = useTimelines(undefined, {
    enabled: sequenceUnavailable
  });

  const createTimeline = useCreateTimeline();

  const projectIdForNewSequence = useMemo(() => {
    const fromUrl = searchParams.get("projectId")?.trim();
    if (fromUrl) {
      return fromUrl;
    }
    const fromExisting = userTimelines?.[0]?.projectId;
    if (fromExisting) {
      return fromExisting;
    }
    return "default";
  }, [searchParams, userTimelines]);

  const handleRetrySequence = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleCreateNewSequence = useCallback(() => {
    createTimeline.reset();
    createTimeline.mutate(
      { name: "Untitled sequence", projectId: projectIdForNewSequence },
      {
        onSuccess: (created) => {
          const next = new URLSearchParams(searchParams);
          next.set("projectId", created.projectId);
          const qs = next.toString();
          navigate(qs ? `/timeline/${created.id}?${qs}` : `/timeline/${created.id}`, {
            replace: true
          });
        }
      }
    );
  }, [createTimeline, navigate, projectIdForNewSequence, searchParams]);

  const createErrorMessage =
    createTimeline.error != null
      ? createTimeline.error.message || "Could not create sequence."
      : null;

  return (
    <FlexColumn fullWidth fullHeight css={editorStyles(theme)}>
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <TopBar
        sequenceName={
          sequence?.name ??
          (sequenceUnavailable ? sequenceId : undefined)
        }
        activitySlot={<ActivityIndicator />}
      />

      {/* ── Middle: assets + preview + inspector ──────────────────── */}
      <FlexRow
        fullWidth
        css={middleAreaStyles(theme)}
        sx={{ flex: "1 1 auto", overflow: "hidden" }}
      >
        <div css={assetPanelRegionStyles}>
          <TimelineAssetPanel />
        </div>
        <PreviewRegion
          isLoading={isLoading}
          sequence={sequence}
          sequenceUnavailable={sequenceUnavailable}
          onRetryFetch={sequenceUnavailable ? handleRetrySequence : undefined}
          onCreateNewSequence={
            sequenceUnavailable ? handleCreateNewSequence : undefined
          }
          createSequencePending={createTimeline.isPending}
          createSequenceErrorMessage={createErrorMessage}
        />
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
      <TracksRegion heightPx={tracksHeight} />

      {/* ── Bottom status bar ─────────────────────────────────────── */}
      <BottomStatusBar
        mode="local"
        zoom={zoom}
        onZoomChange={handleZoomChange}
        generatingCount={generatingCount}
        failedCount={failedCount}
      />

      {/* ── Structural drift dialog ────────────────────────────────── */}
      <StructuralDriftDialog
        driftItem={currentDriftItem}
        onResolve={resolveDrift}
      />
    </FlexColumn>
  );
});

TimelineEditor.displayName = "TimelineEditor";

export default TimelineEditor;
