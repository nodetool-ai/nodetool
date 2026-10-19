/** @jsxImportSource @emotion/react */
/**
 * TimelineEditor — top-level page shell for the timeline route.
 *
 * Layout (top → bottom):
 *   Workspace tab row (document actions, workspace menu)
 *   DockCanvas: Script | Program + Source over Timeline | Inspector group
 *   BottomStatusBar (32 px)
 *
 * On desktop the panels sit in the shared dock (`stores/dock`, the one the
 * game editor uses). `TimelineDockLayout` defines the panels and the built-in
 * workspaces: Editing, Script, Assistant and Review. Panels move, group,
 * resize and maximize, and the layout is saved per user.
 *
 * DAW mode (TopBar switch, Alt+M) puts `DawWorkspace` in the Program panel
 * and takes the Source, Timeline and Script panels out of the dock: a
 * transport strip (the preview mounted audio-only), the tracks, and a
 * resizable dock with the mixer, the device chain, the piano roll and harmony.
 *
 * On phones there is no room for a dock: the preview takes the full width, so
 * preview and tracks — the two surfaces you need simultaneously to edit — stay
 * stacked and both usable. Inspector / Assistant / History / Script move into
 * a bottom sheet opened from the status bar, mirroring how mobile video
 * editors slide property panels over the timeline.
 *
 * Loading: shows LoadingSpinner centred in the preview region.
 * Not-found / error: shows EmptyState in the preview only; route and editor
 * chrome (tracks, inspector, status bar) stay mounted so the URL remains stable.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  AlertBanner,
  Button,
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
  type TabItem,
  ToolbarIconButton,
  ResizeHandle
} from "../ui_primitives";
import { isElectron, isLocalhost } from "../../lib/env";
import ReportBugButton from "../support/ReportBugButton";
import ErrorBanner from "../support/ErrorBanner";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  exportTimelineMedia,
  exportTimelinePremiere,
  exportTimelineZip
} from "../../utils/timelineBundle";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import PianoOutlinedIcon from "@mui/icons-material/PianoOutlined";
import MovieCreationOutlinedIcon from "@mui/icons-material/MovieCreationOutlined";

import { TopBar } from "./TopBar";
import { TimelineGenerateDialog } from "./TimelineGenerateDialog";
import { BottomStatusBar } from "./BottomStatusBar";
import { PlayheadReadout } from "./PlayheadReadout";
import { useTimelineCostEstimate } from "../../hooks/timeline/useTimelineCostEstimate";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import { AdaptFormatDialog } from "./AdaptFormatDialog";
import { ExportVideoDialog } from "./ExportVideoDialog";
import type { ExportVideoChoice } from "./ExportVideoDialog";
import SaveToFolderMenu from "../assets/SaveToFolderMenu";
import {
  useCreateTimeline,
  useTimeline,
  useTimelines
} from "../../hooks/useTimelineSequence";
import { TracksRegion } from "./Tracks/TracksRegion";
import { PianoRollPanel } from "./pianoRoll/PianoRollPanel";
import { useTimelineUIStore, useTimelineUIStoreApi } from "../../stores/timeline/TimelineUIStore";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import {
  useAssetsSelectedAsset,
  useLibrarySelectedAsset
} from "../../stores/AssetGridStore";
import { usePanelStore } from "../../stores/PanelStore";
import { TimelineProvider } from "../../stores/timeline/TimelineInstance";
import { VideoLandingStrip } from "../setup/video/VideoLandingStrip";
import { useReattachSequenceJobs } from "../../hooks/timeline/useReattachSequenceJobs";
import { PreviewArea } from "./preview/PreviewArea";
import { DawWorkspace } from "./daw/dock/DawWorkspace";
import { FieldDensityContext } from "../ui_primitives";
import { TimelineInstrumentsPanel } from "./TimelineInstrumentsPanel";
import { TimelineInspector } from "./Inspector/TimelineInspector";
import { SourceViewerPanel } from "./SourceViewerPanel";
import MovieFilterOutlinedIcon from "@mui/icons-material/MovieFilterOutlined";
import TimelineAgentPanel from "./TimelineAgentPanel";
import TimelineVersionHistoryPanel from "./TimelineVersionHistoryPanel";
import { useTimelineAgentBridge } from "../../hooks/timeline/useTimelineAgentBridge";
import { useTimelineMenuCommands } from "../../hooks/timeline/useTimelineMenuCommands";
import { TranscriptPanel } from "./TranscriptPanel";
import { useHasScript } from "../../hooks/timeline/useHasScript";
import { useTimelineLayoutStore } from "../../stores/timeline/TimelineLayoutStore";
import { useTimelineDockLayoutStore } from "../../stores/timeline/useTimelineDockLayoutStore";
import { TIMELINE_SIDE_PANEL_IDS, type TimelinePanelId } from "../../stores/timeline/TimelineDockLayout";
import { DockCanvas, type DockMaximizeController } from "../dock/DockCanvas";
import { DockLayoutMenu } from "../dock/DockLayoutMenu";
import { useDockPresentation, type DockPanelView } from "../dock/useDockPresentation";
import { timelinePanelRegistrations } from "./dock/timelinePanels";
import { TimelineTracksPanel } from "./dock/TimelineTracksPanel";
import {
  TimelineDockContext,
  createTimelineDockController,
  findFocusedDockGroup,
  focusDockPanel,
  type TimelineDockController
} from "./dock/timelineDockController";
import { useTimelineDockCommands } from "../../hooks/timeline/useTimelineDockCommands";
import { CodePanel } from "./CodePanel";
import TimelineShotPanel, {
  useHasSelectedShotClip
} from "./shot/TimelineShotPanel";
import TimelineLinkedBoards from "./shot/TimelineLinkedBoards";
import { useTimelineHasCode } from "../../serverState/useTimelineCode";
import CodeIcon from "@mui/icons-material/Code";
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
import { useGuardedPanelTab } from "../../hooks/timeline/useGuardedPanelTab";
import { ensureBundledFontsLoaded } from "./preview/fontLoading";
import { useWorkspaceHeaderActions } from "../workspace/WorkspaceHeaderActionsContext";

// The `@font-face` rules for the bundled corpus, pointing at the same files
// the server rasterizer registers (D8). Imported by the editor rather than
// globally so a session that never opens a timeline never fetches them.
import "./fonts.css";

/** Phone drag handle — 6px is under any reasonable touch target. */
const TOUCH_HANDLE_HEIGHT_PX = SPACING.xxl * 4;
/** Phone layout only: on desktop the dock sizes the Timeline panel. */
const DEFAULT_TRACKS_HEIGHT_PX = 240;
const MIN_TRACKS_HEIGHT_PX = 80;
const MAX_TRACKS_HEIGHT_PX = 600;
/** The preview row never shrinks below this while the tracks panel grows. */
const MIN_PREVIEW_HEIGHT_PX = 160;
const TRACKS_HEIGHT_STORAGE_KEY = "nodetool.timeline.tracksHeight";
/** What an archive export's failure notification calls it. */
const clampTracksHeight = (height: number): number =>
  Math.min(MAX_TRACKS_HEIGHT_PX, Math.max(MIN_TRACKS_HEIGHT_PX, height));

