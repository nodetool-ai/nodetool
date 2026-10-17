/** @jsxImportSource @emotion/react */
/**
 * AddTrackButton
 *
 * Compact "+ Track" affordance in the timeline toolbar. Opens a popover with
 * the track types (video / audio / overlay / subtitle / MIDI / chord);
 * selecting one calls `TimelineStore.addTrack(type)`, which appends a new
 * track with an auto-generated name.
 */

import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/AddOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined";
import PianoOutlinedIcon from "@mui/icons-material/PianoOutlined";
import QueueMusicOutlinedIcon from "@mui/icons-material/QueueMusicOutlined";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";

import type { TimelineTrack } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  ContextMenu,
  MenuItemPrimitive,
  MOTION,
  BORDER_RADIUS,
  CONTROL,
  FONT_SIZE_SANS,
  FONT_WEIGHT,
  SPACING,
  getSpacingPx,
  Tooltip
} from "../../ui_primitives";

const buttonStyles = (theme: Theme, compact: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: getSpacingPx(SPACING.sm),
    height: compact ? CONTROL.height.sm : CONTROL.height.xs,
    minWidth: compact ? CONTROL.height.sm : undefined,
    padding: compact ? 0 : theme.spacing(0, 3, 0, 2),
    background: "transparent",
    border: "1px solid transparent",
    color: theme.vars.palette.text.secondary,
    cursor: "pointer",
    fontSize: FONT_SIZE_SANS.label,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: "0.01em",
    fontFamily: theme.typography.fontFamily,
    borderRadius: BORDER_RADIUS.md,
    transition: `${MOTION.background}, color ${MOTION.fast}, ${MOTION.border}`,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: 2
    },
    "& svg": {
      fontSize: compact ? 18 : 14
    }
  });

interface TrackTypeOption {
  type: TimelineTrack["type"];
  label: string;
  icon: React.ReactNode;
}

const TRACK_TYPES: TrackTypeOption[] = [
  {
    type: "video",
    label: "Video",
    icon: <VideocamOutlinedIcon fontSize="small" />
  },
  {
    type: "audio",
    label: "Audio",
    icon: <AudiotrackOutlinedIcon fontSize="small" />
  },
  {
    type: "overlay",
    label: "Overlay",
    icon: <LayersOutlinedIcon fontSize="small" />
  },
  {
    type: "subtitle",
    label: "Subtitle",
    icon: <SubtitlesOutlinedIcon fontSize="small" />
  },
  {
    type: "midi",
    label: "MIDI",
    icon: <PianoOutlinedIcon fontSize="small" />
  },
  {
    type: "chord",
    label: "Chord track",
    icon: <QueueMusicOutlinedIcon fontSize="small" />
  }
];

interface AddTrackButtonProps {
  /** Phone toolbar: drop the "Track" label, keep the icon and a 28px target. */
  compact?: boolean;
}

export const AddTrackButton: React.FC<AddTrackButtonProps> = memo(({ compact = false }) => {
  const theme = useTheme();
  const addTrack = useTimelineStore((s) => s.addTrack);
  const addTrackFolder = useTimelineStore((s) => s.addTrackFolder);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handleOpen = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleSelect = useCallback(
    (type: TimelineTrack["type"]) => {
      addTrack(type);
      setAnchorEl(null);
    },
    [addTrack]
  );

  return (
    <>
      <Tooltip title="Add track" describeChild>
        <button
          type="button"
          css={buttonStyles(theme, compact)}
          onClick={handleOpen}
          aria-label="Add track"
          aria-haspopup="menu"
          data-testid="add-track-button"
        >
          <AddIcon />
          {!compact && <span>Track</span>}
        </button>
      </Tooltip>
      <ContextMenu
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {TRACK_TYPES.map((opt) => (
          <MenuItemPrimitive
            key={opt.type}
            label={opt.label}
            icon={opt.icon}
            onClick={() => handleSelect(opt.type)}
          />
        ))}
        <MenuItemPrimitive
          dividerBefore
          label="New track folder"
          icon={<CreateNewFolderOutlinedIcon fontSize="small" />}
          onClick={() => {
            addTrackFolder();
            setAnchorEl(null);
          }}
        />
      </ContextMenu>
    </>
  );
});

AddTrackButton.displayName = "AddTrackButton";
