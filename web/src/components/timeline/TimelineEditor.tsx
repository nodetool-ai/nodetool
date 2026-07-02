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
import { useShallow } from "zustand/react/shallow";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  Caption,
  Dialog,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ProgressBar,
  TabGroup,
  Text,
  MOTION
} from "../ui_primitives";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";

import { TopBar } from "./TopBar";
import { BottomStatusBar } from "./BottomStatusBar";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import {
  useCreateTimeline,
  useTimeline,
  useTimelines
} from "../../hooks/useTimelineSequence";
import { TracksRegion } from "./Tracks/TracksRegion";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { TimelineProvider } from "../../stores/timeline/TimelineInstance";
import { PreviewArea } from "./preview/PreviewArea";
import { TimelineInspector } from "./Inspector/TimelineInspector";
import TimelineAgentPanel from "./TimelineAgentPanel";
import { useTimelineAgentBridge } from "../../hooks/timeline/useTimelineAgentBridge";
import { TranscriptPanel } from "./TranscriptPanel";
import { useHasScript } from "../../hooks/timeline/useHasScript";
import { ActivityIndicator } from "./ActivityIndicator";
import {
  useGeneratingCount,
  useFailedCount
} from "../../stores/timeline/TimelineGenerationStore";
import { useWorkflowFreshnessCheck } from "../../hooks/timeline/useWorkflowFreshnessCheck";
import { useTimelineGenerationSubscriptions } from "../../hooks/timeline/useGenerateClip";
import { useLoadTimelineIntoStore } from "../../hooks/timeline/useLoadTimelineIntoStore";
import { useTimelineAutosave } from "../../hooks/timeline/useTimelineAutosave";
import { useTimelineSave } from "../../hooks/timeline/useTimelineSave";
import { useTimelineExport } from "../../hooks/timeline/useTimelineExport";

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
    minHeight: 0,
    backgroundColor: theme.vars.palette.background.default,
    alignItems: "stretch",
    justifyContent: "flex-start"
  });

const dragHandleStyles = (theme: Theme) =>
  css({
    height: HANDLE_HEIGHT_PX,
    cursor: "ns-resize",
    flexShrink: 0,
    backgroundColor: theme.vars.palette.divider,
    transition: MOTION.background,
    outline: "none",
    "&:hover, &.dragging": {
      backgroundColor: theme.vars.palette.primary.main
    },
    "&:focus-visible": {
      backgroundColor: theme.vars.palette.primary.main,
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
    }
  });

/** Human-readable label for the current export phase. */
function exportPhaseLabel(
  progress: { phase: string; frame: number; totalFrames: number } | null
): string {
  if (!progress) return "Preparing…";
  switch (progress.phase) {
    case "audio":
      return "Mixing audio…";
    case "video":
      return `Encoding frame ${progress.frame} / ${progress.totalFrames}`;
    case "finalizing":
      return "Finalizing…";
    default:
      return "Preparing…";
  }
}

// ── Sub-region placeholder components ─────────────────────────────────────

const PreviewRegion: React.FC<{
  isLoading: boolean;
  sequenceUnavailable: boolean;
  onRetryFetch?: () => void;
  onCreateNewSequence?: () => void;
  createSequencePending?: boolean;
  createSequenceErrorMessage?: string | null;
}> = memo(({
  isLoading,
  sequenceUnavailable,
  onRetryFetch,
  onCreateNewSequence,
  createSequencePending,
  createSequenceErrorMessage
}) => {
  const theme = useTheme();
  // Canvas size + fps come from the store — the single source of truth the
  // compositor and the export already read — so Project settings changes show
  // up in the preview immediately, without waiting on a query refetch.
  const { fps, width, height } = useTimelineStore(
    useShallow((s) => ({ fps: s.fps, width: s.width, height: s.height }))
  );
  return (
    <FlexColumn
      css={previewRegionStyles(theme)}
      fullHeight
      sx={{ flex: "0 1 55%", minWidth: 0, minHeight: 0, width: 0 }}
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
          fps={fps}
          sequenceWidth={width}
          sequenceHeight={height}
        />
      )}
    </FlexColumn>
  );
});
PreviewRegion.displayName = "PreviewRegion";

type InspectorTab = "inspector" | "agent";

const InspectorRegion: React.FC = memo(() => {
  const theme = useTheme();
  const [tab, setTab] = useState<InspectorTab>("inspector");

  const tabs = useMemo(
    () => [
      { value: "inspector", label: "Inspector", icon: <TuneOutlinedIcon /> },
      { value: "agent", label: "Assistant", icon: <AutoAwesomeIcon /> }
    ],
    []
  );

  return (
    <FlexColumn
      css={inspectorRegionStyles(theme)}
      fullHeight
      sx={{ flex: "0 1 45%", minWidth: 0, minHeight: 0, width: 0 }}
    >
      <TabGroup
        tabs={tabs}
        value={tab}
        onChange={(value) => setTab(value as InspectorTab)}
        size="small"
        fullWidth
        sx={{
          flexShrink: 0,
          borderBottom: `1px solid ${theme.vars.palette.divider}`
        }}
      />
      <FlexColumn fullWidth sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {tab === "inspector" ? <TimelineInspector /> : <TimelineAgentPanel />}
      </FlexColumn>
    </FlexColumn>
  );
});
InspectorRegion.displayName = "InspectorRegion";

