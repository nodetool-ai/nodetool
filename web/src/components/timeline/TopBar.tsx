/** @jsxImportSource @emotion/react */
/** Timeline document actions rendered in the workspace tab row. */

import React, { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Caption,
  EditorMenu,
  MenuItemPrimitive,
  SPACING,
  ToggleGroup,
  ToggleOption,
  ToolbarGroup,
  ToolbarIconButton,
  Tooltip
} from "../ui_primitives";
import CodeIcon from "@mui/icons-material/Code";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PermMediaOutlinedIcon from "@mui/icons-material/PermMediaOutlined";
import MovieCreationOutlinedIcon from "@mui/icons-material/MovieCreationOutlined";
import SaveIcon from "@mui/icons-material/Save";
import TuneIcon from "@mui/icons-material/Tune";
import AspectRatioOutlinedIcon from "@mui/icons-material/AspectRatioOutlined";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";
import SubjectIcon from "@mui/icons-material/Subject";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import { useDocumentDraftStore } from "../../stores/DocumentDraftStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { formatActionShortcut } from "./timelineKeymap";

interface TopBarProps {
  onExportVideo?: () => void;
  isExporting?: boolean;
  onExportBundle?: () => void;
  isExportingBundle?: boolean;
  /** Downloads a Premiere Pro XML with its media. */
  onExportPremiere?: () => void;
  isExportingPremiere?: boolean;
  /** Downloads every media file the clips use. */
  onExportMedia?: () => void;
  isExportingMedia?: boolean;
  onSave?: () => void;
  isSaving?: boolean;
  onSaveToAssets?: (anchorEl: HTMLElement) => void;
  onOpenSettings?: () => void;
  onAdaptFormat?: () => void;
  activitySlot?: React.ReactNode;
  /** Opens the timeline's Code panel. Omit (or leave `hasCode` false) when
   *  the timeline has no embedded authoring code. */
  onOpenCode?: () => void;
  hasCode?: boolean;
  /** The open sequence. Its autosave state (DocumentDraftStore) drives the
   *  Saved / Saving… / Unsaved changes caption beside Save. */
  sequenceId?: string;
  /** Shows or hides the transcript. Omit when the timeline has no script. */
  onToggleTranscript?: () => void;
  transcriptVisible?: boolean;
  /** Shows or hides the right panel. Omit where there is none (phones). */
  onToggleSidePanel?: () => void;
  sidePanelVisible?: boolean;
  /** The workspace menu. Omit where there is no dock (phones). */
  layoutMenu?: React.ReactNode;
  /** Switches between the video layout and DAW mode. Omit to hide the switch. */
  onSetDawMode?: (dawMode: boolean) => void;
  dawMode?: boolean;
}

/** Autosave state of one sequence, as the caption beside Save reads it. */
const useSaveStateLabel = (
  sequenceId: string | undefined,
  isSaving: boolean,
  t: (key: string) => string
): string | null => {
  const key = sequenceId ? `timeline:${sequenceId}` : null;
  const autosaving = useDocumentDraftStore((s) =>
    key ? Boolean(s.savingTabs[key]) : false
  );
  const dirty = useDocumentDraftStore((s) =>
    key ? Boolean(s.dirtyTabs[key]) : false
  );
  if (!key) return null;
  if (isSaving || autosaving) return t("i18n-next6.topBar.saving");
  return dirty ? t("i18n-next6.topBar.unsavedChanges") : t("i18n-next6.topBar.saved");
};

