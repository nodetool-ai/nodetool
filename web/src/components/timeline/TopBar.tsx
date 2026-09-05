/** @jsxImportSource @emotion/react */
/**
 * TopBar — Timeline Editor top bar.
 *
 * A single generation prompt bar (model + output settings + Generate) that
 * grows to fill, with Save / Export and an activity slot on the right. The
 * project name lives in the workspace tab, so it isn't repeated here.
 *
 * On phones the four labelled actions won't fit beside the prompt, so they
 * collapse into one overflow menu and the prompt takes the width it needs
 * (see `TopBarPrompt`'s `compact` layout).
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
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SaveIcon from "@mui/icons-material/Save";
import TuneIcon from "@mui/icons-material/Tune";
import VideoLibraryOutlinedIcon from "@mui/icons-material/VideoLibraryOutlined";

import { TopBarPrompt } from "./TopBarPrompt";
import { useTimelineIsMobile } from "../../hooks/timeline/useTimelineIsMobile";

const styles = (theme: Theme, compact: boolean) =>
  css({
    // Phones need two rows for the prompt + chip rail; let the bar size to it.
    height: compact ? "auto" : 48,
    minHeight: compact ? 48 : undefined,
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
      // The prompt's model/settings rail and the four labelled actions need
      // roughly 1,200px together. Collapse the actions before flexbox starts
      // shrinking controls into one another, so this remains safe when a
      // sidebar reduces the editor to an intermediate width.
      const update = () => {
        if (element.clientWidth === 0) return;
        setIsNarrow(element.clientWidth < 1200);
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
        !!onOpenSettings || !!onSave || !!onSaveToAssets || !!onExportVideo;
      return (
        <FlexRow
          ref={barRef}
          align="flex-start"
          gap={SPACING.sm}
          fullWidth
          css={styles(theme, true)}
        >
          <TopBarPrompt compact />
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
        gap={SPACING.xs}
        fullWidth
        css={styles(theme, false)}
      >
        {/* Quick-prompt generation bar — grows to fill */}
        <TopBarPrompt />

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
            variant="outlined"
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
            variant="outlined"
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
            variant="outlined"
            onClick={onExportVideo}
            disabled={isExporting}
            startIcon={<FileDownloadIcon />}
            size="small"
          >
            {isExporting ? "Exporting…" : "Export"}
          </EditorButton>
        )}
      </FlexRow>
    );
  }
);

TopBar.displayName = "TopBar";

export default TopBar;
