/** @jsxImportSource @emotion/react */
/**
 * AddTrackButton
 *
 * Small button rendered at the bottom of the track header column. Click opens
 * a popover with the four track types (video / audio / overlay / subtitle).
 * Selecting one calls `TimelineStore.addTrack(type)`, which appends a new
 * track with an auto-generated name.
 */

import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import VideocamIcon from "@mui/icons-material/Videocam";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import LayersIcon from "@mui/icons-material/Layers";
import SubtitlesIcon from "@mui/icons-material/Subtitles";

import type { TimelineTrack } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { Popover } from "../../ui_primitives";
import { TRACK_HEADER_WIDTH_PX } from "./TrackHeader";

// ── Styles ─────────────────────────────────────────────────────────────────

const buttonStyles = (theme: Theme) =>
  css({
    width: TRACK_HEADER_WIDTH_PX,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing(0.5),
    height: 32,
    background: "none",
    border: "none",
    borderRight: `1px solid ${theme.vars.palette.divider}`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    color: theme.vars.palette.text.secondary,
    cursor: "pointer",
    fontSize: theme.typography.body2.fontSize,
    fontFamily: theme.typography.fontFamily,
    padding: 0,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary
    },
    "& svg": {
      fontSize: 16
    }
  });

// ── Track-type options ─────────────────────────────────────────────────────

interface TrackTypeOption {
  type: TimelineTrack["type"];
  label: string;
  icon: React.ReactNode;
}

const TRACK_TYPES: TrackTypeOption[] = [
  { type: "video", label: "Video", icon: <VideocamIcon fontSize="small" /> },
  { type: "audio", label: "Audio", icon: <AudiotrackIcon fontSize="small" /> },
  { type: "overlay", label: "Overlay", icon: <LayersIcon fontSize="small" /> },
  {
    type: "subtitle",
    label: "Subtitle",
    icon: <SubtitlesIcon fontSize="small" />
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
