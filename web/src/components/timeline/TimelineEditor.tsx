/** @jsxImportSource @emotion/react */
/**
 * TimelineEditor — top-level page shell for the timeline route.
 *
 * Layout (top → bottom):
 *   TopBar (48 px)
 *   ─── resizable split ─────────────────────────
 *   FlexRow: PreviewArea (55 %) | InspectorArea (45 %)
 *   ─── horizontal drag handle (pointer + keyboard resizable) ────
 *   TracksArea (user-resizable, default 240 px)
 *   BottomStatusBar (32 px)
 *
 * On phones there is no room for three columns: the transcript and inspector
 * leave the row entirely and the preview takes the full width, so preview and
 * tracks — the two surfaces you need simultaneously to edit — stay stacked and
 * both usable. Inspector / Assistant / History / Script move into a bottom
 * sheet opened from the status bar, mirroring how mobile video editors slide
 * property panels over the timeline.
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
  ConflictBanner,
  Dialog,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  MobileBottomSheet,
  ProgressBar,
  SPACING,
  TabGroup,
  Text,
  ToolbarIconButton,
  BORDER_RADIUS,
  MOTION
} from "../ui_primitives";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";

import { TopBar } from "./TopBar";
import { BottomStatusBar } from "./BottomStatusBar";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import SaveToFolderMenu from "../assets/SaveToFolderMenu";
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
import ResizableSideDock from "../chat/assistant/ResizableSideDock";
import TimelineVersionHistoryPanel from "./TimelineVersionHistoryPanel";
import { useTimelineAgentBridge } from "../../hooks/timeline/useTimelineAgentBridge";
import { TranscriptPanel } from "./TranscriptPanel";
import { useHasScript } from "../../hooks/timeline/useHasScript";
import { ActivityIndicator } from "./ActivityIndicator";
import {
  useGeneratingCount,
  useFailedCount
} from "../../stores/timeline/TimelineGenerationStore";
import { useTimelineClipFocus } from "../../hooks/timeline/useTimelineClipFocus";
import { useWorkflowFreshnessCheck } from "../../hooks/timeline/useWorkflowFreshnessCheck";
import { useTimelineGenerationSubscriptions } from "../../hooks/timeline/useGenerateClip";
import { useLoadTimelineIntoStore } from "../../hooks/timeline/useLoadTimelineIntoStore";
import { useTimelineAutosave } from "../../hooks/timeline/useTimelineAutosave";
import { useTimelineExternalSync } from "../../hooks/timeline/useTimelineExternalSync";
import { useTimelineSave } from "../../hooks/timeline/useTimelineSave";
import { useTimelineExport } from "../../hooks/timeline/useTimelineExport";
import { useTimelineIsMobile } from "../../hooks/timeline/useTimelineIsMobile";

const HANDLE_HEIGHT_PX = 6;
/** Phone drag handle — 6px is under any reasonable touch target. */
const TOUCH_HANDLE_HEIGHT_PX = 20;
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

