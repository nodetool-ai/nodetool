/** @jsxImportSource @emotion/react */
/**
 * TopBar — Timeline Editor top bar.
 *
 * Contains: project name, save status, Project / Library / Exports buttons,
 * Render All primary action, and an activity indicator slot (filled later by
 * NOD-311).
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  FlexRow,
  Text,
  Caption,
  ToolbarIconButton,
  EditorButton
} from "../ui_primitives";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

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
      padding: `${theme.spacing(0.25)} ${theme.spacing(0.5)}`,
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
  /** Called when the user clicks the Project button */
  onProjectClick?: () => void;
  /** Called when the user clicks the Library button */
  onLibraryClick?: () => void;
  /** Called when the user clicks the Exports button */
  onExportsClick?: () => void;
  /** Called when the user clicks Render All */
  onRenderAll?: () => void;
  /** Optional slot for an activity indicator (NOD-311) */
  activitySlot?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = memo(
  ({
    sequenceName = "Untitled Sequence",
    saveStatus,
    onProjectNameClick,
    onProjectClick,
    onLibraryClick,
    onExportsClick,
    onRenderAll,
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
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onProjectNameClick?.();
            }}
          >
            <Text size="small" weight={500}>
              {sequenceName}
            </Text>
            <ArrowDropDownIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </FlexRow>

          {saveStatus && (
            <Caption className="save-status">{saveStatus}</Caption>
          )}
        </FlexRow>

        {/* Center: Project / Library / Exports nav buttons */}
        <FlexRow gap={0.5} align="center">
          <ToolbarIconButton
            icon={<FolderOpenIcon />}
            tooltip="Project"
            onClick={onProjectClick}
            aria-label="Project"
          />
          <ToolbarIconButton
            icon={<LibraryMusicIcon />}
            tooltip="Library"
            onClick={onLibraryClick}
            aria-label="Library"
          />
          <ToolbarIconButton
            icon={<FileDownloadIcon />}
            tooltip="Exports"
            onClick={onExportsClick}
            aria-label="Exports"
          />
        </FlexRow>

        {/* Right: activity slot + Render All */}
        <FlexRow gap={1} align="center">
          {/* Activity indicator slot — filled by NOD-311 */}
          {activitySlot}

          <EditorButton
            variant="contained"
            onClick={onRenderAll}
            startIcon={<PlayArrowIcon />}
            size="small"
            aria-label="Render All"
          >
            Render All
          </EditorButton>
        </FlexRow>
      </FlexRow>
    );
  }
);

TopBar.displayName = "TopBar";

export default TopBar;
