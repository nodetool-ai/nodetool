/**
 * TrackHeader Component
 * Displays a single track header row with controls for the track list sidebar
 */
import React, { useCallback } from "react";
import { Typography, IconButton, Tooltip } from "@mui/material";
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
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";

import useTimelineStore, { Track } from "../../stores/TimelineStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

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

export interface TrackHeaderProps {
  track: Track;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}

const TrackHeader: React.FC<TrackHeaderProps> = ({
  track,
  index,
  isSelected,
  onSelect,
  onDragStart,
  onDragOver,
  onDragEnd: _onDragEnd,
  isDragOver
}) => {
  const {
    toggleTrackMute,
    toggleTrackLock,
    toggleTrackVisibility,
    removeTrack
  } = useTimelineStore();

  const handleMuteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleTrackMute(track.id);
    },
    [track.id, toggleTrackMute]
  );

  const handleLockClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleTrackLock(track.id);
    },
    [track.id, toggleTrackLock]
  );

  const handleVisibilityClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleTrackVisibility(track.id);
    },
    [track.id, toggleTrackVisibility]
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeTrack(track.id);
    },
    [track.id, removeTrack]
  );

  const handleDragHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDragStart(index);
    },
    [index, onDragStart]
  );

  const classNames = [
    "track-row",
    isSelected ? "selected" : "",
    track.muted ? "muted" : "",
    isDragOver ? "drag-over" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classNames}
      onClick={onSelect}
      onMouseEnter={() => onDragOver(index)}
      style={{ height: track.height }}
    >
      {/* Drag handle */}
      <div className="drag-handle" onMouseDown={handleDragHandleMouseDown}>
        <DragIndicatorIcon fontSize="small" />
      </div>

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
        <Typography className="track-type">{track.type}</Typography>
      </div>

      {/* Track controls */}
      <div className="track-controls">
        {/* Mute/Solo (for audio tracks) */}
        {track.type === "audio" && (
          <Tooltip
            title={track.muted ? "Unmute" : "Mute"}
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
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
          <Tooltip
            title={track.visible ? "Hide" : "Show"}
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
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
        <Tooltip
          title={track.locked ? "Unlock" : "Lock"}
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
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

export default TrackHeader;

