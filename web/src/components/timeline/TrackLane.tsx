/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState } from "react";
import { Box } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import useTimelineStore, { Track, Clip } from "../../stores/TimelineStore";
import AudioClip from "./AudioClip";
import VideoClip from "./VideoClip";
import ImageClip from "./ImageClip";
import { timeToPixels, pixelsToTime } from "../../utils/timelineUtils";
import { useTimelineAssetDrop } from "../../hooks/timeline/useTimelineAssetDrop";

const styles = (theme: Theme) =>
  css({
    position: "relative",
    borderBottom: `1px solid ${theme.vars?.palette?.divider || theme.palette.divider}`,
    backgroundColor: theme.vars?.palette?.background?.default || theme.palette.background.default,

    "&.muted": {
      opacity: 0.5
    },

    "&.locked": {
      pointerEvents: "none",
      opacity: 0.7
    },

    ".track-background": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      pointerEvents: "none"
    },

    ".track-clips": {
      position: "relative",
      height: "100%"
    },

    "&.drag-over": {
      outline: "2px dashed",
      outlineColor: "var(--palette-primary-main)",
      outlineOffset: "-2px",
      backgroundColor: "rgba(var(--palette-primary-mainChannel) / 0.1)"
    }
  });

interface TrackLaneProps {
  track: Track;
  pixelsPerSecond: number;
  scrollLeft: number;
}

const TrackLane: React.FC<TrackLaneProps> = ({
  track,
  pixelsPerSecond,
  scrollLeft
}) => {
  const theme = useTheme();
  const [isDragOver, setIsDragOver] = useState(false);
  const trackRef = React.useRef<HTMLDivElement>(null);

  const { selection, selectClip } = useTimelineStore();
  const {
    handleDropOnTrack,
    handleDragOver: onDragOver,
    canAcceptDrop
  } = useTimelineAssetDrop();

  const handleClipClick = useCallback((clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const addToSelection = e.shiftKey || e.metaKey || e.ctrlKey;
    selectClip(clipId, addToSelection);
  }, [selectClip]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    onDragOver(e);
    if (canAcceptDrop(e) && !track.locked) {
      setIsDragOver(true);
    }
  }, [onDragOver, canAcceptDrop, track.locked]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (canAcceptDrop(e) && !track.locked) {
      setIsDragOver(true);
    }
  }, [canAcceptDrop, track.locked]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only set to false if we're leaving the track, not entering a child
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!trackRef.current?.contains(relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (track.locked) {
      return;
    }

    // Calculate drop position in time
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const dropX = e.clientX - rect.left + scrollLeft;
    const dropTime = pixelsToTime(dropX, pixelsPerSecond);

    handleDropOnTrack(e, track.id, Math.max(0, dropTime));
  }, [handleDropOnTrack, track.id, track.locked, pixelsPerSecond, scrollLeft]);

  const renderClip = (clip: Clip) => {
    const isSelected = selection.selectedClipIds.includes(clip.id);
    const left = timeToPixels(clip.startTime, pixelsPerSecond);
    const width = timeToPixels(clip.duration, pixelsPerSecond);

    const commonProps = {
      clip,
      trackId: track.id,
      isSelected,
      pixelsPerSecond,
      left,
      width,
      onClick: (e: React.MouseEvent) => handleClipClick(clip.id, e)
    };

    switch (clip.type) {
      case "audio":
        return <AudioClip key={clip.id} {...commonProps} />;
      case "video":
        return <VideoClip key={clip.id} {...commonProps} />;
      case "image":
        return <ImageClip key={clip.id} {...commonProps} />;
      default:
        return null;
    }
  };

  const classNames = [
    "track-lane",
    track.muted ? "muted" : "",
    track.locked ? "locked" : "",
    isDragOver ? "drag-over" : ""
  ].filter(Boolean).join(" ");

  return (
    <Box
      ref={trackRef}
      css={styles(theme)}
      className={classNames}
      style={{ height: track.height }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Background */}
      <div className="track-background" />

      {/* Clips */}
      <div className="track-clips">
        {track.clips.map(clip => renderClip(clip))}
      </div>
    </Box>
  );
};

export default React.memo(TrackLane);
