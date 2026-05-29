/** @jsxImportSource @emotion/react */
/**
 * AddTrackButton
 *
 * Compact "+ Track" affordance in the timeline toolbar. Opens a popover with
 * the four track types (video / audio / overlay / subtitle); selecting one
 * calls `TimelineStore.addTrack(type)`, which appends a new track with an
 * auto-generated name.
 */

import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined";

import type { TimelineTrack } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { Popover } from "../../ui_primitives";

// ── Styles ─────────────────────────────────────────────────────────────────

const buttonStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 24,
    padding: "0 10px 0 8px",
    background: "transparent",
    border: "1px solid transparent",
    color: theme.vars.palette.text.secondary,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: "0.01em",
    fontFamily: theme.typography.fontFamily,
    borderRadius: 6,
    transition: "background-color 120ms, color 120ms, border-color 120ms",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider
    },
    "& svg": {
      fontSize: 14
    }
  });

// ── Track-type options ─────────────────────────────────────────────────────

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
  }
];

// ── Component ──────────────────────────────────────────────────────────────

export const AddTrackButton: React.FC = memo(() => {
  const theme = useTheme();
  const addTrack = useTimelineStore((s) => s.addTrack);
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
      <button
        type="button"
        css={buttonStyles(theme)}
        onClick={handleOpen}
        aria-label="Add track"
        aria-haspopup="menu"
        data-testid="add-track-button"
      >
        <AddIcon />
        <span>Track</span>
      </button>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        placement="bottom-left"
      >
        {TRACK_TYPES.map((opt) => (
          <MenuItem key={opt.type} onClick={() => handleSelect(opt.type)}>
            <ListItemIcon>{opt.icon}</ListItemIcon>
            <ListItemText primary={opt.label} />
          </MenuItem>
        ))}
      </Popover>
    </>
  );
});

AddTrackButton.displayName = "AddTrackButton";
