/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect, useCallback, useState } from "react";
import { Box, Typography, IconButton, Tooltip, Slider } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";

// Icons
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import FullscreenIcon from "@mui/icons-material/Fullscreen";

import useTimelineStore from "../../stores/TimelineStore";
import { formatTimeShort } from "../../utils/timelineUtils";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "400px",
    height: "100%",
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    overflow: "hidden",

    ".preview-video-container": {
      flex: 1,
      position: "relative",
      backgroundColor: "#000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },

    ".preview-video": {
      maxWidth: "100%",
      maxHeight: "100%",
      objectFit: "contain"
    },

    ".preview-placeholder": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      color: theme.palette.text.secondary,
      gap: theme.spacing(1)
    },

    ".preview-canvas": {
      width: "100%",
      height: "100%",
      objectFit: "contain"
    },

    ".preview-controls": {
      display: "flex",
      alignItems: "center",
      padding: theme.spacing(0.5, 1),
      gap: theme.spacing(1),
      backgroundColor: theme.palette.background.default,
      borderTop: `1px solid ${theme.palette.divider}`
    },

    ".preview-time": {
      fontSize: "0.75rem",
      fontFamily: "monospace",
      minWidth: "80px"
    },

    ".preview-volume": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5)
    },

    ".volume-slider": {
      width: "60px"
    },

    ".no-clips-message": {
      fontSize: "0.75rem",
      color: theme.palette.text.disabled,
      textAlign: "center",
      padding: theme.spacing(1)
    }
  });

const PreviewWindow: React.FC = () => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const {
    project,
    playback,
    togglePlayback,
    getClipsAtTime
  } = useTimelineStore();

  // Get current clips at playhead
  const currentClips = project ? getClipsAtTime(playback.playheadPosition) : [];
  const hasContent = currentClips.length > 0;

  // Draw preview canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Set canvas size
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!project || currentClips.length === 0) {
      // Draw placeholder
      ctx.fillStyle = "#333";
      ctx.fillRect(0, 0, rect.width, rect.height);
      
      ctx.fillStyle = "#666";
      ctx.font = "14px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No content at playhead", rect.width / 2, rect.height / 2);
      return;
    }

    // Draw simple visualization of current clips
    const videoClips = currentClips.filter(({ clip }) => clip.type === "video" || clip.type === "image");
    const audioClips = currentClips.filter(({ clip }) => clip.type === "audio");

    // Draw video/image clips as colored rectangles
    if (videoClips.length > 0) {
      const clip = videoClips[0].clip;
      
      // Draw a gradient background representing video content
      const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
      const hue = (playback.playheadPosition * 10) % 360;
      gradient.addColorStop(0, `hsla(${hue}, 50%, 30%, 1)`);
      gradient.addColorStop(1, `hsla(${(hue + 60) % 360}, 50%, 20%, 1)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Draw clip name
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(clip.name, 10, 10);

      // Draw progress indicator
      const clipProgress = (playback.playheadPosition - clip.startTime) / clip.duration;
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(0, rect.height - 4, rect.width * clipProgress, 4);
    } else {
      // No video content, just show a dark background
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    // Draw audio indicator
    if (audioClips.length > 0) {
      ctx.fillStyle = "rgba(100, 200, 100, 0.8)";
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`♪ ${audioClips.length} audio track${audioClips.length > 1 ? "s" : ""}`, rect.width - 10, rect.height - 10);
    }

  }, [project, playback.playheadPosition, currentClips]);

  const handleVolumeChange = useCallback((_event: Event, value: number | number[]) => {
    setVolume(value as number);
    setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted]);

  if (!project) {
    return (
      <Box css={styles(theme)} className="preview-window">
        <div className="preview-video-container">
          <div className="preview-placeholder">
            <Typography className="no-clips-message">
              No project loaded
            </Typography>
          </div>
        </div>
      </Box>
    );
  }

  return (
    <Box css={styles(theme)} className="preview-window">
      {/* Video/Image preview area */}
      <div className="preview-video-container">
        <canvas
          ref={canvasRef}
          className="preview-canvas"
        />
      </div>

      {/* Controls */}
      <div className="preview-controls">
        {/* Play/Pause */}
        <Tooltip title={playback.isPlaying ? "Pause" : "Play"} enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small" onClick={togglePlayback}>
            {playback.isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
        </Tooltip>

        {/* Time display */}
        <Typography className="preview-time">
          {formatTimeShort(playback.playheadPosition)} / {formatTimeShort(project.duration)}
        </Typography>

        {/* Spacer */}
        <Box flex={1} />

        {/* Volume control */}
        <div className="preview-volume">
          <Tooltip title={isMuted ? "Unmute" : "Mute"} enterDelay={TOOLTIP_ENTER_DELAY}>
            <IconButton size="small" onClick={toggleMute}>
              {isMuted || volume === 0 ? (
                <VolumeOffIcon fontSize="small" />
              ) : (
                <VolumeUpIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Slider
            className="volume-slider"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            min={0}
            max={1}
            step={0.1}
            size="small"
            aria-label="Volume"
          />
        </div>

        {/* Fullscreen */}
        <Tooltip title="Fullscreen" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton size="small">
            <FullscreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
    </Box>
  );
};

export default PreviewWindow;
