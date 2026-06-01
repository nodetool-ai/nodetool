/** @jsxImportSource @emotion/react */
/**
 * TopBar — Timeline Editor top bar.
 *
 * Contains: project name, save status, Project / Library / Exports buttons,
 * export action, and an activity indicator slot.
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  FlexRow,
  Text,
  Caption,
  EditorButton
} from "../ui_primitives";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import SaveIcon from "@mui/icons-material/Save";

import { TopBarPrompt } from "./TopBarPrompt";

const styles = (theme: Theme) =>
  css({
    height: 48,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper,
    padding: `0 ${theme.spacing(1.5)}`,
    flexShrink: 0,
    ".project-name": {
      cursor: "pointer",
      borderRadius: theme.rounded.sm,
      padding: `${theme.spacing(0.5)} ${theme.spacing(0.5)}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".save-status": {
      color: theme.vars.palette.text.disabled
    },
    ".section-divider": {
      width: 1,
      height: 20,
      backgroundColor: theme.vars.palette.divider,
      margin: `0 ${theme.spacing(0.5)}`
    }
  });

export interface TopBarProps {
  /** Name of the current sequence / project */
  sequenceName?: string;
  /** Human-readable save status (e.g. "Saved", "Saving…") */
  saveStatus?: string;
  /** Called when the user clicks the project name dropdown */
  onProjectNameClick?: () => void;
  /** Called when the user clicks Export (renders the timeline to a video file) */
  onExportVideo?: () => void;
  /** True while an export render is in progress. */
  isExporting?: boolean;
  /** Called when the user clicks Save (force-persists the current document) */
  onSave?: () => void;
  /** True while a manual save is in flight. */
  isSaving?: boolean;
  /** Optional slot for an activity indicator (NOD-311) */
  activitySlot?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = memo(
  ({
    sequenceName = "Untitled Sequence",
    saveStatus,
    onProjectNameClick,
    onExportVideo,
    isExporting = false,
    onSave,
    isSaving = false,
    activitySlot
  }) => {
    const theme = useTheme();

    return (
      <FlexRow
        align="center"
        justify="space-between"
        fullWidth
        css={styles(theme)}
      >
        {/* Left: project name + save status */}
        <FlexRow gap={1} align="center">
          <FlexRow
            align="center"
            gap={0.25}
            className="project-name"
            onClick={onProjectNameClick}
            role="button"
            tabIndex={0}
            aria-haspopup="menu"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onProjectNameClick?.();
            }}
          >
            <Text size="small" weight={500}>
              {sequenceName}
            </Text>
            <ArrowDropDownIcon
              sx={{ fontSize: 16, color: theme.vars.palette.text.secondary }}
            />
          </FlexRow>

          {saveStatus && (
            <Caption className="save-status">{saveStatus}</Caption>
          )}
        </FlexRow>

        {/* Center: quick-prompt generation bar */}
        <TopBarPrompt />

        {/* Right: activity slot + export */}
        <FlexRow gap={1} align="center">
          {/* Activity indicator slot — filled by NOD-311 */}
          {activitySlot}

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
      </FlexRow>
    );
  }
);

TopBar.displayName = "TopBar";

export default TopBar;
