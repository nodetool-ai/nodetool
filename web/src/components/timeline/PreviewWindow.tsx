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
    minHeight: "200px", // Ensure minimum height
    backgroundColor:
      theme.vars?.palette?.background?.paper || theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    overflow: "hidden",

    ".preview-video-container": {
      flex: 1,
      position: "relative",
      backgroundColor: "#000",
      overflow: "hidden",
      minHeight: "150px" // Ensure canvas container has minimum height
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
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      gap: theme.spacing(1)
    },

    ".preview-canvas": {
      position: "absolute",
      top: 0,
      left: 0
      // Width and height set via JavaScript based on container size
    },

    ".preview-image": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      objectFit: "contain",
      backgroundColor: "#000"
    },

    ".preview-overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      padding: theme.spacing(0.5, 1),
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      color: "rgba(255, 255, 255, 0.9)",
      fontSize: "0.75rem",
      zIndex: 1
    },

    ".preview-progress": {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: "4px",
      backgroundColor: "rgba(255, 255, 255, 0.2)"
    },

    ".preview-progress-bar": {
      height: "100%",
      backgroundColor: "rgba(255, 255, 255, 0.7)",
      transition: "width 0.1s ease"
    },

    ".preview-controls": {
      display: "flex",
      alignItems: "center",
      padding: theme.spacing(0.5, 1),
      gap: theme.spacing(1),
      backgroundColor:
        theme.vars?.palette?.background?.default ||
        theme.palette.background.default,
      borderTop: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`
    },

    ".preview-time": {
      fontSize: "0.75rem",
      fontFamily: "monospace",
      minWidth: "80px",
      color: theme.vars?.palette?.text?.primary || theme.palette.text.primary
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
      color: theme.vars?.palette?.text?.disabled || theme.palette.text.disabled,
      textAlign: "center",
      padding: theme.spacing(1)
    }
  });

const PreviewWindow: React.FC = () => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const { project, playback, togglePlayback, getClipsAtTime } =
    useTimelineStore();

  // Get current clips at playhead
  const currentClips = project ? getClipsAtTime(playback.playheadPosition) : [];

  // Find first visual clip (video or image)
  const visualClip = currentClips.find(
    ({ clip }) => clip.type === "video" || clip.type === "image"
  )?.clip;
  const audioClips = currentClips.filter(({ clip }) => clip.type === "audio");

  // Use ResizeObserver to track container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasSize({ width, height });
        }
      }
    });

    resizeObserver.observe(container);

    // Initial size check
    updateSize();

    // Fallback: check again after a short delay in case layout hasn't settled
    const timeoutId = setTimeout(updateSize, 100);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  // Draw canvas content when size changes or clips change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    // If size is 0, wait for resize
    if (canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = canvasSize.width;
    const height = canvasSize.height;

    // Set canvas size with device pixel ratio for crisp rendering
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas with dark background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, width, height);

    if (!project || !visualClip) {
      // Draw placeholder - background already filled with #1a1a1a above
      ctx.fillStyle = "#666";
      ctx.font = "14px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const message =
        currentClips.length > 0
          ? "Audio only"
          : project
          ? "Move playhead to a clip"
          : "No project loaded";

      ctx.fillText(message, width / 2, height / 2);

      // Show audio indicator if there are audio clips
      if (audioClips.length > 0) {
        ctx.fillStyle = "rgba(100, 200, 100, 0.8)";
        ctx.font = "12px Inter, system-ui, sans-serif";
        ctx.fillText(
          `♪ ${audioClips.length} audio track${
            audioClips.length > 1 ? "s" : ""
          }`,
          width / 2,
          height / 2 + 25
        );
      }
      return;
    }

    // For images, we use an <img> element to avoid CORS issues
    // Canvas is only used for video thumbnails and placeholders
    if (visualClip.type === "image") {
      // Image will be rendered via <img> element, not canvas
      // Just clear the canvas (it will be hidden behind the image)
      return;
    }

    // Handle video clips
    const sourceUrl = visualClip.sourceUrl;
    if (visualClip.type === "video" && sourceUrl) {
      // For video, show a thumbnail with a play indicator
      // In a real implementation, we'd use a <video> element
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, width, height);

      // Draw video icon
      ctx.fillStyle = "#666";
      ctx.beginPath();
      const centerX = width / 2;
      const centerY = height / 2;
      ctx.moveTo(centerX - 15, centerY - 20);
      ctx.lineTo(centerX - 15, centerY + 20);
      ctx.lineTo(centerX + 20, centerY);
      ctx.closePath();
      ctx.fill();

      // Draw clip name
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, width, 28);
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(visualClip.name, 8, 8);

      // Draw progress bar
      const clipProgress =
        (playback.playheadPosition - visualClip.startTime) /
        visualClip.duration;
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fillRect(0, height - 4, width, 4);
      ctx.fillStyle = "rgba(100, 150, 255, 0.8)";
      ctx.fillRect(0, height - 4, width * clipProgress, 4);
    }

    // Draw audio indicator if there are audio clips playing
    if (audioClips.length > 0) {
      ctx.fillStyle = "rgba(100, 200, 100, 0.9)";
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(`♪ ${audioClips.length} audio`, width - 8, 8);
    }
  }, [
    project,
    playback.playheadPosition,
    visualClip,
    audioClips.length,
    currentClips.length,
    canvasSize
  ]);

  const handleVolumeChange = useCallback(
    (_event: Event, value: number | number[]) => {
      setVolume(value as number);
      setIsMuted(false);
    },
    []
  );

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

  // Calculate clip progress for overlay
  const clipProgress = visualClip
    ? (playback.playheadPosition - visualClip.startTime) / visualClip.duration
    : 0;

  return (
    <Box css={styles(theme)} className="preview-window">
      {/* Video/Image preview area */}
      <div ref={containerRef} className="preview-video-container">
        {/* Canvas for video/placeholder */}
        <canvas
          ref={canvasRef}
          className="preview-canvas"
          style={{
            display: visualClip?.type === "image" ? "none" : "block"
          }}
        />

        {/* Image element for image clips (avoids CORS issues) */}
        {visualClip?.type === "image" && visualClip.sourceUrl && (
          <>
            <img
              src={visualClip.sourceUrl}
              alt={visualClip.name}
              className="preview-image"
            />
            {/* Overlay with clip name */}
            <div className="preview-overlay">{visualClip.name}</div>
            {/* Progress bar */}
            <div className="preview-progress">
              <div
                className="preview-progress-bar"
                style={{ width: `${clipProgress * 100}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="preview-controls">
        {/* Play/Pause */}
        <Tooltip
          title={playback.isPlaying ? "Pause" : "Play"}
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton size="small" onClick={togglePlayback}>
            {playback.isPlaying ? (
              <PauseIcon fontSize="small" />
            ) : (
              <PlayArrowIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>

        {/* Time display */}
        <Typography className="preview-time">
          {formatTimeShort(playback.playheadPosition)} /{" "}
          {formatTimeShort(project.duration)}
        </Typography>

        {/* Spacer */}
        <Box flex={1} />

        {/* Volume control */}
        <div className="preview-volume">
          <Tooltip
            title={isMuted ? "Unmute" : "Mute"}
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
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