const TranscriptRegion: React.FC = memo(() => {
  const theme = useTheme();
  const hasScript = useHasScript();

  if (!hasScript) return null;

  return (
    <FlexColumn
      css={inspectorRegionStyles(theme)}
      fullHeight
      sx={{ flex: "0 0 320px", minWidth: 0, minHeight: 0 }}
    >
      <TranscriptPanel />
    </FlexColumn>
  );
});
TranscriptRegion.displayName = "TranscriptRegion";

/**
 * Zoom + generation-count status bar, isolated from the editor shell.
 *
 * Subscribes to `msPerPx` (changes per zoom tick) and the generation counts
 * (change per WebSocket progress message) itself, so those high-frequency
 * updates re-render only this leaf instead of the whole `TimelineEditorBody`.
 */
const TimelineStatusBar: React.FC = memo(() => {
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const setZoom = useTimelineUIStore((s) => s.setZoom);
  // Convert msPerPx to a dimensionless ratio for ZoomControls (1 = default zoom)
  const zoom = DEFAULT_MS_PER_PX / msPerPx;
  const handleZoomChange = useCallback(
    (nextZoom: number) => setZoom(DEFAULT_MS_PER_PX / nextZoom),
    [setZoom]
  );

  const generatingCount = useGeneratingCount();
  const failedCount = useFailedCount();

  return (
    <BottomStatusBar
      mode="local"
      zoom={zoom}
      onZoomChange={handleZoomChange}
      generatingCount={generatingCount}
      failedCount={failedCount}
    />
  );
});
TimelineStatusBar.displayName = "TimelineStatusBar";

// ── Main component ─────────────────────────────────────────────────────────

interface TimelineEditorProps {
  /**
   * Sequence id to load. When omitted, falls back to the `:sequenceId`
   * route param so existing `/timeline/:sequenceId` routes keep working.
   * The workspace shell passes this explicitly (tab.ref) so the editor can
   * run outside the router.
   */
  sequenceId?: string;
  /**
   * Whether this editor is the focused/visible surface. Drives which instance
   * receives imperative undo/redo and save actions. Defaults to `true` for the
   * standalone route; the workspace tab passes its active flag.
   */
  active?: boolean;
}

