/** @jsxImportSource @emotion/react */
/**
 * TopBar — Timeline Editor top bar.
 *
 * Project settings, Save / Export, and generation activity.
 * Actions collapse into an overflow menu on narrow layouts.
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  FlexRow,
  EditorButton,
  EditorMenu,
  MenuItemPrimitive,
  SettingsButton,
  ToolbarIconButton,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SaveIcon from "@mui/icons-material/Save";
import TuneIcon from "@mui/icons-material/Tune";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";

import { useTimelineIsMobile } from "../../hooks/timeline/useTimelineIsMobile";

const styles = (theme: Theme, compact: boolean) =>
  css({
    height: 48,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper,
    padding: compact
      ? `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`
      : `0 ${getSpacingPx(SPACING.sm)}`,
    flexShrink: 0
  });

interface TopBarProps {
  /** Called when the user clicks Export (renders the timeline to a video file) */
  onExportVideo?: () => void;
  /** True while an export render is in progress. */
  isExporting?: boolean;
  /** Called when the user downloads the whole project (document + assets) as a zip. */
  onExportBundle?: () => void;
  /** True while the project zip is being prepared. */
  isExportingBundle?: boolean;
  /** Called when the user clicks Save (force-persists the current document) */
  onSave?: () => void;
  /** True while a manual save is in flight. */
  isSaving?: boolean;
  /**
   * Called when the user clicks "Save as Asset" — receives the button element
   * to anchor the folder-chooser popover to. Renders the timeline to a video
   * and saves it as an asset in the chosen folder.
   */
  onSaveToAssets?: (anchorEl: HTMLElement) => void;
  /** Called when the user opens the project settings (canvas size + fps). */
  onOpenSettings?: () => void;
  /** Optional slot for an activity indicator (NOD-311) */
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
    const theme = useTheme();
    const isMobile = useTimelineIsMobile();
    const [isNarrow, setIsNarrow] = useState(false);
    const isCompact = isMobile || isNarrow;
    const barRef = React.useRef<HTMLDivElement>(null);
    const [overflowAnchor, setOverflowAnchor] = useState<HTMLElement | null>(
      null
    );
    const closeOverflow = useCallback(() => setOverflowAnchor(null), []);

    useEffect(() => {
      const element = barRef.current;
      if (!element) return;
      // Collapse actions when the editor has insufficient width for labels.
      const update = () => {
        if (element.clientWidth === 0) return;
        setIsNarrow(element.clientWidth < 640);
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }, []);

    // "Save as Asset" anchors a folder popover to whatever element was clicked.
    // From the overflow menu that element is the menu item, which unmounts on
    // close — so anchor the popover to the overflow button instead.
    const overflowButtonRef = React.useRef<HTMLButtonElement>(null);
    const runFromMenu = useCallback(
      (action: () => void) => () => {
        closeOverflow();
        action();
      },
      [closeOverflow]
    );

    if (isCompact) {
      const hasActions =
        !!onOpenSettings ||
        !!onSave ||
        !!onSaveToAssets ||
        !!onExportVideo ||
        !!onExportBundle;
      return (
        <FlexRow
          ref={barRef}
          align="center"
          justify="flex-end"
          gap={SPACING.sm}
          fullWidth
          css={styles(theme, true)}
        >
          {activitySlot}
          {hasActions && (
            <>
              <ToolbarIconButton
                ref={overflowButtonRef}
                onClick={(e) => setOverflowAnchor(e.currentTarget)}
                tooltip="More actions"
                aria-label="More actions"
                sx={{ flexShrink: 0 }}
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
                {onSave && (
                  <MenuItemPrimitive
                    icon={<SaveIcon fontSize="small" />}
                    label={isSaving ? "Saving…" : "Save"}
                    disabled={isSaving}
                    onClick={runFromMenu(onSave)}
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
                {onExportVideo && (
                  <MenuItemPrimitive
                    icon={<FileDownloadIcon fontSize="small" />}
                    label={isExporting ? "Exporting…" : "Export video"}
                    disabled={isExporting}
                    onClick={runFromMenu(onExportVideo)}
                  />
                )}
                {onExportBundle && (
                  <MenuItemPrimitive
                    icon={<FolderZipOutlinedIcon fontSize="small" />}
                    label={
                      isExportingBundle
                        ? "Exporting…"
                        : "Export project (.zip)"
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

    return (
      <FlexRow
        ref={barRef}
        align="center"
        justify="flex-end"
        gap={SPACING.xs}
        fullWidth
        css={styles(theme, false)}
      >
        {/* Right: activity slot + settings / save / export */}
        {activitySlot}

        {onOpenSettings && (
          <SettingsButton
            onClick={onOpenSettings}
            tooltip="Project settings"
            iconVariant="tune"
          />
        )}

        {onSave && (
          <EditorButton
            variant="text"
            onClick={onSave}
            disabled={isSaving}
            startIcon={<SaveIcon />}
            size="small"
          >
            {isSaving ? "Saving…" : "Save"}
          </EditorButton>
        )}

        {onSaveToAssets && (
          <EditorButton
            variant="text"
            onClick={(e) => onSaveToAssets(e.currentTarget)}
            disabled={isExporting}
            startIcon={<VideoLibraryOutlinedIcon />}
            size="small"
          >
            Save as Asset
          </EditorButton>
        )}

        {onExportVideo && (
          <EditorButton
            variant="text"
            onClick={onExportVideo}
            disabled={isExporting}
            startIcon={<FileDownloadIcon />}
            size="small"
          >
            {isExporting ? "Exporting…" : "Export"}
          </EditorButton>
        )}

        {onExportBundle && (
          <EditorButton
            variant="text"
            onClick={onExportBundle}
            disabled={isExportingBundle}
            startIcon={<FolderZipOutlinedIcon />}
            size="small"
          >
            {isExportingBundle ? "Exporting…" : "Export project (.zip)"}
          </EditorButton>
        )}
      </FlexRow>
    );
  }
);

TopBar.displayName = "TopBar";

export default TopBar;
