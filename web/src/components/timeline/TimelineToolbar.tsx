/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Slider,
  Divider,
  ToggleButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";

// Icons
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import RepeatIcon from "@mui/icons-material/Repeat";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import MagnetIcon from "@mui/icons-material/Grid4x4";
import AddIcon from "@mui/icons-material/Add";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import VideocamIcon from "@mui/icons-material/Videocam";
import ImageIcon from "@mui/icons-material/Image";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";

import useTimelineStore, {
  useTimelineHistory,
  TrackType
} from "../../stores/TimelineStore";
import { formatTimecode, formatTimeShort } from "../../utils/timelineUtils";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(0.5, 1),
    backgroundColor:
      theme.vars?.palette?.background?.paper || theme.palette.background.paper,
    borderBottom: `1px solid ${
      theme.vars?.palette?.divider || theme.palette.divider
    }`,
    gap: theme.spacing(1),
    flexWrap: "wrap",
    minHeight: "48px",

    ".toolbar-section": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },

    ".toolbar-divider": {
      height: "24px",
      margin: theme.spacing(0, 1)
    },

    ".timecode-display": {
      fontFamily: "monospace",
      fontSize: "0.875rem",
      padding: theme.spacing(0.5, 1),
      backgroundColor:
        theme.vars?.palette?.action?.hover || theme.palette.action.hover,
      borderRadius: theme.shape.borderRadius,
      minWidth: "110px",
      textAlign: "center",
      color: theme.vars?.palette?.text?.primary || theme.palette.text.primary
    },

    ".zoom-slider": {
      width: "120px",
      marginLeft: theme.spacing(1),
      marginRight: theme.spacing(1)
    },

    ".zoom-value": {
      minWidth: "50px",
      fontSize: "0.75rem",
      textAlign: "center"
    },

    ".snap-toggle": {
      "&.Mui-selected": {
        backgroundColor:
          theme.vars?.palette?.primary?.dark || theme.palette.primary.dark,
        color:
          theme.vars?.palette?.primary?.contrastText ||
          theme.palette.primary.contrastText
      }
    }
  });

const TimelineToolbar: React.FC = () => {
  const theme = useTheme();
  const [addTrackAnchor, setAddTrackAnchor] =
    React.useState<null | HTMLElement>(null);

  const {
    project,
    playback,
    viewport,
    snapEnabled,
    stop,
    togglePlayback,
    stepFrame,
    toggleLoop,
    setZoom,
    zoomIn,
    zoomOut,
    zoomToFit,
    toggleSnap,
    addTrack
  } = useTimelineStore();

  const { undo, redo, canUndo, canRedo } = useTimelineHistory((state) => ({
    undo: state.undo,
    redo: state.redo,
    canUndo: state.pastStates.length > 0,
    canRedo: state.futureStates.length > 0
  }));

  const handleZoomChange = useCallback(
    (_event: Event, value: number | number[]) => {
      setZoom(value as number);
    },
    [setZoom]
  );

  const handleAddTrackClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setAddTrackAnchor(event.currentTarget);
    },
    []
  );

  const handleAddTrackClose = useCallback(() => {
    setAddTrackAnchor(null);
  }, []);

  const handleAddTrack = useCallback(
    (type: TrackType) => {
      addTrack(type);
      handleAddTrackClose();
    },
    [addTrack, handleAddTrackClose]
  );

  const frameRate = project?.frameRate || 30;

  return (
    <Box css={styles(theme)} className="timeline-toolbar">
      {/* Transport controls */}
      <div className="toolbar-section">
        <Tooltip title="Stop (Home)" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={stop}>
            <StopIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title="Previous Frame (←)" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={() => stepFrame(-1)}>
            <SkipPreviousIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip
          title={playback.isPlaying ? "Pause (Space)" : "Play (Space)"}
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            size="small"
            onClick={togglePlayback}
            color={playback.isPlaying ? "primary" : "default"}
          >
            {playback.isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
        </Tooltip>

        <Tooltip title="Next Frame (→)" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={() => stepFrame(1)}>
            <SkipNextIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip
          title={`Loop ${playback.loopEnabled ? "(On)" : "(Off)"}`}
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            size="small"
            onClick={toggleLoop}
            color={playback.loopEnabled ? "primary" : "default"}
          >
            <RepeatIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      {/* Timecode display */}
      <div className="toolbar-section">
        <Typography className="timecode-display">
          {formatTimecode(playback.playheadPosition, frameRate)}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          {formatTimeShort(playback.playheadPosition)}
        </Typography>
      </div>

      <Divider orientation="vertical" className="toolbar-divider" />

      {/* Undo/Redo */}
      <div className="toolbar-section">
        <Tooltip title="Undo (Ctrl+Z)" enterDelay={TOOLTIP_ENTER_DELAY}>
          <span>
            <IconButton size="small" onClick={() => undo()} disabled={!canUndo}>
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Redo (Ctrl+Shift+Z)" enterDelay={TOOLTIP_ENTER_DELAY}>
          <span>
            <IconButton size="small" onClick={() => redo()} disabled={!canRedo}>
              <RedoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </div>

      <Divider orientation="vertical" className="toolbar-divider" />

      {/* Add Track */}
      <div className="toolbar-section">
        <Tooltip title="Add Track" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={handleAddTrackClick}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={addTrackAnchor}
          open={Boolean(addTrackAnchor)}
          onClose={handleAddTrackClose}
        >
          <MenuItem onClick={() => handleAddTrack("video")}>
            <ListItemIcon>
              <VideocamIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Video Track</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleAddTrack("audio")}>
            <ListItemIcon>
              <AudiotrackIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Audio Track</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleAddTrack("image")}>
            <ListItemIcon>
              <ImageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Image Track</ListItemText>
          </MenuItem>
        </Menu>
      </div>

      <Divider orientation="vertical" className="toolbar-divider" />

      {/* Zoom controls */}
      <div className="toolbar-section">
        <Tooltip title="Zoom Out (-)" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={zoomOut}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Slider
          className="zoom-slider"
          value={viewport.pixelsPerSecond}
          onChange={handleZoomChange}
          min={10}
          max={500}
          step={10}
          size="small"
          aria-label="Zoom"
        />

        <Tooltip title="Zoom In (+)" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={zoomIn}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Typography className="zoom-value" variant="caption">
          {Math.round(viewport.pixelsPerSecond)}px/s
        </Typography>

        <Tooltip title="Zoom to Fit (F)" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={zoomToFit}>
            <FitScreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <Divider orientation="vertical" className="toolbar-divider" />

      {/* Snap toggle */}
      <div className="toolbar-section">
        <Tooltip
          title={`Snap ${snapEnabled ? "(On)" : "(Off)"}`}
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <ToggleButton
            value="snap"
            selected={snapEnabled}
            onChange={toggleSnap}
            size="small"
            className="snap-toggle"
          >
            <MagnetIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      </div>

      {/* Project info */}
      {project && (
        <>
          <Divider orientation="vertical" className="toolbar-divider" />
          <div className="toolbar-section">
            <Typography variant="caption" color="textSecondary">
              {project.frameRate} fps | {formatTimeShort(project.duration)}
            </Typography>
          </div>
        </>
      )}
    </Box>
  );
};

export default TimelineToolbar;
