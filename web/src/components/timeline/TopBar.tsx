/** @jsxImportSource @emotion/react */
/**
 * TopBar — Timeline Editor top bar.
 *
 * A single generation prompt bar (model + output settings + Generate) that
 * grows to fill, with Save / Export and an activity slot on the right. The
 * project name lives in the workspace tab, so it isn't repeated here.
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { FlexRow, EditorButton } from "../ui_primitives";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import SaveIcon from "@mui/icons-material/Save";
import TuneIcon from "@mui/icons-material/Tune";

import { TopBarPrompt } from "./TopBarPrompt";

const styles = (theme: Theme) =>
  css({
    height: 48,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper,
    padding: `0 ${theme.spacing(1.5)}`,
    flexShrink: 0
  });

export interface TopBarProps {
  /** Called when the user clicks Export (renders the timeline to a video file) */
  onExportVideo?: () => void;
  /** True while an export render is in progress. */
  isExporting?: boolean;
  /** Called when the user clicks Save (force-persists the current document) */
  onSave?: () => void;
  /** True while a manual save is in flight. */
  isSaving?: boolean;
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
    onOpenSettings,
    activitySlot
  }) => {
    const theme = useTheme();

    return (
      <FlexRow align="center" gap={1} fullWidth css={styles(theme)}>
        {/* Quick-prompt generation bar — grows to fill */}
        <TopBarPrompt />

        {/* Right: activity slot + settings / save / export */}
        {activitySlot}

        {onOpenSettings && (
          <EditorButton
            variant="outlined"
            onClick={onOpenSettings}
            startIcon={<TuneIcon />}
            size="small"
            aria-label="Project settings"
          >
            Settings
          </EditorButton>
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
