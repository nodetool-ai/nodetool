/** The timeline's document bar: the first row of the timeline surface. */

import React, { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";

import {
  DocumentBar,
  EditorButton,
  EditorMenu,
  MenuItemPrimitive,
  SaveStatus,
  ToolbarIconButton,
  UndoRedoButtons
} from "../ui_primitives";
import type { SaveStatusValue } from "../ui_primitives";
import CodeIcon from "@mui/icons-material/Code";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
import MovieCreationOutlinedIcon from "@mui/icons-material/MovieCreationOutlined";
import TuneIcon from "@mui/icons-material/Tune";
import AspectRatioOutlinedIcon from "@mui/icons-material/AspectRatioOutlined";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";
import SubjectIcon from "@mui/icons-material/Subject";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import { useDocumentDraftStore } from "../../stores/DocumentDraftStore";
import { useTimelineStoreApi } from "../../stores/timeline/TimelineStore";
import type { WorkspaceTab } from "../../stores/WorkspaceTabsStore";
import WorkspaceDocumentBar from "../workspace/WorkspaceDocumentBar";

export interface TimelineDocumentBarProps {
  /** The workspace tab. Without one (the Studio page) the bar shows `title`. */
  tab?: WorkspaceTab;
  title: string;
  /** The open sequence. Its autosave state drives `SaveStatus`. */
  sequenceId?: string;
  isSaving?: boolean;
  /** Undo and Redo of the timeline document. Off while it is unavailable. */
  showHistory?: boolean;
  /** The Workspace menu (video or DAW, then the layouts). Omit on phones. */
  workspaceMenu?: React.ReactNode;
  /**
   * Video or DAW. Without a Workspace menu (phones) the choice sits in the
   * ⋮ menu instead.
   */
  dawMode?: boolean;
  onSetDawMode?: (dawMode: boolean) => void;
  /** Shows or hides the transcript. Omit when the timeline has no script. */
  onToggleTranscript?: () => void;
  transcriptVisible?: boolean;
  /** Shows or hides the right panel. Omit where there is none (phones). */
  onToggleSidePanel?: () => void;
  sidePanelVisible?: boolean;
  onExportVideo?: () => void;
  isExporting?: boolean;
  onOpenSettings?: () => void;
  onAdaptFormat?: () => void;
  onSaveToAssets?: (anchorEl: HTMLElement) => void;
  onExportBundle?: () => void;
  isExportingBundle?: boolean;
  /** Downloads a Premiere Pro XML with its media. */
  onExportPremiere?: () => void;
  isExportingPremiere?: boolean;
  /** Downloads every media file the clips use. */
  onExportMedia?: () => void;
  isExportingMedia?: boolean;
  /** Opens the Code panel. Shown only when `hasCode`. */
  onOpenCode?: () => void;
  hasCode?: boolean;
}

/** Autosave state of one sequence in the shared save vocabulary. */
const useTimelineSaveStatus = (
  sequenceId: string | undefined,
  isSaving: boolean
): SaveStatusValue | null => {
  const key = sequenceId ? `timeline:${sequenceId}` : null;
  const autosaving = useDocumentDraftStore((s) =>
    key ? Boolean(s.savingTabs[key]) : false
  );
  const dirty = useDocumentDraftStore((s) =>
    key ? Boolean(s.dirtyTabs[key]) : false
  );
  if (!key) return null;
  if (isSaving || autosaving) return "saving";
  return dirty ? "dirty" : "saved";
};

/** Undo and Redo on the timeline document's history. */
const TimelineHistory = memo(function TimelineHistory() {
  const docStore = useTimelineStoreApi();
  const canUndo = useStore(docStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(docStore.temporal, (s) => s.futureStates.length > 0);
  const undo = useCallback(() => docStore.temporal.getState().undo(), [docStore]);
  const redo = useCallback(() => docStore.temporal.getState().redo(), [docStore]);
  return (
    <UndoRedoButtons
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={undo}
      onRedo={redo}
    />
  );
});

export const TimelineDocumentBar: React.FC<TimelineDocumentBarProps> = memo(
  ({
    tab,
    title,
    sequenceId,
    isSaving = false,
    showHistory = true,
    workspaceMenu,
    dawMode = false,
    onSetDawMode,
    onToggleTranscript,
    transcriptVisible = true,
    onToggleSidePanel,
    sidePanelVisible = true,
    onExportVideo,
    isExporting = false,
    onOpenSettings,
    onAdaptFormat,
    onSaveToAssets,
    onExportBundle,
    isExportingBundle = false,
    onExportPremiere,
    isExportingPremiere = false,
    onExportMedia,
    isExportingMedia = false,
    onOpenCode,
    hasCode = false
  }) => {
    const { t } = useTranslation();
    const saveStatus = useTimelineSaveStatus(sequenceId, isSaving);
    const overflowButtonRef = useRef<HTMLButtonElement>(null);
    const [overflowAnchor, setOverflowAnchor] = useState<HTMLElement | null>(
      null
    );
    const closeOverflow = useCallback(() => setOverflowAnchor(null), []);
    const runFromMenu = useCallback(
      (action: () => void) => () => {
        closeOverflow();
        action();
      },
      [closeOverflow]
    );
    const showCode = hasCode && !!onOpenCode;
    const dawInMenu = !workspaceMenu && !!onSetDawMode;
    const hasOverflowActions =
      dawInMenu ||
      !!onOpenSettings ||
      !!onAdaptFormat ||
      !!onSaveToAssets ||
      !!onExportBundle ||
      !!onExportPremiere ||
      !!onExportMedia ||
      showCode;

    const view =
      workspaceMenu || onToggleTranscript || onToggleSidePanel ? (
        <>
          {workspaceMenu}
          {onToggleTranscript && (
            <ToolbarIconButton
              onClick={onToggleTranscript}
              tooltip={transcriptVisible ? t("i18n-next6.topBar.hideTranscript") : t("i18n-next6.topBar.showTranscript")}
              active={transcriptVisible}
            >
              <SubjectIcon />
            </ToolbarIconButton>
          )}
          {onToggleSidePanel && (
            <ToolbarIconButton
              onClick={onToggleSidePanel}
              tooltip={sidePanelVisible ? t("i18n-next6.topBar.hideSidePanel") : t("i18n-next6.topBar.showSidePanel")}
              active={sidePanelVisible}
            >
              <ViewSidebarOutlinedIcon />
            </ToolbarIconButton>
          )}
        </>
      ) : undefined;

    const actions =
      onExportVideo || hasOverflowActions ? (
        <>
          {onExportVideo && (
            <EditorButton
              variant="contained"
              density="normal"
              startIcon={<FileDownloadIcon />}
              loading={isExporting}
              onClick={onExportVideo}
            >
              {isExporting ? t("i18n-next6.topBar.exporting") : t("i18n-next6.topBar.export")}
            </EditorButton>
          )}
          {hasOverflowActions && (
            <>
              <ToolbarIconButton
                ref={overflowButtonRef}
                onClick={(event) => setOverflowAnchor(event.currentTarget)}
                tooltip={t("i18n-next6.topBar.moreTimelineActions")}
                aria-haspopup="menu"
                aria-expanded={!!overflowAnchor}
              >
                <MoreVertIcon />
              </ToolbarIconButton>
              <EditorMenu
                anchorEl={overflowAnchor}
                open={!!overflowAnchor}
                onClose={closeOverflow}
              >
                {/* A menu takes no Fragment children. */}
                {dawInMenu && onSetDawMode && [
                  <MenuItemPrimitive
                    key="video"
                    label={t("i18n-next6.topBar.videoEditing")}
                    checkable="radio"
                    checked={!dawMode}
                    onClick={runFromMenu(() => onSetDawMode(false))}
                  />,
                  <MenuItemPrimitive
                    key="daw"
                    label={t("i18n-next6.topBar.audioDaw")}
                    checkable="radio"
                    checked={dawMode}
                    dividerAfter
                    onClick={runFromMenu(() => onSetDawMode(true))}
                  />
                ]}
                {onOpenSettings && (
                  <MenuItemPrimitive
                    icon={<TuneIcon fontSize="small" />}
                    label={t("i18n-next6.topBar.projectSettings")}
                    onClick={runFromMenu(onOpenSettings)}
                  />
                )}
                {onAdaptFormat && (
                  <MenuItemPrimitive
                    icon={<AspectRatioOutlinedIcon fontSize="small" />}
                    label={t("i18n-next6.topBar.adaptFormat")}
                    onClick={runFromMenu(onAdaptFormat)}
                  />
                )}
                {onSaveToAssets && (
                  <MenuItemPrimitive
                    icon={<VideoLibraryOutlinedIcon fontSize="small" />}
                    label={t("i18n-next6.topBar.saveAsAsset")}
                    disabled={isExporting}
                    onClick={runFromMenu(() => {
                      const anchor = overflowButtonRef.current;
                      if (anchor) onSaveToAssets(anchor);
                    })}
                  />
                )}
                {onExportBundle && (
                  <MenuItemPrimitive
                    icon={<FolderZipOutlinedIcon fontSize="small" />}
                    label={
                      isExportingBundle ? t("i18n-next6.topBar.exporting") : t("i18n-next6.topBar.exportProjectZip")
                    }
                    disabled={isExportingBundle}
                    onClick={runFromMenu(onExportBundle)}
                  />
                )}
                {onExportPremiere && (
                  <MenuItemPrimitive
                    icon={<MovieCreationOutlinedIcon fontSize="small" />}
                    label={
                      isExportingPremiere
                        ? t("i18n-next6.topBar.exportingForPremiere")
                        : t("i18n-next6.topBar.exportForPremiere")
                    }
                    disabled={isExportingPremiere}
                    onClick={runFromMenu(onExportPremiere)}
                  />
                )}
                {onExportMedia && (
                  <MenuItemPrimitive
                    icon={<PermMediaOutlinedIcon fontSize="small" />}
                    label={
                      isExportingMedia ? t("i18n-next6.topBar.exportingMedia") : t("i18n-next6.topBar.exportMediaZip")
                    }
                    disabled={isExportingMedia}
                    onClick={runFromMenu(onExportMedia)}
                  />
                )}
                {showCode && onOpenCode && (
                  <MenuItemPrimitive
                    dividerBefore
                    icon={<CodeIcon fontSize="small" />}
                    label={t("i18n-next6.topBar.code")}
                    onClick={runFromMenu(onOpenCode)}
                  />
                )}
              </EditorMenu>
            </>
          )}
        </>
      ) : undefined;

    const slots = {
      status: saveStatus ? <SaveStatus state={saveStatus} /> : undefined,
      history: showHistory ? <TimelineHistory /> : undefined,
      view,
      actions
    };

    return tab ? (
      <WorkspaceDocumentBar tab={tab} {...slots} />
    ) : (
      <DocumentBar title={title} {...slots} />
    );
  }
);

TimelineDocumentBar.displayName = "TimelineDocumentBar";

export default TimelineDocumentBar;
