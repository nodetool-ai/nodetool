/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
import { Box } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import useTimelineStore, { Track, Clip } from "../../stores/TimelineStore";
import AudioClip from "./AudioClip";
import VideoClip from "./VideoClip";
import ImageClip from "./ImageClip";
import { timeToPixels } from "../../utils/timelineUtils";

const styles = (theme: Theme) =>
  css({
    position: "relative",
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,

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

  const { selection, selectClip } = useTimelineStore();

  const handleClipClick = useCallback((clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const addToSelection = e.shiftKey || e.metaKey || e.ctrlKey;
    selectClip(clipId, addToSelection);
  }, [selectClip]);

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
    track.locked ? "locked" : ""
  ].filter(Boolean).join(" ");

  return (
    <Box
      css={styles(theme)}
      className={classNames}
      style={{ height: track.height }}
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