export const TopBar: React.FC<TopBarProps> = memo(
  ({
    onExportVideo,
    isExporting = false,
    onExportBundle,
    isExportingBundle = false,
    onExportPremiere,
    isExportingPremiere = false,
    onExportMedia,
    isExportingMedia = false,
    onSave,
    isSaving = false,
    onSaveToAssets,
    onOpenSettings,
    onAdaptFormat,
    activitySlot,
    onOpenCode,
    hasCode = false,
    sequenceId,
    onToggleTranscript,
    transcriptVisible = true,
    onToggleSidePanel,
    sidePanelVisible = true,
    layoutMenu,
    onSetDawMode,
    dawMode = false
  }) => {
    const { t } = useTranslation();
    const keyboardPreset = useSettingsStore(
      (s) => s.settings.timelineKeyboardPreset
    );
    const dawShortcut = formatActionShortcut(keyboardPreset, "toggleDawMode");
    const saveStateLabel = useSaveStateLabel(sequenceId, isSaving, t);
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
    const hasOverflowActions =
      !!onOpenSettings ||
      !!onAdaptFormat ||
      !!onSaveToAssets ||
      !!onExportBundle ||
      !!onExportPremiere ||
      !!onExportMedia;

    return (
      <ToolbarGroup sx={{ gap: SPACING.xs }}>
        {activitySlot}
        {onSetDawMode && (
          <Tooltip
            title={t("i18n-next6.topBar.layoutTooltip", { shortcut: dawShortcut ? ` (${dawShortcut})` : "" })}
          >
            <ToggleGroup
              value={dawMode ? "daw" : "video"}
              exclusive
              compact
              onChange={(_event, value: string | null) => {
                if (value === "daw" || value === "video") onSetDawMode(value === "daw");
              }}
              aria-label={t("i18n-next6.topBar.editorLayout")}
            >
              <ToggleOption value="video" aria-label={t("i18n-next6.topBar.videoLayout")}>
                {t("i18n-next6.topBar.video")}
              </ToggleOption>
              <ToggleOption value="daw" aria-label={t("i18n-next6.topBar.dawMode")}>
                {t("i18n-next6.topBar.daw")}
              </ToggleOption>
            </ToggleGroup>
          </Tooltip>
        )}
        {layoutMenu}
        {onToggleTranscript && (
          <ToolbarIconButton
            onClick={onToggleTranscript}
            tooltip={transcriptVisible ? t("i18n-next6.topBar.hideTranscript") : t("i18n-next6.topBar.showTranscript")}
            aria-label={transcriptVisible ? t("i18n-next6.topBar.hideTranscript") : t("i18n-next6.topBar.showTranscript")}
            aria-pressed={transcriptVisible}
            sx={{ color: transcriptVisible ? "primary.main" : undefined }}
          >
            <SubjectIcon fontSize="small" />
          </ToolbarIconButton>
        )}
        {onToggleSidePanel && (
          <ToolbarIconButton
            onClick={onToggleSidePanel}
            tooltip={sidePanelVisible ? t("i18n-next6.topBar.hideSidePanel") : t("i18n-next6.topBar.showSidePanel")}
            aria-label={sidePanelVisible ? t("i18n-next6.topBar.hideSidePanel") : t("i18n-next6.topBar.showSidePanel")}
            aria-pressed={sidePanelVisible}
            sx={{ color: sidePanelVisible ? "primary.main" : undefined }}
          >
            <ViewSidebarOutlinedIcon fontSize="small" />
          </ToolbarIconButton>
        )}
        {hasCode && onOpenCode && (
          <ToolbarIconButton
            onClick={onOpenCode}
            tooltip={t("i18n-next6.topBar.code")}
            aria-label={t("i18n-next6.topBar.openTimelineCode")}
          >
            <CodeIcon fontSize="small" />
          </ToolbarIconButton>
        )}
        {onSave && saveStateLabel && (
          <Caption
            color="secondary"
            role="status"
            aria-live="polite"
            sx={{ whiteSpace: "nowrap", px: SPACING.xs }}
          >
            {saveStateLabel}
          </Caption>
        )}
        {onSave && (
          <ToolbarIconButton
            onClick={onSave}
            loading={isSaving}
            tooltip={isSaving ? t("i18n-next6.topBar.saving") : t("i18n-next6.common.save")}
            aria-label={isSaving ? t("i18n-next6.topBar.saving") : t("i18n-next6.common.save")}
          >
            <SaveIcon fontSize="small" />
          </ToolbarIconButton>
        )}
        {onExportVideo && (
          <ToolbarIconButton
            onClick={onExportVideo}
            loading={isExporting}
            tooltip={isExporting ? t("i18n-next6.topBar.exporting") : t("i18n-next6.topBar.exportVideo")}
            aria-label={isExporting ? t("i18n-next6.topBar.exporting") : t("i18n-next6.topBar.exportVideo")}
          >
            <FileDownloadIcon fontSize="small" />
          </ToolbarIconButton>
        )}
        {hasOverflowActions && (
          <>
            <ToolbarIconButton
              ref={overflowButtonRef}
              onClick={(event) => setOverflowAnchor(event.currentTarget)}
              tooltip={t("i18n-next6.topBar.moreTimelineActions")}
              aria-label={t("i18n-next6.topBar.moreTimelineActions")}
              aria-haspopup="menu"
              aria-expanded={!!overflowAnchor}
            >
              <MoreVertIcon fontSize="small" />
            </ToolbarIconButton>
            <EditorMenu
              anchorEl={overflowAnchor}
              open={!!overflowAnchor}
              onClose={closeOverflow}
            >
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
            </EditorMenu>
          </>
        )}
      </ToolbarGroup>
    );
  }
);

TopBar.displayName = "TopBar";

export default TopBar;
