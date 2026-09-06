/**
 * ShotHoverToolbar
 *
 * The actions that live on a shot's still and only appear under the pointer
 * (PRD § 7.4): the drag grip, fullscreen, download, duplicate, delete. One row
 * so they share a single hover surface and never fight the card's own click,
 * which selects the shot — the row swallows clicks before they reach it.
 */

import React from "react";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import FullscreenIcon from "@mui/icons-material/Fullscreen";

import {
  FlexRow,
  ToolbarIconButton,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";

interface ShotHoverToolbarProps {
  /** Shown when the card is draggable; the card itself carries the drag. */
  showDragHandle?: boolean;
  /** Opens the fullscreen viewer. Omitted when the shot has no media yet. */
  onFullscreen?: (event: React.SyntheticEvent) => void;
  /** "View clip fullscreen" or "View still fullscreen" — what is on the card. */
  fullscreenLabel?: string;
  /** Saves the still or clip. Omitted while there is nothing to save. */
  onDownload?: () => void;
  /** What the download saves, for the tooltip: "still" or "clip". */
  downloadLabel?: string;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

/** Hidden until the card is hovered or focused; always on for touch. */
const rowSx = {
  position: "absolute",
  top: SPACING.xs,
  right: SPACING.xs,
  borderRadius: BORDER_RADIUS.sm,
  bgcolor: "c_scrim_soft",
  opacity: 0,
  ".shot-card:hover &": { opacity: 1 },
  "&:focus-within": { opacity: 1 },
  // Touch devices cannot hover; keep the actions reachable.
  "@media (pointer: coarse)": { opacity: 1 }
} as const;

const iconSx = { fontSize: "1em" } as const;

/** Selecting the shot is the card's click. These are their own actions. */
const swallowClick = (event: React.MouseEvent): void => {
  event.stopPropagation();
};

export const ShotHoverToolbar: React.FC<ShotHoverToolbarProps> = ({
  showDragHandle,
  onFullscreen,
  fullscreenLabel,
  onDownload,
  downloadLabel,
  onDuplicate,
  onDelete
}) => {
  // A row with nothing in it would still catch the eye as a scrim on hover.
  const empty =
    !showDragHandle &&
    !onFullscreen &&
    !onDownload &&
    !onDuplicate &&
    !onDelete;
  if (empty) {
    return null;
  }
  return (
    <FlexRow
      align="center"
      gap={SPACING.micro}
      onClick={swallowClick}
      data-testid="shot-hover-toolbar"
      sx={rowSx}
    >
      {showDragHandle && (
        // A grip, not a control: the drag lives on the card, so a button here
        // would be a tab stop that does nothing.
        <FlexRow
          align="center"
          aria-hidden
          data-testid="shot-drag-handle"
          sx={{ cursor: "grab", color: "text.secondary" }}
        >
          <DragIndicatorIcon sx={iconSx} />
        </FlexRow>
      )}
      {onFullscreen && (
        <ToolbarIconButton
          icon={<FullscreenIcon sx={iconSx} />}
          tooltip="View fullscreen (double-click)"
          ariaLabel={fullscreenLabel}
          onClick={onFullscreen}
        />
      )}
      {onDownload && (
        <ToolbarIconButton
          icon={<DownloadIcon sx={iconSx} />}
          tooltip={`Download this ${downloadLabel ?? "still"}`}
          ariaLabel={`Download ${downloadLabel ?? "still"}`}
          onClick={onDownload}
        />
      )}
      {onDuplicate && (
        <ToolbarIconButton
          icon={<ContentCopyIcon sx={iconSx} />}
          tooltip="Duplicate this shot"
          ariaLabel="Duplicate shot"
          onClick={onDuplicate}
        />
      )}
      {onDelete && (
        <ToolbarIconButton
          icon={<DeleteOutlineIcon sx={iconSx} />}
          tooltip="Delete this shot"
          ariaLabel="Delete shot"
          onClick={onDelete}
        />
      )}
    </FlexRow>
  );
};

export default ShotHoverToolbar;
