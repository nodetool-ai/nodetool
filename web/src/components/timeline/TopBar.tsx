/** @jsxImportSource @emotion/react */
/** Timeline document actions rendered in the workspace tab row. */

import React, { memo, useCallback, useRef, useState } from "react";

import {
  EditorMenu,
  FlexRow,
  MenuItemPrimitive,
  SPACING,
  ToolbarIconButton
} from "../ui_primitives";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SaveIcon from "@mui/icons-material/Save";
import TuneIcon from "@mui/icons-material/Tune";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";

interface TopBarProps {
  onExportVideo?: () => void;
  isExporting?: boolean;
  onExportBundle?: () => void;
  isExportingBundle?: boolean;
  onSave?: () => void;
  isSaving?: boolean;
  onSaveToAssets?: (anchorEl: HTMLElement) => void;
  onOpenSettings?: () => void;
  activitySlot?: React.ReactNode;
}

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
    activitySlot
  }) => {
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
      !!onOpenSettings || !!onSaveToAssets || !!onExportBundle;

    return (
      <FlexRow align="center" gap={SPACING.micro}>
        {activitySlot}
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
              {onSaveToAssets && (
                <MenuItemPrimitive
                  icon={<VideoLibraryOutlinedIcon fontSize="small" />}
                  label="Save as Asset"
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
