/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import useTimelineStore, { Clip as ClipType } from "../../stores/TimelineStore";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    top: "4px",
    bottom: "4px",
    borderRadius: "4px",
    overflow: "hidden",
    cursor: "pointer",
    transition: "box-shadow 0.15s ease",
    display: "flex",
    flexDirection: "column",

    "&:hover": {
      boxShadow: `0 0 0 2px ${theme.vars?.palette?.primary?.main || theme.palette.primary.main}40`
    },

    "&.selected": {
      boxShadow: `0 0 0 2px ${theme.vars?.palette?.primary?.main || theme.palette.primary.main}`
    },

    "&.dragging": {
      opacity: 0.8,
      cursor: "grabbing"
    },

    ".clip-header": {
      display: "flex",
      alignItems: "center",
      padding: "2px 6px",
      backgroundColor: "rgba(0, 0, 0, 0.3)",
      gap: "4px",
      minHeight: "18px"
    },

    ".clip-name": {
      fontSize: "0.65rem",
      fontWeight: 500,
      color: "#fff",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      flex: 1
    },

    ".clip-duration": {
      fontSize: "0.6rem",
      color: "rgba(255, 255, 255, 0.7)"
    },

    ".clip-content": {
      flex: 1,
      position: "relative",
      overflow: "hidden"
    },

    ".clip-handle": {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: "8px",
      cursor: "ew-resize",
      backgroundColor: "transparent",
      transition: "background-color 0.15s ease",
      zIndex: 10,

      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.3)"
      },

      "&.handle-left": {
        left: 0,
        borderTopLeftRadius: "4px",
        borderBottomLeftRadius: "4px"
      },

      "&.handle-right": {
        right: 0,
        borderTopRightRadius: "4px",
        borderBottomRightRadius: "4px"
      }
    },

    ".clip-fade-in": {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      background: "linear-gradient(90deg, rgba(0,0,0,0.5) 0%, transparent 100%)",
      pointerEvents: "none"
    },

    ".clip-fade-out": {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      background: "linear-gradient(270deg, rgba(0,0,0,0.5) 0%, transparent 100%)",
      pointerEvents: "none"
    }
  });

export interface ClipProps {
  clip: ClipType;
  trackId: string;
  isSelected: boolean;
  pixelsPerSecond: number;
  left: number;
  width: number;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent, clip: ClipType, trackId: string) => void;
  children?: React.ReactNode;
}

const Clip: React.FC<ClipProps> = ({
  clip,
  trackId,
  isSelected,
  pixelsPerSecond,
  left,
  width,
  onClick,
  onContextMenu,
  children
}) => {
  const theme = useTheme();
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isTrimming, setIsTrimming] = useState<"left" | "right" | null>(null);

  const {
    moveClip,
    trimClipStart,
    trimClipEnd,
    getSnappedTime
  } = useTimelineStore();

  // Handle clip drag (supports moving between tracks)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || clip.locked) {
      return;
    }
    
    e.stopPropagation();
    onClick(e);

    const startX = e.clientX;
    const startY = e.clientY;
    const startTime = clip.startTime;
    let currentTrackId = trackId;
    const TRACK_HEIGHT = 60; // Default track height

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const deltaTime = deltaX / pixelsPerSecond;
      const newStartTime = getSnappedTime(startTime + deltaTime, clip.id);
      
      // Calculate track change based on vertical movement
      const trackDelta = Math.round(deltaY / TRACK_HEIGHT);
      
      // Get the new track ID if moving vertically
      const project = useTimelineStore.getState().project;
      if (project && trackDelta !== 0) {
        const currentTrackIndex = project.tracks.findIndex(t => t.id === currentTrackId);
        const newTrackIndex = Math.max(0, Math.min(project.tracks.length - 1, currentTrackIndex + trackDelta));
        const newTrack = project.tracks[newTrackIndex];
        
        // Only move to tracks of the same type
        if (newTrack && newTrack.type === clip.type && !newTrack.locked) {
          currentTrackId = newTrack.id;
        }
      }
      
      setIsDragging(true);
      moveClip(trackId, clip.id, currentTrackId, newStartTime);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [clip, trackId, pixelsPerSecond, moveClip, getSnappedTime, onClick]);

  // Handle trim left
  const handleTrimLeftMouseDown = useCallback((e: React.MouseEvent) => {
    if (clip.locked) {
      return;
    }
    
    e.stopPropagation();
    const startX = e.clientX;
    const startTime = clip.startTime;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pixelsPerSecond;
      const newStartTime = getSnappedTime(startTime + deltaTime, clip.id);
      
      setIsTrimming("left");
      trimClipStart(trackId, clip.id, newStartTime);
    };

    const handleMouseUp = () => {
      setIsTrimming(null);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [clip, trackId, pixelsPerSecond, trimClipStart, getSnappedTime]);

  // Handle trim right
  const handleTrimRightMouseDown = useCallback((e: React.MouseEvent) => {
    if (clip.locked) {
      return;
    }
    
    e.stopPropagation();
    const startX = e.clientX;
    const endTime = clip.startTime + clip.duration;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pixelsPerSecond;
      const newEndTime = getSnappedTime(endTime + deltaTime, clip.id);
      
      setIsTrimming("right");
      trimClipEnd(trackId, clip.id, newEndTime);
    };

    const handleMouseUp = () => {
      setIsTrimming(null);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [clip, trackId, pixelsPerSecond, trimClipEnd, getSnappedTime]);

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      onContextMenu(e, clip, trackId);
    }
  }, [clip, trackId, onContextMenu]);

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    if (seconds < 1) {
      return `${Math.round(seconds * 1000)}ms`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
    return `${secs}s`;
  };

  const classNames = [
    "clip",
    isSelected ? "selected" : "",
    isDragging ? "dragging" : "",
    isTrimming ? "trimming" : ""
  ].filter(Boolean).join(" ");

  // Calculate fade indicator widths
  const fadeInWidth = clip.fadeIn ? (clip.fadeIn / clip.duration) * 100 : 0;
  const fadeOutWidth = clip.fadeOut ? (clip.fadeOut / clip.duration) * 100 : 0;

  return (
    <Box
      ref={clipRef}
      css={styles(theme)}
      className={classNames}
      style={{
        left,
        width: Math.max(width, 20), // Minimum width for visibility
        backgroundColor: clip.color || "#666"
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      {/* Left trim handle */}
      <div
        className="clip-handle handle-left"
        onMouseDown={handleTrimLeftMouseDown}
      />

      {/* Header */}
      <div className="clip-header">
        <Typography className="clip-name" title={clip.name}>
          {clip.name}
        </Typography>
        <Typography className="clip-duration">
          {formatDuration(clip.duration)}
        </Typography>
      </div>

      {/* Content area */}
      <div className="clip-content">
        {children}

        {/* Fade indicators */}
        {fadeInWidth > 0 && (
          <div
            className="clip-fade-in"
            style={{ width: `${fadeInWidth}%` }}
          />
        )}
        {fadeOutWidth > 0 && (
          <div
            className="clip-fade-out"
            style={{ width: `${fadeOutWidth}%` }}
          />
        )}
      </div>

      {/* Right trim handle */}
      <div
        className="clip-handle handle-right"
        onMouseDown={handleTrimRightMouseDown}
      />
    </Box>
  );
};

export default React.memo(Clip);