function readStoredTracksHeight(): number {
  try {
    const raw = localStorage.getItem(TRACKS_HEIGHT_STORAGE_KEY);
    const value = raw == null ? NaN : Number(raw);
    return Number.isFinite(value)
      ? clampTracksHeight(value)
      : DEFAULT_TRACKS_HEIGHT_PX;
  } catch {
    return DEFAULT_TRACKS_HEIGHT_PX;
  }
}

function writeStoredTracksHeight(height: number): void {
  try {
    localStorage.setItem(TRACKS_HEIGHT_STORAGE_KEY, String(Math.round(height)));
  } catch {
    /* ignore quota / private-mode */
  }
}

/** Where the backend runs, for the status bar's Local / Cloud indicator. */
const ENVIRONMENT_MODE: "local" | "cloud" =
  isLocalhost || isElectron ? "local" : "cloud";
/** Arrow-key step for keyboard resizing (px) */
const KEYBOARD_RESIZE_STEP_PX = 20;
/** Bottom dock height, in px, that shows an expanded instrument track's keyboard. */
const EXPANDED_INSTRUMENT_BOTTOM_PX = 420;
/** The panels that always have something to show, so they mount before first activation. */
const EAGER_DOCK_PANELS: readonly TimelinePanelId[] = ["program", "tracks"];
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
    backgroundColor: theme.vars.palette.background.default,
    "&& .MuiOutlinedInput-root:not(.Mui-focused):not(.Mui-error)": {
      "& .MuiOutlinedInput-notchedOutline": { borderColor: "transparent" },
      "&:hover:not(.Mui-disabled) .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.divider
      }
    }
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

