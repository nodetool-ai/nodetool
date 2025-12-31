/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useRef, useCallback } from "react";
import { Box } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import useTimelineStore from "../../stores/TimelineStore";
import { timeToPixels } from "../../utils/timelineUtils";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 0,
    width: "2px",
    backgroundColor: theme.palette.error.main,
    zIndex: 1000,
    pointerEvents: "none",
    transform: "translateX(-50%)",

    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: 0,
      height: 0,
      borderLeft: "8px solid transparent",
      borderRight: "8px solid transparent",
      borderTop: `10px solid ${theme.palette.error.main}`
    },

    "&::after": {
      content: '""',
      position: "absolute",
      bottom: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: 0,
      height: 0,
      borderLeft: "6px solid transparent",
      borderRight: "6px solid transparent",
      borderBottom: `8px solid ${theme.palette.error.main}`
    },

    ".playhead-line": {
      position: "absolute",
      top: "10px",
      bottom: "8px",
      width: "2px",
      backgroundColor: theme.palette.error.main,
      boxShadow: `0 0 4px ${theme.palette.error.main}`
    }
  });

interface PlayheadProps {
  position: number;       // Time in seconds
  pixelsPerSecond: number;
  height: string | number;
}

const Playhead: React.FC<PlayheadProps> = ({
  position,
  pixelsPerSecond,
  height
}) => {
  const theme = useTheme();
  const playheadRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const { playback, project, seek, scrollToTime } = useTimelineStore();

  // Animate playhead during playback
  useEffect(() => {
    if (!playback.isPlaying || !project) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const frameDuration = 1000 / project.frameRate;
    lastTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - lastTimeRef.current;
      
      if (elapsed >= frameDuration) {
        const newPosition = playback.playheadPosition + (elapsed / 1000);
        lastTimeRef.current = currentTime;

        // Check for loop
        if (playback.loopEnabled && newPosition >= playback.loopEnd) {
          seek(playback.loopStart);
        } else if (newPosition >= project.duration) {
          // Stop at end
          seek(project.duration);
          useTimelineStore.getState().pause();
          return;
        } else {
          seek(newPosition);
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [
    playback.isPlaying,
    playback.loopEnabled,
    playback.loopStart,
    playback.loopEnd,
    playback.playheadPosition,
    project,
    seek
  ]);

  // Auto-scroll to follow playhead during playback
  useEffect(() => {
    if (playback.isPlaying) {
      const { viewport } = useTimelineStore.getState();
      const playheadPixels = position * pixelsPerSecond;
      const viewStart = viewport.scrollLeft;
      const viewEnd = viewport.scrollLeft + viewport.viewportWidth;

      // Scroll if playhead is near the edge
      if (playheadPixels > viewEnd - 50) {
        scrollToTime(position);
      }
    }
  }, [position, pixelsPerSecond, playback.isPlaying, scrollToTime]);

  const left = timeToPixels(position, pixelsPerSecond);

  return (
    <Box
      ref={playheadRef}
      css={styles(theme)}
      className="playhead"
      style={{
        left,
        height
      }}
    >
      <div className="playhead-line" />
    </Box>
  );
};

export default React.memo(Playhead);
