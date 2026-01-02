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
    backgroundColor:
      theme.vars?.palette?.background?.paper || theme.palette.background.paper,
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
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);

  const { project, playback, togglePlayback, getClipsAtTime } =
    useTimelineStore();

  // Get current clips at playhead
  const currentClips = project ? getClipsAtTime(playback.playheadPosition) : [];

  // Find first visual clip (video or image)
  const visualClip = currentClips.find(
    ({ clip }) => clip.type === "video" || clip.type === "image"
  )?.clip;
  const audioClips = currentClips.filter(({ clip }) => clip.type === "audio");

  // Load and display image/video content
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Set canvas size
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!project || !visualClip) {
      // Draw placeholder
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, rect.width, rect.height);

      ctx.fillStyle = "#555";
      ctx.font = "14px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        currentClips.length > 0
          ? "Audio only - no visual content"
          : "Move playhead to a clip",
        rect.width / 2,
        rect.height / 2
      );

      // Show audio indicator if there are audio clips
      if (audioClips.length > 0) {
        ctx.fillStyle = "rgba(100, 200, 100, 0.8)";
        ctx.font = "12px Inter, system-ui, sans-serif";
        ctx.fillText(
          `♪ ${audioClips.length} audio track${
            audioClips.length > 1 ? "s" : ""
          }`,
          rect.width / 2,
          rect.height / 2 + 25
        );
      }
      return;
    }

    // Load and draw the actual image/video
    const sourceUrl = visualClip.sourceUrl;

    if (visualClip.type === "image" && sourceUrl) {
      // Load and draw image
      if (loadedImageUrl !== sourceUrl) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          imageRef.current = img;
          setLoadedImageUrl(sourceUrl);
        };
        img.src = sourceUrl;
      } else if (imageRef.current) {
        // Draw the loaded image
        const img = imageRef.current;
        const scale = Math.min(
          rect.width / img.width,
          rect.height / img.height
        );
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const drawX = (rect.width - drawWidth) / 2;
        const drawY = (rect.height - drawHeight) / 2;

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // Draw clip name overlay
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, rect.width, 28);
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
        ctx.fillRect(0, rect.height - 4, rect.width, 4);
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.fillRect(0, rect.height - 4, rect.width * clipProgress, 4);
      }
    } else if (visualClip.type === "video" && sourceUrl) {
      // For video, show a thumbnail with a play indicator
      // In a real implementation, we'd use a <video> element
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Draw video icon
      ctx.fillStyle = "#666";
      ctx.beginPath();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      ctx.moveTo(centerX - 15, centerY - 20);
      ctx.lineTo(centerX - 15, centerY + 20);
      ctx.lineTo(centerX + 20, centerY);
      ctx.closePath();
      ctx.fill();

      // Draw clip name
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, rect.width, 28);
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
      ctx.fillRect(0, rect.height - 4, rect.width, 4);
      ctx.fillStyle = "rgba(100, 150, 255, 0.8)";
      ctx.fillRect(0, rect.height - 4, rect.width * clipProgress, 4);
    }

    // Draw audio indicator if there are audio clips playing
    if (audioClips.length > 0) {
      ctx.fillStyle = "rgba(100, 200, 100, 0.9)";
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(`♪ ${audioClips.length} audio`, rect.width - 8, 8);
    }
  }, [
    project,
    playback.playheadPosition,
    visualClip,
    audioClips.length,
    loadedImageUrl,
    currentClips.length
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

  return (
    <Box css={styles(theme)} className="preview-window">
      {/* Video/Image preview area */}
      <div className="preview-video-container">
        <canvas ref={canvasRef} className="preview-canvas" />
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