/** Human-readable label for the current export phase. */
function exportPhaseLabel(
  progress: { phase: string; frame: number; totalFrames: number } | null,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!progress) return t("i18n-next25.timeline.export.preparing");
  switch (progress.phase) {
    case "audio":
      return t("i18n-next25.timeline.export.mixingAudio");
    case "video":
      return t("i18n-next25.timeline.export.encodingFrame", { frame: progress.frame, totalFrames: progress.totalFrames });
    case "finalizing":
      return t("i18n-next25.timeline.export.finalizing");
    default:
      return t("i18n-next25.timeline.export.preparing");
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
  const { t } = useTranslation();
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
          : { flex: "1 1 55%", minWidth: 0, minHeight: 0, width: 0 }
      }
    >
      {isLoading ? (
        <LoadingSpinner text={t("i18n-next25.timeline.loadingSequence")} />
      ) : sequenceUnavailable ? (
        <FlexColumn
          align="center"
          justify="center"
          gap={2}
          sx={{ flex: 1, width: "100%", px: 2 }}
        >
          <EmptyState
            variant="error"
            title={t("i18n-next25.timeline.sequenceNotFound")}
            description={t("i18n-next25.timeline.sequenceUnavailableDescription")}
          />
          <FlexRow gap={1} align="center" justify="center" sx={{ flexWrap: "wrap" }}>
            {onRetryFetch ? (
              <EditorButton
                variant="outlined"
                size="small"
                onClick={onRetryFetch}
                disabled={createSequencePending}
                aria-label={t("i18n-next25.timeline.retryLoadingSequence")}
              >
                {t("i18n-next25.timeline.retry")}
              </EditorButton>
            ) : null}
            {onCreateNewSequence ? (
              <EditorButton
                variant="contained"
                size="small"
                onClick={onCreateNewSequence}
                disabled={createSequencePending}
                aria-label={t("i18n-next25.timeline.createNewSequence")}
              >
                {createSequencePending ? t("i18n-next25.timeline.creating") : t("i18n-next25.timeline.newSequence")}
              </EditorButton>
            ) : null}
          </FlexRow>
          {createSequenceErrorMessage ? (
            <ErrorBanner
              report={{
                source: "operation-failure",
                summary: t("i18n-next25.timeline.createSequenceFailed"),
                errorText: createSequenceErrorMessage
              }}
            >
              {createSequenceErrorMessage}
            </ErrorBanner>
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

type InspectorTab = "inspector" | "shot" | "source" | "instrument" | "agent" | "history" | "script" | "code";

const INSPECTOR_TABS = [
  { value: "inspector", label: "Inspector", icon: <TuneOutlinedIcon fontSize="small" /> },
  { value: "instrument", label: "Instruments", icon: <PianoOutlinedIcon fontSize="small" /> },
  { value: "source", label: "Source", icon: <MovieFilterOutlinedIcon fontSize="small" /> },
  { value: "agent", label: "Assistant", icon: <AutoAwesomeIcon fontSize="small" /> },
  { value: "history", label: "History", icon: <HistoryOutlinedIcon fontSize="small" /> }
];

const SCRIPT_TAB = {
  value: "script",
  label: "Script",
  icon: <SubtitlesOutlinedIcon fontSize="small" />
};

const SHOT_TAB = {
  value: "shot",
  label: "Shot",
  icon: <MovieCreationOutlinedIcon fontSize="small" />
};

const CODE_TAB = {
  value: "code",
  label: "Code",
  icon: <CodeIcon fontSize="small" />
};

/** What the timeline holds right now that gives its contextual panels something to show. */
const useContextualPanelFlags = (): {
  hasMidiTrack: boolean;
  hasSourceAsset: boolean;
  hasShotClip: boolean;
} => {
  const hasMidiTrack = useTimelineStore((s) => s.tracks.some((track) => track.type === "midi"));
  const activeExplorer = usePanelStore((s) => s.panel.activeView);
  const assetsAsset = useAssetsSelectedAsset();
  const libraryAsset = useLibrarySelectedAsset();
  const hasSourceAsset = activeExplorer === "assets"
    ? assetsAsset !== null
    : activeExplorer === "library" && libraryAsset !== null;
  const hasShotClip = useHasSelectedShotClip();
  return { hasMidiTrack, hasSourceAsset, hasShotClip };
};

const useAvailableInspectorTabs = (
  tab: InspectorTab,
  hasScript = false,
  hasCode = false
): { tabs: TabItem[]; activeTab: InspectorTab } => {
  const { hasMidiTrack, hasSourceAsset, hasShotClip } = useContextualPanelFlags();
  const tabs = INSPECTOR_TABS.filter((item) =>
    (item.value !== "instrument" || hasMidiTrack) &&
    (item.value !== "source" || hasSourceAsset)
  );
  if (hasShotClip) tabs.splice(1, 0, SHOT_TAB);
  if (hasScript) tabs.push(SCRIPT_TAB);
  if (hasCode) tabs.push(CODE_TAB);
  const activeTab = tabs.some((item) => item.value === tab) ? tab : "inspector";
  return { tabs, activeTab };
};

/** The dock panel each `panelTab` request opens. The phone sheet shows the tab itself. */
const PANEL_TAB_DOCK_ID: Record<InspectorTab, TimelinePanelId> = {
  inspector: "inspector",
  shot: "shot",
  source: "source",
  instrument: "instruments",
  agent: "assistant",
  history: "history",
  script: "transcript",
  code: "code"
};

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
  const hasCode = useTimelineHasCode(sequenceId);
  const { tabs, activeTab } = useAvailableInspectorTabs(tab, hasScript, hasCode);
  useEffect(() => {
    if (activeTab !== tab) onTabChange(activeTab);
  }, [activeTab, tab, onTabChange]);

  const tabRail = (
    <TabGroup
      tabs={tabs}
      value={activeTab}
      onChange={(value) => onTabChange(value as InspectorTab)}
      size="small"
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
      ariaLabel={t("i18n-next119.timeline.panels")}
    >
      <FlexColumn fullWidth sx={{ height: "52vh", minHeight: 0 }}>
        {activeTab === "inspector" ? (
          <TimelineInspector />
        ) : activeTab === "shot" ? (
          <TimelineShotPanel />
        ) : activeTab === "instrument" ? (
          <TimelineInstrumentsPanel />
        ) : activeTab === "source" ? (
          <SourceViewerPanel />
        ) : activeTab === "agent" ? (
          <TimelineAgentPanel />
        ) : activeTab === "script" ? (
          <TranscriptPanel />
        ) : activeTab === "code" ? (
          <CodePanel />
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
  const costEstimate = useTimelineCostEstimate();

  return (
    <BottomStatusBar
      mode={ENVIRONMENT_MODE}
      zoom={zoom}
      onZoomChange={handleZoomChange}
      generatingCount={generatingCount}
      failedCount={failedCount}
      costEstimate={costEstimate}
      actionSlot={actionSlot}
      readoutSlot={<PlayheadReadout />}
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

const TimelineEditorBody: React.FC<TimelineEditorProps> = memo(({
  sequenceId: sequenceIdProp,
  active = true
}) => {
  const { t } = useTranslation();
  const { sequenceId: sequenceIdParam } = useParams<{ sequenceId: string }>();
  const sequenceId = sequenceIdProp ?? sequenceIdParam;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useTimelineIsMobile();
  const [generateOpen, setGenerateOpen] = useState(false);
  const openGenerate = useCallback(() => setGenerateOpen(true), []);
  const closeGenerate = useCallback(() => setGenerateOpen(false), []);

  // Phone panel sheet (Inspector / Assistant / History / Script).
  const [panelSheetOpen, setPanelSheetOpen] = useState(false);
  // Backs the phone MobilePanelSheet's tab switcher, so a dirty-Code leave
  // confirms exactly once. On desktop the Code panel stays mounted while
  // another tab is active, so leaving it loses nothing.
  const { panelTab, setPanelTab, confirmDialog: codeTabConfirmDialog } =
    useGuardedPanelTab();
  const panelTabRequest = useTimelineUIStore((s) => s.panelTabRequest);
  useEffect(() => { if (isMobile && panelTab === "instrument") setPanelSheetOpen(true); }, [isMobile, panelTab]);
  const openPanelSheet = useCallback(() => setPanelSheetOpen(true), []);
  const closePanelSheet = useCallback(() => setPanelSheetOpen(false), []);
  const hasSelection = useTimelineUIStore((s) => s.selectedClipIds.size > 0);
  const pianoRollOpen = useTimelineUIStore((s) => s.pianoRollClipId !== null);
  const pianoRollFullScreen = isMobile && pianoRollOpen;

  // TopBar's Code button — shown only when this timeline embeds authoring
  // code, opens the Code panel (dock on desktop, sheet on phone).
  const hasCode = useTimelineHasCode(sequenceId);
  const hasScript = useHasScript();
  const dawMode = useTimelineLayoutStore((s) => s.dawMode);
  const setDawMode = useTimelineLayoutStore((s) => s.setDawMode);
  const { hasMidiTrack, hasSourceAsset, hasShotClip } = useContextualPanelFlags();

  // Desktop dock ──────────────────────────────────────────────────────────
  const dockStore = useTimelineDockLayoutStore();
  const dockLayout = useStore(dockStore, (state) => state.layout);
  const dockHidden = dockLayout.hidden;
  const transcriptVisible = !dockHidden.includes("transcript");
  const sidePanelVisible = TIMELINE_SIDE_PANEL_IDS.some((id) => !dockHidden.includes(id));
  const toggleTranscript = useCallback(
    () => dockStore.getState().togglePanels(["transcript"]),
    [dockStore]
  );
  const toggleSidePanel = useCallback(
    () => dockStore.getState().togglePanels(TIMELINE_SIDE_PANEL_IDS),
    [dockStore]
  );
  const dockRoot = useRef<HTMLDivElement>(null);
  const lastDockGroup = useRef<string | null>(null);
  const dockMaximize = useRef<DockMaximizeController | null>(null);
  const uiStoreApi = useTimelineUIStoreApi();
  // Contextual panels have a view only while their condition holds. Written
  // during render so the controller always reads the current set.
  const availablePanels = useRef<ReadonlySet<string>>(new Set());

  // Register the ui_timeline_* agent tools against this instance, addressable
  // by sequence id whether or not this editor is the focused surface.
  useTimelineAgentBridge(sequenceId ?? null);
  useTimelineMenuCommands();
  // Clips generated while this sequence was closed still land on it (§ 8.4).
  useReattachSequenceJobs(sequenceId ?? null);

  // Data fetching ─────────────────────────────────────────────────────────
  const { data: sequence, isLoading, isError, refetch } =
    useTimeline(sequenceId);

  // Persist subsequent edits back via trpc.timeline.update (debounced).
  // Declared before the load hook on purpose: effect cleanups run in
  // declaration order on unmount, so autosave's closing flush must come
  // before the load hook's store reset or the last edits are lost.
  const { flush: flushAutosave } = useTimelineAutosave();

  // Mirror the fetched sequence into the TimelineStore so store-bound
  // components (Tracks, Inspector, ActivityIndicator) render its content.
  useLoadTimelineIntoStore(sequence);

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
  // The export dialog picks a container first: MP4, WebM, or a zip of PNGs.
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false);
  const handleExportVideo = useCallback(() => setExportChoiceOpen(true), []);
  const handleCloseExportChoice = useCallback(
    () => setExportChoiceOpen(false),
    []
  );
  const handleStartExport = useCallback(
    (choice: ExportVideoChoice) => {
      void exportVideo(sequence?.name, choice);
    },
    [exportVideo, sequence?.name]
  );

  // Server-packed archives: the whole project, a Premiere Pro XML with its
  // media, or the media alone. Each saves the visible document first.
  const [exportingArchive, setExportingArchive] = useState<
    "bundle" | "premiere" | "media" | null
  >(null);
  const exportArchive = useCallback(
    async (kind: "bundle" | "premiere" | "media") => {
      if (!sequenceId) return;
      setExportingArchive(kind);
      const notify = useNotificationStore.getState().addNotification;
      try {
        const saveResult = await flushAutosave();
        if (!saveResult.ok) {
          throw new Error(t("i18n-next25.timeline.export.saveBeforeExportFailed", { error: saveResult.error }));
        }
        const name = sequence?.name || "timeline";
        if (kind === "bundle") {
          await exportTimelineZip(sequenceId, name);
          return;
        }
        if (kind === "media") {
          const missing = await exportTimelineMedia(sequenceId, name);
          if (missing) {
            notify({
              type: "warning",
              dismissable: true,
              content: t("i18n-next25.timeline.export.mediaMissing", { count: missing })
            });
          }
          return;
        }
        const warnings = await exportTimelinePremiere(sequenceId, name);
        if (warnings) {
          notify({
            type: "warning",
            dismissable: true,
            content: t("i18n-next25.timeline.export.premiereWarnings", { count: warnings })
          });
        }
      } catch (error) {
        notify({
          type: "error",
          alert: true,
          dismissable: true,
          content: `${t(`i18n-next25.timeline.export.label.${kind}`)} ${t("i18n-next25.timeline.export.failed")}: ${error instanceof Error ? error.message : String(error)}`
        });
      } finally {
        setExportingArchive(null);
      }
    },
    [flushAutosave, sequenceId, sequence?.name, t]
  );
  const handleExportBundle = useCallback(
    () => void exportArchive("bundle"),
    [exportArchive]
  );
  const handleExportPremiere = useCallback(
    () => void exportArchive("premiere"),
    [exportArchive]
  );
  const isExportingBundle = exportingArchive === "bundle";
  const isExportingPremiere = exportingArchive === "premiere";
  const handleExportMedia = useCallback(
    () => void exportArchive("media"),
    [exportArchive]
  );
  const isExportingMedia = exportingArchive === "media";

  // "Save as asset" — anchor the folder chooser to the TopBar button, then
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
  const [adaptFormatOpen, setAdaptFormatOpen] = useState(false);
  const handleOpenAdaptFormat = useCallback(() => setAdaptFormatOpen(true), []);
  const handleCloseAdaptFormat = useCallback(() => setAdaptFormatOpen(false), []);
  const mediaTracks = useTimelineStore((state) => state.mediaTracks);
  // Stable element so `activitySlot` doesn't defeat TopBar's memo every render.
  const activitySlot = useMemo(() => <ActivityIndicator />, []);

  // Tracks resize ─────────────────────────────────────────────────────────
  // The stored height is the user's choice; the rendered height is clamped so
  // the preview row above keeps MIN_PREVIEW_HEIGHT_PX in a short window.
  const [tracksHeight, setTracksHeight] = useState(readStoredTracksHeight);
  const editorColumnRef = useRef<HTMLDivElement>(null);
  const [maxTracksHeight, setMaxTracksHeight] = useState(MAX_TRACKS_HEIGHT_PX);
  useEffect(() => {
    const column = editorColumnRef.current;
    if (!column) return;
    const update = () => {
      const columnHeight = column.clientHeight;
      // An unlaid-out column (hidden tab, jsdom) measures 0: keep the cap.
      if (columnHeight <= 0) return;
      const available =
        columnHeight - MIN_PREVIEW_HEIGHT_PX - TOUCH_HANDLE_HEIGHT_PX;
      setMaxTracksHeight(
        Math.max(MIN_TRACKS_HEIGHT_PX, Math.min(MAX_TRACKS_HEIGHT_PX, available))
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(column);
    return () => observer.disconnect();
  }, [isMobile]);
  const effectiveTracksHeight = Math.min(tracksHeight, maxTracksHeight);
  /** Apply and remember a height the user chose (drag, keys, reset). */
  const commitTracksHeight = useCallback((height: number) => {
    const next = clampTracksHeight(height);
    setTracksHeight(next);
    writeStoredTracksHeight(next);
  }, []);
  const expandedInstrumentTrackId = useTimelineUIStore((s) => s.expandedInstrumentTrackId);
  useEffect(() => {
    if (expandedInstrumentTrackId && !pianoRollOpen) setTracksHeight((height) => Math.max(height, 420));
  }, [expandedInstrumentTrackId, pianoRollOpen]);
  useEffect(() => {
    if (pianoRollOpen) setTracksHeight((height) => Math.min(height, DEFAULT_TRACKS_HEIGHT_PX));
  }, [pianoRollOpen]);
  const isDraggingRef = useRef(false);
  const latestHeightRef = useRef(effectiveTracksHeight);
  latestHeightRef.current = effectiveTracksHeight;
  // Latest computed height + pending rAF id for the throttled resize below.
  const pendingHeightRef = useRef<number | null>(null);
  const resizeRafIdRef = useRef<number | null>(null);

  const cancelPendingFlush = useCallback(() => {
    if (resizeRafIdRef.current !== null) {
      cancelAnimationFrame(resizeRafIdRef.current);
      resizeRafIdRef.current = null;
    }
  }, []);

  /**
   * `pointermove` fires far more often than the display refreshes, so a drag
   * only records the latest height in a ref and schedules at most one
   * `setTracksHeight` per animation frame — otherwise every move tick
   * re-rendered the whole shell. Keyboard steps commit straight away.
   */
  const handleTracksResize = useCallback(
    (delta: number) => {
      const next = clampTracksHeight(
        (pendingHeightRef.current ?? latestHeightRef.current) + delta
      );
      if (!isDraggingRef.current) {
        commitTracksHeight(next);
        return;
      }
      pendingHeightRef.current = next;
      if (resizeRafIdRef.current === null) {
        resizeRafIdRef.current = requestAnimationFrame(() => {
          resizeRafIdRef.current = null;
          if (pendingHeightRef.current !== null) {
            setTracksHeight(pendingHeightRef.current);
          }
        });
      }
    },
    [commitTracksHeight]
  );

  const handleTracksResizeStart = useCallback(() => {
    isDraggingRef.current = true;
    pendingHeightRef.current = null;
    // Prevent text selection in adjacent regions during drag.
    document.body.style.userSelect = "none";
  }, []);

  const handleTracksResizeEnd = useCallback(() => {
    cancelPendingFlush();
    // Flush the final position synchronously so a pointerup landing between
    // animation frames doesn't leave the panel at a stale height.
    if (pendingHeightRef.current !== null) {
      commitTracksHeight(pendingHeightRef.current);
      pendingHeightRef.current = null;
    }
    isDraggingRef.current = false;
    document.body.style.userSelect = "";
  }, [cancelPendingFlush, commitTracksHeight]);

  useEffect(
    () => () => {
      cancelPendingFlush();
      document.body.style.userSelect = "";
    },
    [cancelPendingFlush]
  );

  // Start the font fetch when the editor mounts, so the first title is drawn
  // with its real face instead of the fallback. `TextRasterizer` also refuses
  // to cache a bitmap until this resolves, which is what makes a slow fetch a
  // brief flicker rather than a wrong frame that sticks.
  useEffect(() => {
    void ensureBundledFontsLoaded();
  }, []);

  /** Double-click the grip to return the tracks panel to its default height. */
  const handleResetTracksHeight = useCallback(
    () => commitTracksHeight(DEFAULT_TRACKS_HEIGHT_PX),
    [commitTracksHeight]
  );

  /** Query finished without a usable row (disabled id, error, or empty). */
  const sequenceUnavailable = !isLoading && (isError || !sequence);
  /** Loading and error states keep the video layout, which shows them. */
  const dawActive = dawMode && !isLoading && !sequenceUnavailable;

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
      { name: t("i18n-next25.timeline.untitledSequence"), projectId: projectIdForNewSequence },
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
  }, [createTimeline, navigate, projectIdForNewSequence, searchParams, t]);

  const createErrorMessage =
    createTimeline.error != null
      ? createTimeline.error.message || t("i18n-next25.timeline.couldNotCreateSequence")
      : null;

  // The dock's panels. Contextual ones (Source, Shot, Instruments, Code, and
  // the Script when the sequence has none) get no view until they have
  // something to show, which hides them while their place in the layout stays.
  const dockRegistrations = useMemo(
    () => timelinePanelRegistrations(dawActive),
    [dawActive]
  );
  useEffect(() => {
    dockStore.getState().registerPanels(dockRegistrations);
  }, [dockStore, dockRegistrations, dockLayout]);
  const allDockViews: DockPanelView[] = [
    {
      id: "program",
      node: dawActive ? (
        <DawWorkspace onGenerate={openGenerate} />
      ) : (
        <PreviewRegion
          isLoading={isLoading}
          sequenceUnavailable={sequenceUnavailable}
          onRetryFetch={sequenceUnavailable ? handleRetrySequence : undefined}
          onCreateNewSequence={
            sequenceUnavailable ? handleCreateNewSequence : undefined
          }
          createSequencePending={createTimeline.isPending}
          createSequenceErrorMessage={createErrorMessage}
          fullWidth
        />
      )
    },
    { id: "source", node: <SourceViewerPanel />, visible: hasSourceAsset && !dawActive },
    {
      id: "tracks",
      node: <TimelineTracksPanel onGenerate={sequenceUnavailable ? undefined : openGenerate} />,
      visible: !dawActive
    },
    { id: "transcript", node: <TranscriptPanel />, visible: hasScript && !dawActive },
    { id: "inspector", node: <TimelineInspector /> },
    { id: "shot", node: <TimelineShotPanel />, visible: hasShotClip },
    { id: "instruments", node: <TimelineInstrumentsPanel />, visible: hasMidiTrack },
    { id: "assistant", node: <TimelineAgentPanel /> },
    { id: "history", node: <TimelineVersionHistoryPanel sequenceId={sequenceId} /> },
    { id: "code", node: <CodePanel />, visible: hasCode }
  ];
  const dockViews = allDockViews.filter((view) => view.visible !== false);
  availablePanels.current = new Set(dockViews.map((view) => view.id));
  const dockPresentation = useDockPresentation({
    store: dockStore,
    layout: dockLayout,
    registry: dockRegistrations,
    availableIds: dockViews.map((view) => view.id),
    views: dockViews,
    root: dockRoot
  });
  const dock = useMemo<TimelineDockController | null>(
    () =>
      isMobile
        ? null
        : createTimelineDockController({
            store: dockStore,
            isAvailable: (id) => availablePanels.current.has(id),
            focusedGroupId: () =>
              findFocusedDockGroup(dockRoot.current, lastDockGroup.current),
            focusPanel: (id) => focusDockPanel(dockRoot.current, id),
            maximize: () => dockMaximize.current,
            requestProgramFullscreen: () =>
              uiStoreApi.getState().requestPreviewFullscreen(),
            notify: (message) =>
              useNotificationStore.getState().addNotification({
                type: "info",
                dismissable: true,
                content: message
              })
          }),
    [dockStore, isMobile, uiStoreApi]
  );
  useTimelineDockCommands(dock, dockStore);

  // Something asked for a panel (a double-click on a clip, Match Frame, an
  // instrument track's keyboard): open the dock panel that goes with it. The
  // request count a mount starts at is not a request.
  const handledPanelRequest = useRef(panelTabRequest);
  useEffect(() => {
    if (handledPanelRequest.current === panelTabRequest) return;
    handledPanelRequest.current = panelTabRequest;
    const id = PANEL_TAB_DOCK_ID[panelTab];
    // A request comes from editing (a double-click, Match Frame), so focus
    // stays on the timeline and Delete and the arrows keep acting there.
    if (dock && availablePanels.current.has(id)) dock.openPanel(id);
  }, [dock, panelTab, panelTabRequest]);

  // The tracks panel keeps its room when a clip editor or an expanded
  // instrument needs more of it. The canvas adds the room to what it shows and
  // takes it back when the need ends. It is never written to the saved layout.
  const expandedInstrument = useTimelineUIStore((s) => s.expandedInstrumentTrackId);
  const pianoRollHeightPx = useTimelineUIStore((s) => s.pianoRollHeightPx);
  const storedBottom = useStore(dockStore, (state) => state.layout.sizes.bottom);
  const extraBottom = pianoRollOpen
    ? pianoRollHeightPx
    : expandedInstrument
      ? Math.max(0, EXPANDED_INSTRUMENT_BOTTOM_PX - storedBottom)
      : 0;

  const handleOpenCode = useCallback(() => {
    if (dock) {
      dock.openPanel("code", { focus: true });
      return;
    }
    setPanelTab("code");
    setPanelSheetOpen(true);
  }, [dock, setPanelTab]);
  // The menu lists the panels that have a view, which changes only when a
  // contextual panel appears or goes.
  const dockPanelKey = dockViews.map((view) => view.id).join();
  const dockPanelIds = useMemo(() => dockPanelKey.split(","), [dockPanelKey]);
  const layoutMenu = useMemo(
    () =>
      isMobile ? undefined : (
        <DockLayoutMenu
          store={dockStore}
          panels={dockRegistrations.filter((entry) =>
            dockPanelIds.includes(entry.id)
          )}
        />
      ),
    [dockStore, dockRegistrations, dockPanelIds, isMobile]
  );

  const headerActions = useMemo(
    () => (
      <TopBar
        onExportVideo={sequenceUnavailable ? undefined : handleExportVideo}
        isExporting={isExporting}
        onExportBundle={sequenceUnavailable ? undefined : handleExportBundle}
        isExportingBundle={isExportingBundle}
        onExportPremiere={
          sequenceUnavailable ? undefined : handleExportPremiere
        }
        isExportingPremiere={isExportingPremiere}
        onExportMedia={sequenceUnavailable ? undefined : handleExportMedia}
        isExportingMedia={isExportingMedia}
        onSave={sequenceUnavailable ? undefined : handleSave}
        isSaving={isSaving}
        onSaveToAssets={sequenceUnavailable ? undefined : handleSaveToAssets}
        onOpenSettings={sequenceUnavailable ? undefined : handleOpenSettings}
        onAdaptFormat={sequenceUnavailable ? undefined : handleOpenAdaptFormat}
        activitySlot={activitySlot}
        hasCode={!sequenceUnavailable && hasCode}
        onOpenCode={handleOpenCode}
        layoutMenu={layoutMenu}
        sequenceId={sequenceUnavailable ? undefined : sequenceId}
        onToggleTranscript={
          !isMobile && hasScript && !dawMode ? toggleTranscript : undefined
        }
        transcriptVisible={transcriptVisible}
        onToggleSidePanel={isMobile ? undefined : toggleSidePanel}
        sidePanelVisible={sidePanelVisible}
        onSetDawMode={sequenceUnavailable ? undefined : setDawMode}
        dawMode={dawMode}
      />
    ),
    [
      dawMode,
      layoutMenu,
      setDawMode,
      hasScript,
      isMobile,
      sidePanelVisible,
      toggleSidePanel,
      toggleTranscript,
      transcriptVisible,
      activitySlot,
      handleExportBundle,
      handleExportMedia,
      handleExportPremiere,
      handleExportVideo,
      handleOpenCode,
      handleOpenSettings,
      handleOpenAdaptFormat,
      handleSave,
      handleSaveToAssets,
      hasCode,
      isExporting,
      isExportingBundle,
      isExportingMedia,
      isExportingPremiere,
      isSaving,
      sequenceId,
      sequenceUnavailable
    ]
  );
  const workspaceHeader = useWorkspaceHeaderActions();
  const registerHeaderActions = workspaceHeader?.registerActions;
  const unregisterHeaderActions = workspaceHeader?.unregisterActions;
  useEffect(() => {
    if (
      !active ||
      !registerHeaderActions ||
      !unregisterHeaderActions ||
      !sequenceId
    ) {
      return;
    }
    registerHeaderActions(sequenceId, headerActions);
    return () => unregisterHeaderActions(sequenceId);
  }, [
    active,
    headerActions,
    registerHeaderActions,
    sequenceId,
    unregisterHeaderActions
  ]);

  // Export dialog action button — memoized so re-renders unrelated to export
  // state (e.g. the tracks-resize drag) don't allocate a fresh element that
  // would defeat Dialog's memo. A failed export closes from the title X.
  const hasExportError = exportError != null;
  const exportDialogActions = useMemo(
    () =>
      isExporting ? (
        <Button variant="text" color="inherit" onClick={cancelExport}>
          {t("i18n-next25.timeline.cancel")}
        </Button>
      ) : undefined,
    [isExporting, cancelExport]
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
    <FieldDensityContext.Provider value="compact">
    <TimelineDockContext.Provider value={dock}>
    <FlexColumn fullWidth fullHeight css={editorStyles(theme)}>
      {!workspaceHeader && headerActions}
      {conflictBanner}
      {/* The guided video flow's landing strip: progress, retries and next
       *  steps. Renders nothing on a sequence that never went through it. */}
      <VideoLandingStrip
        onExport={sequenceUnavailable ? undefined : handleExportVideo}
      />
      <SaveToFolderMenu
        anchorEl={saveAssetAnchor}
        open={!!saveAssetAnchor}
        onClose={() => setSaveAssetAnchor(null)}
        onSelectFolder={(folderId) => void saveAsAsset(folderId, sequence?.name)}
      />

      {isMobile ? (
      <FlexRow fullWidth sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      <FlexColumn ref={editorColumnRef} sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
      {dawActive ? (
        <DawWorkspace onGenerate={openGenerate} />
      ) : (
      <>
      {/* ── Middle: preview ───────────────────────────────────────── */}
      {/* Basis 0 (not `auto`): the middle row absorbs all leftover height via
       *  flex-grow, but its *content* never contributes to the column's size.
       *  Only the divider moves it. */}
      <FlexRow
        fullWidth
        css={middleAreaStyles(theme)}
        sx={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}
      >
        <PreviewRegion
          isLoading={isLoading}
          sequenceUnavailable={sequenceUnavailable}
          onRetryFetch={sequenceUnavailable ? handleRetrySequence : undefined}
          onCreateNewSequence={
            sequenceUnavailable ? handleCreateNewSequence : undefined
          }
          createSequencePending={createTimeline.isPending}
          createSequenceErrorMessage={createErrorMessage}
          fullWidth
        />
      </FlexRow>

      {/* ── Horizontal drag handle (pointer + keyboard resizable) ─── */}
      {!pianoRollFullScreen && (
        <ResizeHandle
          orientation="horizontal"
          invert
          value={effectiveTracksHeight}
          min={MIN_TRACKS_HEIGHT_PX}
          max={maxTracksHeight}
          thickness={SPACING.xxl}
          grip
          keyboardStep={KEYBOARD_RESIZE_STEP_PX}
          ariaLabel={t("i18n-next25.timeline.resizeTracksPanel")}
          onResize={handleTracksResize}
          onResizeStart={handleTracksResizeStart}
          onResizeEnd={handleTracksResizeEnd}
          onDoubleClick={handleResetTracksHeight}
        />
      )}

      {/* ── Tracks ────────────────────────────────────────────────── */}
      {/* A phone has no room to stack a clip editor under the tracks, so the
       *  piano roll replaces them and carries a Back control of its own. */}
      {!pianoRollFullScreen && (
        <TracksRegion
          heightPx={effectiveTracksHeight}
          onGenerate={sequenceUnavailable ? undefined : openGenerate}
        />
      )}

      {/* ── Clip editor (piano roll) ──────────────────────────────── */}
      <PianoRollPanel fullHeight={pianoRollFullScreen} />
      </>
      )}
      </FlexColumn>
      </FlexRow>
      ) : (
      /* ── Desktop: the dock ─────────────────────────────────────── */
      <FlexColumn
        ref={dockRoot}
        fullWidth
        sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
        onPointerDownCapture={(event) => {
          // Maximize acts on the group last clicked when focus is elsewhere.
          const group =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>("[data-dock-group]")
              : null;
          if (group?.dataset.dockGroup) lastDockGroup.current = group.dataset.dockGroup;
        }}
      >
        <DockCanvas
          presentation={dockPresentation}
          store={dockStore}
          maximizeRef={dockMaximize}
          eagerPanels={EAGER_DOCK_PANELS}
          extraBottom={extraBottom}
        />
      </FlexColumn>
      )}

      {/* ── Bottom status bar ─────────────────────────────────────── */}
      <TimelineStatusBar
        actionSlot={
          isMobile ? (
            <ToolbarIconButton
              onClick={openPanelSheet}
              tooltip={t("i18n-next25.timeline.panels")}
              aria-label={t("i18n-next25.timeline.openPanels")}
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

      {/* ── Storyboards the cut's shot clips come from ─────────────── */}
      <TimelineLinkedBoards />

      {/* ── Generate dialog ───────────────────────────────────────── */}
      <TimelineGenerateDialog open={generateOpen} onClose={closeGenerate} />

      {/* ── Unsaved Code tab confirm ──────────────────────────────── */}
      {codeTabConfirmDialog}

      {/* ── Project settings dialog (canvas size + fps) ───────────── */}
      <ProjectSettingsDialog
        open={settingsOpen}
        onClose={handleCloseSettings}
      />
      <AdaptFormatDialog
        open={adaptFormatOpen}
        onClose={handleCloseAdaptFormat}
        sequence={sequence}
        mediaTracks={mediaTracks}
      />

      {/* ── Export format choice ──────────────────────────────────── */}
      <ExportVideoDialog
        open={exportChoiceOpen}
        onClose={handleCloseExportChoice}
        onExport={handleStartExport}
      />

      {/* ── Export progress / error dialog ────────────────────────── */}
      <Dialog
        open={isExporting || hasExportError}
        onClose={isExporting ? undefined : clearExportError}
        title={hasExportError ? t("i18n-next25.timeline.export.failed") : t("i18n-next25.timeline.export.exportingVideo")}
        actions={exportDialogActions}
      >
        {exportError != null ? (
          <FlexColumn gap={SPACING.md}>
            <AlertBanner severity="error">{exportError}</AlertBanner>
            <ReportBugButton
              context={{
                source: "operation-failure",
                summary: t("i18n-next25.timeline.export.timelineFailed"),
                errorText: exportError
              }}
            />
          </FlexColumn>
        ) : (
          <FlexColumn gap={SPACING.xs}>
            <ProgressBar
              value={Math.round((exportProgress?.ratio ?? 0) * 100)}
              progressVariant={
                exportProgress && exportProgress.totalFrames > 0
                  ? "determinate"
                  : "indeterminate"
              }
              label={exportPhaseLabel(exportProgress, t)}
            />
          </FlexColumn>
        )}
      </Dialog>

    </FlexColumn>
    </TimelineDockContext.Provider>
    </FieldDensityContext.Provider>
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
    <TimelineEditorBody {...bodyProps} active={active} />
  </TimelineProvider>
);

TimelineEditor.displayName = "TimelineEditor";

export default TimelineEditor;
