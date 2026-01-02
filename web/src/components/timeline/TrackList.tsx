/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip
} from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";

// Icons
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import DeleteIcon from "@mui/icons-material/Delete";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import VideocamIcon from "@mui/icons-material/Videocam";
import ImageIcon from "@mui/icons-material/Image";

import useTimelineStore, { Track } from "../../stores/TimelineStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    flex: 1,
    overflow: "auto",

    ".track-header": {
      display: "flex",
      alignItems: "center",
      padding: theme.spacing(0.5, 1),
      borderBottom: `1px solid ${theme.vars?.palette?.divider || theme.palette.divider}`,
      backgroundColor: theme.vars?.palette?.background?.paper || theme.palette.background.paper,
      minHeight: "60px",
      gap: theme.spacing(0.5),
      cursor: "pointer",
      transition: "background-color 0.15s ease",

      "&:hover": {
        backgroundColor: theme.vars?.palette?.action?.hover || theme.palette.action.hover
      },

      "&.selected": {
        backgroundColor: theme.vars?.palette?.action?.selected || theme.palette.action.selected
      },

      "&.muted": {
        opacity: 0.6
      }
    },

    ".track-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "24px",
      height: "24px",
      borderRadius: "4px",
      marginRight: theme.spacing(0.5)
    },

    ".track-info": {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column"
    },

    ".track-name": {
      fontWeight: 500,
      fontSize: "0.8rem",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      color: theme.vars?.palette?.text?.primary || theme.palette.text.primary
    },

    ".track-type": {
      fontSize: "0.65rem",
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      textTransform: "capitalize"
    },

    ".track-controls": {
      display: "flex",
      alignItems: "center",
      gap: "2px"
    },

    ".track-control-btn": {
      padding: "4px",
      "& svg": {
        fontSize: "1rem"
      }
    },

    ".empty-tracks": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      color: theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      fontSize: "0.75rem",
      padding: theme.spacing(2)
    }
  });

const getTrackIcon = (type: string) => {
  switch (type) {
    case "video":
      return <VideocamIcon fontSize="small" />;
    case "audio":
      return <AudiotrackIcon fontSize="small" />;
    case "image":
      return <ImageIcon fontSize="small" />;
    default:
      return <VideocamIcon fontSize="small" />;
  }
};

interface TrackHeaderProps {
  track: Track;
  isSelected: boolean;
  onSelect: () => void;
}

const TrackHeader: React.FC<TrackHeaderProps> = ({ track, isSelected, onSelect }) => {
  const theme = useTheme();

  const {
    toggleTrackMute,
    toggleTrackLock,
    toggleTrackVisibility,
    removeTrack
  } = useTimelineStore();

  const handleMuteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTrackMute(track.id);
  }, [track.id, toggleTrackMute]);

  const handleLockClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTrackLock(track.id);
  }, [track.id, toggleTrackLock]);

  const handleVisibilityClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTrackVisibility(track.id);
  }, [track.id, toggleTrackVisibility]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    removeTrack(track.id);
  }, [track.id, removeTrack]);

  const classNames = [
    "track-header",
    isSelected ? "selected" : "",
    track.muted ? "muted" : ""
  ].filter(Boolean).join(" ");

  return (
    <div
      className={classNames}
      onClick={onSelect}
      style={{ height: track.height }}
    >
      {/* Track type icon */}
      <div
        className="track-icon"
        style={{ backgroundColor: track.color || "#666" }}
      >
        {getTrackIcon(track.type)}
      </div>

      {/* Track info */}
      <div className="track-info">
        <Typography className="track-name" title={track.name}>
          {track.name}
        </Typography>
        <Typography className="track-type">
          {track.type}
        </Typography>
      </div>

      {/* Track controls */}
      <div className="track-controls">
        {/* Mute/Solo (for audio tracks) */}
        {track.type === "audio" && (
          <Tooltip title={track.muted ? "Unmute" : "Mute"} enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton
              className="track-control-btn"
              size="small"
              onClick={handleMuteClick}
              color={track.muted ? "default" : "primary"}
            >
              {track.muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
            </IconButton>
          </Tooltip>
        )}

        {/* Visibility (for video/image tracks) */}
        {(track.type === "video" || track.type === "image") && (
          <Tooltip title={track.visible ? "Hide" : "Show"} enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton
              className="track-control-btn"
              size="small"
              onClick={handleVisibilityClick}
              color={track.visible ? "primary" : "default"}
            >
              {track.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
            </IconButton>
          </Tooltip>
        )}

        {/* Lock */}
        <Tooltip title={track.locked ? "Unlock" : "Lock"} enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className="track-control-btn"
            size="small"
            onClick={handleLockClick}
            color={track.locked ? "warning" : "default"}
          >
            {track.locked ? <LockIcon /> : <LockOpenIcon />}
          </IconButton>
        </Tooltip>

        {/* Delete */}
        <Tooltip title="Delete Track" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className="track-control-btn"
            size="small"
            onClick={handleDeleteClick}
            color="default"
          >
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
};

const TrackList: React.FC = () => {
  const theme = useTheme();
  
  const { project, selection, selectTrack } = useTimelineStore();

  const handleSelectTrack = useCallback((trackId: string) => {
    selectTrack(trackId);
  }, [selectTrack]);

  if (!project) {
    return null;
  }

  return (
    <Box css={styles(theme)} className="track-list">
      {project.tracks.length === 0 ? (
        <div className="empty-tracks">
          Add a track to begin
        </div>
      ) : (
        project.tracks.map((track) => (
          <TrackHeader
            key={track.id}
            track={track}
            isSelected={selection.selectedTrackId === track.id}
            onSelect={() => handleSelectTrack(track.id)}
          />
        ))
      )}
    </Box>
  );
};

export default TrackList;
