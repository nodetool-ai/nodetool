/**
 * Timeline Content Panel
 * The main timeline editing area with ruler, track lanes, and playhead
 */
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useRef, useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import { IDockviewPanelProps } from "dockview";
import useTimelineStore from "../../../stores/TimelineStore";
import TimeRuler from "../TimeRuler";
import TrackLane from "../TrackLane";
import Playhead from "../Playhead";
import { useTimelineAssetDrop } from "../../../hooks/timeline/useTimelineAssetDrop";
import { pixelsToTime } from "../../../utils/timelineUtils";
import { TimelinePanelProps } from "../timelinePanelConfig";

const styles = (theme: Theme) =>
  css({
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor:
      theme.vars?.palette?.background?.default ||
      theme.palette.background.default,
    // Add padding to clear Dockview's tab/drag overlay
    paddingTop: "1.75rem",

    ".timeline-ruler-container": {
      height: "30px",
      backgroundColor:
        theme.vars?.palette?.background?.paper ||
        theme.palette.background.paper,
      borderBottom: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`,
      overflow: "hidden"
    },

    ".timeline-tracks-wrapper": {
      flex: 1,
      display: "flex",
      overflow: "hidden",
      position: "relative"
    },

    ".timeline-tracks-scroll": {
      flex: 1,
      overflowX: "scroll",
      overflowY: "auto",
      position: "relative"
    },

    ".timeline-tracks-canvas": {
      position: "relative",
      minHeight: "100%"
    },

    ".loop-region-overlay": {
      position: "absolute",
      top: 0,
      bottom: 0,
      backgroundColor: "rgba(255, 193, 7, 0.08)",
      borderLeft: "1px dashed rgba(255, 193, 7, 0.5)",
      borderRight: "1px dashed rgba(255, 193, 7, 0.5)",
      pointerEvents: "none",
      zIndex: 5
    },

    ".timeline-drop-zone": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "200px",
      border: "2px dashed",
      borderColor: theme.vars?.palette?.divider || theme.palette.divider,
      borderRadius: theme.shape.borderRadius,
      margin: theme.spacing(2),
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      transition: "all 0.2s ease",
      gap: theme.spacing(1),

      "&.drag-over": {
        borderColor:
          theme.vars?.palette?.primary?.main || theme.palette.primary.main,
        backgroundColor: `rgba(${
          theme.vars?.palette?.primary?.mainChannel || "25, 118, 210"
        } / 0.1)`
      }
    }
  });

const TimelineContentPanel: React.FC<
  IDockviewPanelProps<TimelinePanelProps>
> = () => {
  const theme = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDropZoneDragOver, setIsDropZoneDragOver] = useState(false);

  const {
    project,
    viewport,
    playback,
    setScrollLeft,
    setViewportWidth,
    seek,
    setLoopRegion,
    toggleLoop,
    togglePlayback,
    stop,
    stepFrame
  } = useTimelineStore();

  const {
    handleDropOnTimeline,
    handleDragOver: onAssetDragOver,
    canAcceptDrop
  } = useTimelineAssetDrop();

  // Update viewport width on mount and resize
  useEffect(() => {
    const updateViewportWidth = () => {
      if (scrollContainerRef.current) {
        setViewportWidth(scrollContainerRef.current.clientWidth);
      }
    };

    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, [setViewportWidth]);

  // Handle horizontal scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      setScrollLeft(target.scrollLeft);
    },
    [setScrollLeft]
  );

  // Handle click on timeline to seek
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!scrollContainerRef.current || isScrolling) {
        return;
      }

      const rect = scrollContainerRef.current.getBoundingClientRect();
      const clickX =
        e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
      const time = clickX / viewport.pixelsPerSecond;

      seek(Math.max(0, time));
    },
    [viewport.pixelsPerSecond, seek, isScrolling]
  );

  // Handle mouse drag for scrubbing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!scrollContainerRef.current) return;

        setIsScrolling(true);
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const clickX =
          moveEvent.clientX - rect.left + scrollContainerRef.current.scrollLeft;
        const time = clickX / viewport.pixelsPerSecond;

        seek(Math.max(0, time));
      };

      const handleMouseUp = () => {
        setIsScrolling(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [viewport.pixelsPerSecond, seek]
  );

  // Handle zoom with mouse wheel
  useEffect(() => {
    const container = timelineContentRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const { pixelsPerSecond } = useTimelineStore.getState().viewport;
        const zoomDelta = e.deltaY > 0 ? -10 : 10;
        const newZoom = Math.max(10, Math.min(500, pixelsPerSecond + zoomDelta));
        useTimelineStore.getState().setZoom(newZoom);
      }
    };

    container.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true
    });
    return () => {
      container.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, []);

  // Keyboard shortcuts for timeline
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "i": {
          e.preventDefault();
          const currentEnd =
            playback.loopEnd > 0 ? playback.loopEnd : project?.duration || 60;
          setLoopRegion(playback.playheadPosition, currentEnd);
          break;
        }
        case "o":
          e.preventDefault();
          setLoopRegion(playback.loopStart, playback.playheadPosition);
          break;
        case "l":
          e.preventDefault();
          toggleLoop();
          break;
        case " ":
          e.preventDefault();
          togglePlayback();
          break;
        case "home":
          e.preventDefault();
          stop();
          break;
        case "arrowleft":
          e.preventDefault();
          stepFrame(-1);
          break;
        case "arrowright":
          e.preventDefault();
          stepFrame(1);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    playback.playheadPosition,
    playback.loopStart,
    playback.loopEnd,
    project?.duration,
    setLoopRegion,
    toggleLoop,
    togglePlayback,
    stop,
    stepFrame
  ]);

  const timelineWidth = project
    ? Math.max(
        project.duration * viewport.pixelsPerSecond,
        viewport.viewportWidth
      )
    : viewport.viewportWidth;

  const handleDropZoneDragOver = useCallback(
    (e: React.DragEvent) => {
      onAssetDragOver(e);
      if (canAcceptDrop(e)) {
        setIsDropZoneDragOver(true);
      }
    },
    [onAssetDragOver, canAcceptDrop]
  );

  const handleDropZoneDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDropZoneDragOver(false);
  }, []);

  const handleDropZoneDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDropZoneDragOver(false);

      const rect = scrollContainerRef.current?.getBoundingClientRect();
      let dropTime = 0;
      if (rect) {
        const scrollLeft = scrollContainerRef.current?.scrollLeft || 0;
        const dropX = e.clientX - rect.left + scrollLeft;
        dropTime = pixelsToTime(dropX, viewport.pixelsPerSecond);
      }

      handleDropOnTimeline(e, Math.max(0, dropTime));
    },
    [handleDropOnTimeline, viewport.pixelsPerSecond]
  );

  if (!project) {
    return (
      <Box css={styles(theme)} sx={{ alignItems: "center", justifyContent: "center" }}>
        <Typography color="text.secondary">Loading Timeline...</Typography>
      </Box>
    );
  }

  return (
    <Box ref={timelineContentRef} css={styles(theme)} className="timeline-content-panel">
      {/* Time ruler */}
      <div className="timeline-ruler-container">
        <TimeRuler
          scrollLeft={viewport.scrollLeft}
          pixelsPerSecond={viewport.pixelsPerSecond}
          duration={project.duration}
          frameRate={project.frameRate}
          width={timelineWidth}
        />
      </div>

      {/* Tracks scroll area */}
      <div className="timeline-tracks-wrapper">
        <div
          ref={scrollContainerRef}
          className="timeline-tracks-scroll"
          onScroll={handleScroll}
          onClick={handleTimelineClick}
          onMouseDown={handleMouseDown}
        >
          <div className="timeline-tracks-canvas" style={{ width: timelineWidth }}>
            {/* Loop region overlay */}
            {playback.loopEnabled && playback.loopEnd > playback.loopStart && (
              <div
                className="loop-region-overlay"
                style={{
                  left: playback.loopStart * viewport.pixelsPerSecond,
                  width:
                    (playback.loopEnd - playback.loopStart) *
                    viewport.pixelsPerSecond
                }}
              />
            )}

            {/* Render track lanes */}
            {project.tracks.map((track) => (
              <TrackLane
                key={track.id}
                track={track}
                pixelsPerSecond={viewport.pixelsPerSecond}
                scrollLeft={viewport.scrollLeft}
              />
            ))}

            {/* Empty state if no tracks */}
            {project.tracks.length === 0 && (
              <div
                className={`timeline-drop-zone ${isDropZoneDragOver ? "drag-over" : ""}`}
                onDragOver={handleDropZoneDragOver}
                onDragLeave={handleDropZoneDragLeave}
                onDrop={handleDropZoneDrop}
              >
                <Typography variant="body1" color="textSecondary" sx={{ mb: 1 }}>
                  Drop media files here
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Or click the <strong>+</strong> button in the toolbar to add a track.
                </Typography>
              </div>
            )}

            {/* Playhead */}
            <Playhead
              position={playback.playheadPosition}
              pixelsPerSecond={viewport.pixelsPerSecond}
              height="100%"
            />
          </div>
        </div>
      </div>
    </Box>
  );
};

export default TimelineContentPanel;