const dragHandleStyles = (theme: Theme, tall: boolean) =>
  css({
    height: tall ? TOUCH_HANDLE_HEIGHT_PX : HANDLE_HEIGHT_PX,
    cursor: "ns-resize",
    flexShrink: 0,
    backgroundColor: theme.vars.palette.divider,
    transition: MOTION.background,
    outline: "none",
    // The handle is a drag target, not a scroll surface: without this a touch
    // drag scrolls the page instead of resizing (and the pointermove stream
    // ends in a pointercancel).
    touchAction: "none",
    // Grip affordance — a bare 6px line reads as a border, not a control.
    ...(tall
      ? {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.vars.palette.background.paper,
          borderTop: `1px solid ${theme.vars.palette.divider}`,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          "&::after": {
            content: '""',
            width: 36,
            height: 3,
            borderRadius: BORDER_RADIUS.sm,
            backgroundColor: theme.vars.palette.text.disabled
          }
        }
      : null),
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

const PreviewRegion: React.FC<{
  isLoading: boolean;
  sequenceUnavailable: boolean;
  onRetryFetch?: () => void;
  onCreateNewSequence?: () => void;
  createSequencePending?: boolean;
  createSequenceErrorMessage?: string | null;
  /** Phone layout: the preview owns the whole row, no inspector beside it. */
  fullWidth?: boolean;
}> = memo(({
  isLoading,
  sequenceUnavailable,
  onRetryFetch,
  onCreateNewSequence,
  createSequencePending,
  createSequenceErrorMessage,
  fullWidth = false
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
      sx={
        fullWidth
          ? { flex: "1 1 auto", minWidth: 0, minHeight: 0, borderRight: "none" }
          : { flex: "0 1 55%", minWidth: 0, minHeight: 0, width: 0 }
      }
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

type InspectorTab = "inspector" | "agent" | "history" | "script";

const INSPECTOR_TABS = [
  { value: "inspector", label: "Inspector", icon: <TuneOutlinedIcon /> },
  { value: "agent", label: "Assistant", icon: <AutoAwesomeIcon /> },
  { value: "history", label: "History", icon: <HistoryOutlinedIcon /> }
];

const SCRIPT_TAB = {
  value: "script",
  label: "Script",
  icon: <SubtitlesOutlinedIcon />
};

const InspectorRegion: React.FC<{ sequenceId: string | undefined }> = memo(
  ({ sequenceId }) => {
  const theme = useTheme();
  const [tab, setTab] = useState<InspectorTab>("inspector");

  const tabs = INSPECTOR_TABS;

  return (
    <ResizableSideDock
      storageKey="timeline_assistant"
      defaultWidth={360}
      ariaLabel="Resize timeline side panel"
    >
      <FlexColumn css={inspectorRegionStyles(theme)} fullHeight sx={{ minHeight: 0 }}>
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
          {tab === "inspector" ? (
            <TimelineInspector />
          ) : tab === "agent" ? (
            <TimelineAgentPanel />
          ) : (
            <TimelineVersionHistoryPanel sequenceId={sequenceId} />
          )}
        </FlexColumn>
      </FlexColumn>
    </ResizableSideDock>
  );
  }
);
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
 * Phone-only bottom sheet holding the panels that don't fit beside the
 * preview: Inspector, Assistant, History, and the Script transcript when the
 * sequence has one. Opened from the status bar; the tabs sit in the sheet
 * header so switching panels never costs a close/reopen.
 *
 * `MobileBottomSheet` unmounts its content on close (`keepMounted: false`), so
 * the tab choice is held here — reopening lands where the user left off.
 */
const MobilePanelSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  sequenceId: string | undefined;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
}> = memo(({ open, onClose, sequenceId, tab, onTabChange }) => {
  const hasScript = useHasScript();
  const tabs = useMemo(
    () => (hasScript ? [...INSPECTOR_TABS, SCRIPT_TAB] : INSPECTOR_TABS),
    [hasScript]
  );

  // A sequence can lose its script while the Script tab is showing.
  const activeTab = tab === "script" && !hasScript ? "inspector" : tab;

  const tabRail = (
    <TabGroup
      tabs={tabs}
      value={activeTab}
      onChange={(value) => onTabChange(value as InspectorTab)}
      size="small"
      fullWidth
    />
  );

  return (
    <MobileBottomSheet
      open={open}
      onClose={onClose}
      headerExtras={tabRail}
      // Short enough that the preview stays visible above it — you adjust a
      // clip's transform or colour by watching the frame, not the form.
      maxHeight="62vh"
      showDragHandle
      showClose={false}
      ariaLabel="Timeline panels"
    >
      <FlexColumn fullWidth sx={{ height: "52vh", minHeight: 0 }}>
        {activeTab === "inspector" ? (
          <TimelineInspector />
        ) : activeTab === "agent" ? (
          <TimelineAgentPanel />
        ) : activeTab === "script" ? (
          <TranscriptPanel />
        ) : (
          <TimelineVersionHistoryPanel sequenceId={sequenceId} />
        )}
      </FlexColumn>
    </MobileBottomSheet>
  );
});
MobilePanelSheet.displayName = "MobilePanelSheet";

/**
 * Zoom + generation-count status bar, isolated from the editor shell.
 *
 * Subscribes to `msPerPx` (changes per zoom tick) and the generation counts
 * (change per WebSocket progress message) itself, so those high-frequency
 * updates re-render only this leaf instead of the whole `TimelineEditorBody`.
 */
const TimelineStatusBar: React.FC<{ actionSlot?: React.ReactNode }> = memo(
  ({ actionSlot }) => {
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
      actionSlot={actionSlot}
    />
  );
  }
);
TimelineStatusBar.displayName = "TimelineStatusBar";

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

const TimelineEditorBody: React.FC<
  Omit<TimelineEditorProps, "active">
> = memo(({ sequenceId: sequenceIdProp }) => {
  const { sequenceId: sequenceIdParam } = useParams<{ sequenceId: string }>();
  const sequenceId = sequenceIdProp ?? sequenceIdParam;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useTimelineIsMobile();

  // Phone panel sheet (Inspector / Assistant / History / Script).
  const [panelSheetOpen, setPanelSheetOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<InspectorTab>("inspector");
  const openPanelSheet = useCallback(() => setPanelSheetOpen(true), []);
  const closePanelSheet = useCallback(() => setPanelSheetOpen(false), []);
  const hasSelection = useTimelineUIStore((s) => s.selectedClipIds.size > 0);

  // Register the ui_timeline_* agent tools against this instance, addressable
  // by sequence id whether or not this editor is the focused surface.
  useTimelineAgentBridge(sequenceId ?? null);

  // Data fetching ─────────────────────────────────────────────────────────
  const { data: sequence, isLoading, isError, refetch } =
    useTimeline(sequenceId);

  // Mirror the fetched sequence into the TimelineStore so store-bound
  // components (Tracks, Inspector, ActivityIndicator) render its content.
  useLoadTimelineIntoStore(sequence);

  // Persist subsequent edits back via trpc.timeline.update (debounced).
  useTimelineAutosave();

  // Take in writes made outside this browser (agent doc-ops, CLI, another tab).
  useTimelineExternalSync(sequenceId ?? null);

  // Imperative save for the Save button (forces an immediate PATCH).
  const { save: handleSave, isSaving } = useTimelineSave();

  // Land on the clip a cross-document link asked for, once it has loaded.
  useTimelineClipFocus(sequenceId);

  // Reconcile clips against current workflow state on mount.
  useWorkflowFreshnessCheck(sequenceId ?? null);
  useTimelineGenerationSubscriptions();

  // Zoom and generation counts moved to `TimelineStatusBar` (below): both
  // change at high frequency (per zoom tick / per progress message) and
  // previously re-rendered this whole shell via subscriptions hosted here.

  // Offline video export (frame-by-frame, 1:1 with the live preview).
  const {
    exportVideo,
    saveAsAsset,
    cancel: cancelExport,
    clearError: clearExportError,
    isExporting,
    progress: exportProgress,
    error: exportError
  } = useTimelineExport();
  const handleExportVideo = useCallback(() => {
    void exportVideo(sequence?.name);
  }, [exportVideo, sequence?.name]);

  // "Save as Asset" — anchor the folder chooser to the TopBar button, then
  // render the timeline into a new asset in the chosen folder.
  const [saveAssetAnchor, setSaveAssetAnchor] = useState<HTMLElement | null>(
    null
  );
  const handleSaveToAssets = useCallback(
    (anchorEl: HTMLElement) => setSaveAssetAnchor(anchorEl),
    []
  );

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

  /** Begin drag — capture start position and activate drag state. */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragStartYRef.current = e.clientY;
      dragStartHeightRef.current = tracksHeight;
      setIsDragging(true);
    },
    [tracksHeight]
  );

  /**
   * Register / unregister window-level pointer listeners for the duration of a
   * drag. Cleanup runs on unmount, preventing listener leaks if the user
   * navigates away mid-drag.
   *
   * Pointer events (not mouse) so the handle drags under touch as well as a
   * mouse; `pointercancel` ends the drag when the OS takes the gesture over.
   *
   * `pointermove` fires far more often than the display refreshes, so it only
   * records the latest height in a ref and schedules at most one
   * `setTracksHeight` per animation frame — otherwise every move tick
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

    const onPointerMove = (ev: PointerEvent) => {
      const deltaY = dragStartYRef.current - ev.clientY; // drag up → taller
      pendingHeightRef.current = Math.min(
        MAX_TRACKS_HEIGHT_PX,
        Math.max(MIN_TRACKS_HEIGHT_PX, dragStartHeightRef.current + deltaY)
      );
      if (resizeRafIdRef.current === null) {
        resizeRafIdRef.current = requestAnimationFrame(flushPendingHeight);
      }
    };

    const onPointerUp = () => {
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

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      if (resizeRafIdRef.current !== null) {
        cancelAnimationFrame(resizeRafIdRef.current);
        resizeRafIdRef.current = null;
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
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

  // External writes that the dirty draft refused — offered per merge unit.
  const conflicts = useDocumentConflicts("timelinesequence", sequenceId ?? "");
  const conflictBanner = sequenceUnavailable ? null : conflicts.items.length > 0 && (
    <ConflictBanner
      conflicts={conflicts.items}
      onAccept={conflicts.accept}
      onDiscard={conflicts.discard}
      sx={{ mx: SPACING.md }}
    />
  );

  return (
    <FlexColumn fullWidth fullHeight css={editorStyles(theme)}>
      {/* ── Top bar ───────────────────────────────────────────────── */}
      <TopBar
        onExportVideo={sequenceUnavailable ? undefined : handleExportVideo}
        isExporting={isExporting}
        onSave={sequenceUnavailable ? undefined : handleSave}
        isSaving={isSaving}
        onSaveToAssets={sequenceUnavailable ? undefined : handleSaveToAssets}
        onOpenSettings={sequenceUnavailable ? undefined : handleOpenSettings}
        activitySlot={activitySlot}
      />
      {conflictBanner}
      <SaveToFolderMenu
        anchorEl={saveAssetAnchor}
        open={!!saveAssetAnchor}
        onClose={() => setSaveAssetAnchor(null)}
        onSelectFolder={(folderId) => void saveAsAsset(folderId, sequence?.name)}
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
        {!isMobile && <TranscriptRegion />}
        <PreviewRegion
          isLoading={isLoading}
          sequenceUnavailable={sequenceUnavailable}
          onRetryFetch={sequenceUnavailable ? handleRetrySequence : undefined}
          onCreateNewSequence={
            sequenceUnavailable ? handleCreateNewSequence : undefined
          }
          createSequencePending={createTimeline.isPending}
          createSequenceErrorMessage={createErrorMessage}
          fullWidth={isMobile}
        />
        {!isMobile && <InspectorRegion sequenceId={sequenceId} />}
      </FlexRow>

      {/* ── Horizontal drag handle (pointer + keyboard resizable) ─── */}
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize tracks panel"
        aria-valuenow={tracksHeight}
        aria-valuemin={MIN_TRACKS_HEIGHT_PX}
        aria-valuemax={MAX_TRACKS_HEIGHT_PX}
        tabIndex={0}
        css={dragHandleStyles(theme, isMobile)}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
      />

      {/* ── Tracks ────────────────────────────────────────────────── */}
      <TracksRegion heightPx={tracksHeight} />

      {/* ── Bottom status bar ─────────────────────────────────────── */}
      <TimelineStatusBar
        actionSlot={
          isMobile ? (
            <ToolbarIconButton
              onClick={openPanelSheet}
              tooltip="Panels"
              aria-label="Open panels"
              // Tinted while a clip is selected: that's when the Inspector has
              // something to show, and it's the only hint on a phone that
              // tapping a clip led somewhere.
              sx={{ color: hasSelection ? "primary.main" : undefined }}
            >
              <TuneOutlinedIcon fontSize="small" />
            </ToolbarIconButton>
          ) : undefined
        }
      />

      {/* ── Phone panel sheet ─────────────────────────────────────── */}
      {isMobile && (
        <MobilePanelSheet
          open={panelSheetOpen}
          onClose={closePanelSheet}
          sequenceId={sequenceId}
          tab={panelTab}
          onTabChange={setPanelTab}
        />
      )}

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
    <TimelineEditorBody {...bodyProps} />
  </TimelineProvider>
);

TimelineEditor.displayName = "TimelineEditor";

export default TimelineEditor;
