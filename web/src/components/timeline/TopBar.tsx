/** @jsxImportSource @emotion/react */
/** Timeline document actions rendered in the workspace tab row. */

import React, { memo, useCallback, useRef, useState } from "react";

import {
  Caption,
  EditorMenu,
  FlexRow,
  MenuItemPrimitive,
  SPACING,
  ToolbarIconButton
} from "../ui_primitives";
import CodeIcon from "@mui/icons-material/Code";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SaveIcon from "@mui/icons-material/Save";
import TuneIcon from "@mui/icons-material/Tune";
import AspectRatioOutlinedIcon from "@mui/icons-material/AspectRatioOutlined";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";
import { useDocumentDraftStore } from "../../stores/DocumentDraftStore";

interface TopBarProps {
  onExportVideo?: () => void;
  isExporting?: boolean;
  onExportBundle?: () => void;
  isExportingBundle?: boolean;
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
}

/** Autosave state of one sequence, as the caption beside Save reads it. */
const useSaveStateLabel = (
  sequenceId: string | undefined,
  isSaving: boolean
): string | null => {
  const key = sequenceId ? `timeline:${sequenceId}` : null;
  const autosaving = useDocumentDraftStore((s) =>
    key ? Boolean(s.savingTabs[key]) : false
  );
  const dirty = useDocumentDraftStore((s) =>
    key ? Boolean(s.dirtyTabs[key]) : false
  );
  if (!key) return null;
  if (isSaving || autosaving) return "Saving…";
  return dirty ? "Unsaved changes" : "Saved";
};

export const TopBar: React.FC<TopBarProps> = memo(
  ({
    onExportVideo,
    isExporting = false,
    onExportBundle,
    isExportingBundle = false,
    onSave,
    isSaving = false,
    onSaveToAssets,
    onOpenSettings,
    onAdaptFormat,
    activitySlot,
    onOpenCode,
    hasCode = false,
    sequenceId
  }) => {
    const saveStateLabel = useSaveStateLabel(sequenceId, isSaving);
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
      !!onExportBundle;

    return (
      <FlexRow align="center" gap={SPACING.micro}>
        {activitySlot}
        {hasCode && onOpenCode && (
          <ToolbarIconButton
            onClick={onOpenCode}
            tooltip="Code"
            aria-label="Open the timeline's code"
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
            disabled={isSaving}
            tooltip={isSaving ? "Saving…" : "Save"}
            aria-label={isSaving ? "Saving…" : "Save"}
          >
            <SaveIcon fontSize="small" />
          </ToolbarIconButton>
        )}
        {onExportVideo && (
          <ToolbarIconButton
            onClick={onExportVideo}
            disabled={isExporting}
            tooltip={isExporting ? "Exporting…" : "Export video"}
            aria-label={isExporting ? "Exporting…" : "Export video"}
          >
            <FileDownloadIcon fontSize="small" />
          </ToolbarIconButton>
        )}
        {hasOverflowActions && (
          <>
            <ToolbarIconButton
              ref={overflowButtonRef}
              onClick={(event) => setOverflowAnchor(event.currentTarget)}
              tooltip="More timeline actions"
              aria-label="More timeline actions"
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
                  label="Project settings"
                  onClick={runFromMenu(onOpenSettings)}
                />
              )}
              {onAdaptFormat && (
                <MenuItemPrimitive
                  icon={<AspectRatioOutlinedIcon fontSize="small" />}
                  label="Adapt format"
                  onClick={runFromMenu(onAdaptFormat)}
                />
              )}
              {onSaveToAssets && (
                <MenuItemPrimitive
                  icon={<VideoLibraryOutlinedIcon fontSize="small" />}
                  label="Save as asset"
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
                    isExportingBundle ? "Exporting…" : "Export project (.zip)"
                  }
                  disabled={isExportingBundle}
                  onClick={runFromMenu(onExportBundle)}
                />
              )}
            </EditorMenu>
          </>
        )}
      </FlexRow>
    );
  }
);

TopBar.displayName = "TopBar";

export default TopBar;