const TimelineEditorBody: React.FC<TimelineEditorProps> = memo(({
  sequenceId: sequenceIdProp,
  active = true
}) => {
  const { sequenceId: sequenceIdParam } = useParams<{ sequenceId: string }>();
  const sequenceId = sequenceIdProp ?? sequenceIdParam;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();

  // Register the ui_timeline_* agent tools against this instance while focused.
  useTimelineAgentBridge(active);

  // Data fetching ─────────────────────────────────────────────────────────
  const { data: sequence, isLoading, isError, refetch } =
    useTimeline(sequenceId);

  // Mirror the fetched sequence into the TimelineStore so store-bound
  // components (Tracks, Inspector, ActivityIndicator) render its content.
  useLoadTimelineIntoStore(sequence);

  // Persist subsequent edits back via trpc.timeline.update (debounced).
  useTimelineAutosave();

  // Imperative save for the Save button (forces an immediate PATCH).
  const { save: handleSave, isSaving } = useTimelineSave();

  // Reconcile clips against current workflow state on mount.
  useWorkflowFreshnessCheck(sequenceId ?? null);
  useTimelineGenerationSubscriptions();

  // Zoom and generation counts moved to `TimelineStatusBar` (below): both
  // change at high frequency (per zoom tick / per progress message) and
  // previously re-rendered this whole shell via subscriptions hosted here.

  // Offline video export (frame-by-frame, 1:1 with the live preview).
  const {
    exportVideo,
    cancel: cancelExport,
    clearError: clearExportError,
    isExporting,
    progress: exportProgress,
    error: exportError
  } = useTimelineExport();
  const handleExportVideo = useCallback(() => {
    void exportVideo(sequence?.name);
  }, [exportVideo, sequence?.name]);

  // Project settings dialog (canvas size + fps) ────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  // Stable element so `activitySlot` doesn't defeat TopBar's memo every render.
  const activitySlot = useMemo(() => <ActivityIndicator />, []);

  // Tracks resize ─────────────────────────────────────────────────────────
  const [tracksHeight, setTracksHeight] = useState(DEFAULT_TRACKS_HEIGHT_PX);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(DEFAULT_TRACKS_HEIGHT_PX);
  const handleRef = useRef<HTMLDivElement>(null);
  // Latest computed height + pending rAF id for the throttled resize below.
  const pendingHeightRef = useRef<number | null>(null);
  const resizeRafIdRef = useRef<number | null>(null);

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
   *
   * `onMouseMove` fires far more often than the display refreshes, so it only
   * records the latest height in a ref and schedules at most one
   * `setTracksHeight` per animation frame — otherwise every mousemove tick
   * re-rendered the whole shell.
   */
  useEffect(() => {
    if (!isDragging) {
      return;
    }

    // Prevent text selection in adjacent regions during drag.
    document.body.style.userSelect = "none";
    const handleEl = handleRef.current;
    handleEl?.classList.add("dragging");

    const flushPendingHeight = () => {
      resizeRafIdRef.current = null;
      if (pendingHeightRef.current !== null) {
        setTracksHeight(pendingHeightRef.current);
      }
    };

    const onMouseMove = (ev: MouseEvent) => {
      const deltaY = dragStartYRef.current - ev.clientY; // drag up → taller
      pendingHeightRef.current = Math.min(
        MAX_TRACKS_HEIGHT_PX,
        Math.max(MIN_TRACKS_HEIGHT_PX, dragStartHeightRef.current + deltaY)
      );
      if (resizeRafIdRef.current === null) {
        resizeRafIdRef.current = requestAnimationFrame(flushPendingHeight);
      }
    };

    const onMouseUp = () => {
      if (resizeRafIdRef.current !== null) {
        cancelAnimationFrame(resizeRafIdRef.current);
        resizeRafIdRef.current = null;
      }
      // Flush the final position synchronously so a mouseup landing between
      // animation frames doesn't leave the panel at a stale height.
      if (pendingHeightRef.current !== null) {
        setTracksHeight(pendingHeightRef.current);
        pendingHeightRef.current = null;
      }
      setIsDragging(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      if (resizeRafIdRef.current !== null) {
        cancelAnimationFrame(resizeRafIdRef.current);
        resizeRafIdRef.current = null;
      }
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

  // Export dialog action button — memoized so re-renders unrelated to export
  // state (e.g. the tracks-resize drag) don't allocate a fresh element that
  // would defeat Dialog's memo.
  const hasExportError = exportError != null;
  const exportDialogActions = useMemo(
    () => (
      <EditorButton
        variant={isExporting ? "outlined" : "contained"}
        size="small"
        onClick={isExporting ? cancelExport : clearExportError}
      >
        {isExporting ? "Cancel" : "Close"}
      </EditorButton>
    ),
    [isExporting, hasExportError, cancelExport, clearExportError]
  );

  return (
    <FlexColumn fullWidth fullHeight css={editorStyles(theme)}>
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <TopBar
        onExportVideo={sequenceUnavailable ? undefined : handleExportVideo}
        isExporting={isExporting}
        onSave={sequenceUnavailable ? undefined : handleSave}
        isSaving={isSaving}
        onOpenSettings={sequenceUnavailable ? undefined : handleOpenSettings}
        activitySlot={activitySlot}
      />

      {/* ── Middle: assets + preview + inspector ──────────────────── */}
      {/* Basis 0 (not `auto`): the middle row absorbs all leftover height via
       *  flex-grow, but its *content* never contributes to the column's size.
       *  With `auto`, a tall inspector (clip selected) inflated this row's
       *  basis and stole height from the tracks panel below — so the tracks
       *  height appeared to change on its own. Now only the divider moves it. */}
      <FlexRow
        fullWidth
        css={middleAreaStyles(theme)}
        sx={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}
      >
        <TranscriptRegion />
        <PreviewRegion
          isLoading={isLoading}
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
      <TimelineStatusBar />

      {/* ── Project settings dialog (canvas size + fps) ───────────── */}
      <ProjectSettingsDialog
        open={settingsOpen}
        onClose={handleCloseSettings}
      />

      {/* ── Export progress / error dialog ────────────────────────── */}
      <Dialog
        open={isExporting || hasExportError}
        onClose={isExporting ? undefined : clearExportError}
        title={hasExportError ? "Export failed" : "Exporting video"}
        actions={exportDialogActions}
      >
        {exportError != null ? (
          <Text size="small" sx={{ color: "error.main" }}>
            {exportError}
          </Text>
        ) : (
          <FlexColumn gap={1} sx={{ minWidth: 360, py: 1 }}>
            <ProgressBar
              value={Math.round((exportProgress?.ratio ?? 0) * 100)}
              progressVariant={
                exportProgress && exportProgress.totalFrames > 0
                  ? "determinate"
                  : "indeterminate"
              }
              label={exportPhaseLabel(exportProgress)}
            />
          </FlexColumn>
        )}
      </Dialog>

    </FlexColumn>
  );
});

TimelineEditorBody.displayName = "TimelineEditorBody";

/**
 * Wraps the editor body in a {@link TimelineProvider} so each tab / page gets
 * its own isolated timeline stores (document, UI, playback). The load and
 * autosave hooks run inside the body, under the provider, so they bind to this
 * instance's stores rather than a shared singleton.
 */
export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  active = true,
  ...bodyProps
}) => (
  <TimelineProvider active={active}>
    <TimelineEditorBody active={active} {...bodyProps} />
  </TimelineProvider>
);

TimelineEditor.displayName = "TimelineEditor";

export default TimelineEditor;
