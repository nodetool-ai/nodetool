/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { Box, Typography, IconButton, Tooltip, Slider } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";

// Icons
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import FullscreenIcon from "@mui/icons-material/Fullscreen";

import useTimelineStore, { Clip, Track } from "../../stores/TimelineStore";
import { formatTimeShort } from "../../utils/timelineUtils";
import {
  calculateClipOpacity,
  isInTransition,
  isClipInFade,
  renderWithTransition,
  renderClipWithFades
} from "../../utils/timeline/transitionRenderer";
import { useMediaSources } from "../../hooks/timeline/useMediaSources";
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

/**
 * Find visual clips at a specific time, including those in transition
 */
function findVisualClipsAtTime(
  tracks: Track[],
  currentTime: number
): { current: Clip | null; next: Clip | null; track: Track | null } {
  for (const track of tracks) {
    if (track.type !== "video" && track.type !== "image") continue;
    if (!track.visible || track.muted) continue;

    // Find clips at current time and the next clip
    const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i];
      const clipEnd = clip.startTime + clip.duration;
      const nextClip = sortedClips[i + 1];

      // Check if we're in this clip
      if (currentTime >= clip.startTime && currentTime < clipEnd) {
        // Check if we're in a transition to the next clip
        if (nextClip && isInTransition(currentTime, clip, nextClip)) {
          return { current: clip, next: nextClip, track };
        }
        return { current: clip, next: null, track };
      }

      // Check if we're in a transition from the previous clip
      if (nextClip && isInTransition(currentTime, clip, nextClip)) {
        return { current: clip, next: nextClip, track };
      }
    }
  }

  return { current: null, next: null, track: null };
}

const PreviewWindow: React.FC = () => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const { project, playback, togglePlayback, getClipsAtTime } =
    useTimelineStore();

  // Get all visual clips for media loading
  const allVisualClips = useMemo(() => {
    if (!project) return [];
    return project.tracks
      .filter((t) => t.type === "video" || t.type === "image")
      .flatMap((t) => t.clips);
  }, [project]);

  // Load media sources for clips
  const { getSource, seekVideo } = useMediaSources({ clips: allVisualClips });

  // Find current visual clips (including transitions)
  const visualClipData = useMemo(() => {
    if (!project) return { current: null, next: null, track: null };
    return findVisualClipsAtTime(project.tracks, playback.playheadPosition);
  }, [project, playback.playheadPosition]);

  const { current: visualClip, next: nextClip, track: visualTrack } = visualClipData;

  // Get current clips at playhead for audio info
  const currentClips = project ? getClipsAtTime(playback.playheadPosition) : [];
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

    // Get the media sources for current clips
    const currentSource = getSource(visualClip.id);
    const nextSource = nextClip ? getSource(nextClip.id) : null;

    // Calculate clip time
    const clipTime = playback.playheadPosition - visualClip.startTime;

    // Check if we're in a transition
    if (nextClip && isInTransition(playback.playheadPosition, visualClip, nextClip)) {
      // Render with transition effect
      renderWithTransition(
        ctx,
        width,
        height,
        visualClip,
        nextClip,
        currentSource,
        nextSource,
        playback.playheadPosition
      );
    } else if (currentSource) {
      // Render single clip with fades
      renderClipWithFades(ctx, width, height, visualClip, currentSource, clipTime);
    } else {
      // No source loaded yet - show loading placeholder
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, width, height);

      // Calculate opacity for fade effect visualization
      const opacity = calculateClipOpacity(visualClip, clipTime);

      // Draw placeholder with opacity indicator
      ctx.globalAlpha = opacity;
      ctx.fillStyle = "#666";
      ctx.beginPath();
      const centerX = width / 2;
      const centerY = height / 2;
      ctx.moveTo(centerX - 15, centerY - 20);
      ctx.lineTo(centerX - 15, centerY + 20);
      ctx.lineTo(centerX + 20, centerY);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // Draw fade indicator if fades are active
      if (isClipInFade(visualClip, clipTime)) {
        ctx.fillStyle = "rgba(255, 193, 7, 0.8)";
        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Fade: ${Math.round(opacity * 100)}%`, width / 2, height - 20);
      }
    }

    // Draw clip name overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, width, 28);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    let clipLabel = visualClip.name;
    if (nextClip && isInTransition(playback.playheadPosition, visualClip, nextClip)) {
      const transition = visualClip.transitions?.out || nextClip.transitions?.in;
      clipLabel += ` → ${nextClip.name} (${transition?.type || "transition"})`;
    }
    ctx.fillText(clipLabel, 8, 8);

    // Draw progress bar
    const clipProgress = clipTime / visualClip.duration;
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(0, height - 4, width, 4);
    ctx.fillStyle = "rgba(100, 150, 255, 0.8)";
    ctx.fillRect(0, height - 4, width * Math.min(1, clipProgress), 4);

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
    nextClip,
    audioClips.length,
    currentClips.length,
    canvasSize,
    getSource
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

  // Calculate clip progress and opacity for overlay
  const clipProgress = visualClip
    ? (playback.playheadPosition - visualClip.startTime) / visualClip.duration
    : 0;

  // Calculate clip time for fade checks
  const clipTime = visualClip
    ? playback.playheadPosition - visualClip.startTime
    : 0;

  // Calculate image opacity for fade effects
  const imageOpacity = visualClip
    ? calculateClipOpacity(visualClip, clipTime)
    : 1;

  // Check if we should use canvas for image (when in transition or has fades)
  const useCanvasForImage = visualClip?.type === "image" && (
    nextClip || isClipInFade(visualClip, clipTime)
  );

  return (
    <Box css={styles(theme)} className="preview-window">
      {/* Video/Image preview area */}
      <div ref={containerRef} className="preview-video-container">
        {/* Canvas for video/placeholder/transitions */}
        <canvas
          ref={canvasRef}
          className="preview-canvas"
          style={{
            display: (visualClip?.type === "image" && !useCanvasForImage) ? "none" : "block"
          }}
        />

        {/* Image element for image clips without active fades (avoids CORS issues) */}
        {visualClip?.type === "image" && visualClip.sourceUrl && !useCanvasForImage && (
          <>
            <img
              src={visualClip.sourceUrl}
              alt={visualClip.name}
              className="preview-image"
              style={{ opacity: imageOpacity }}
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
