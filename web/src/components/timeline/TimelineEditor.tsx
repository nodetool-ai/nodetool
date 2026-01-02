/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useRef, useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import useTimelineStore from "../../stores/TimelineStore";
import TimelineToolbar from "./TimelineToolbar";
import TimeRuler from "./TimeRuler";
import TrackList from "./TrackList";
import TrackLane from "./TrackLane";
import Playhead from "./Playhead";
import PreviewWindow from "./PreviewWindow";
import TimelineAssetBrowser from "./TimelineAssetBrowser";
import { useTimelineAssetDrop } from "../../hooks/timeline/useTimelineAssetDrop";
import { pixelsToTime } from "../../utils/timelineUtils";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    backgroundColor:
      theme.vars?.palette?.background?.default ||
      theme.palette.background.default,
    overflow: "hidden",
    userSelect: "none",

    ".timeline-main": {
      display: "flex",
      flex: 1,
      overflow: "hidden"
    },

    ".timeline-sidebar": {
      width: "200px",
      minWidth: "200px",
      backgroundColor:
        theme.vars?.palette?.background?.paper ||
        theme.palette.background.paper,
      borderRight: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`,
      display: "flex",
      flexDirection: "column"
    },

    ".timeline-sidebar-header": {
      height: "30px",
      borderBottom: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`,
      display: "flex",
      alignItems: "center",
      paddingLeft: theme.spacing(1),
      backgroundColor:
        theme.vars?.palette?.background?.paper || theme.palette.background.paper
    },

    ".timeline-content": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      position: "relative"
    },

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

    ".timeline-track-headers": {
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
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

    ".timeline-empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color:
        theme.vars?.palette?.text?.secondary || theme.palette.text.secondary,
      gap: theme.spacing(2)
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
    },

    ".timeline-bottom-panel": {
      display: "flex",
      height: "250px",
      borderTop: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`,
      backgroundColor:
        theme.vars?.palette?.background?.paper || theme.palette.background.paper
    },

    ".timeline-preview-container": {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(1)
    },

    ".timeline-asset-panel": {
      width: "280px",
      minWidth: "280px",
      borderLeft: `1px solid ${
        theme.vars?.palette?.divider || theme.palette.divider
      }`,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    }
  });

interface TimelineEditorProps {
  showPreview?: boolean;
}

const TimelineEditor: React.FC<TimelineEditorProps> = ({
  showPreview = true
}) => {
  const theme = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDropZoneDragOver, setIsDropZoneDragOver] = useState(false);
  const [showAssetBrowser, setShowAssetBrowser] = useState(true);

  const {
    project,
    viewport,
    playback,
    setScrollLeft,
    setViewportWidth,
    seek,
    createProject
  } = useTimelineStore();

  const {
    handleDropOnTimeline,
    handleDragOver: onAssetDragOver,
    canAcceptDrop
  } = useTimelineAssetDrop();

  // Initialize project if none exists
  useEffect(() => {
    if (!project) {
      createProject("Untitled Timeline");
    }
  }, [project, createProject]);

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
      if (e.button !== 0) {
        return;
      } // Only left click

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!scrollContainerRef.current) {
          return;
        }

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

  // Calculate total timeline width based on project duration
  const timelineWidth = project
    ? Math.max(
        project.duration * viewport.pixelsPerSecond,
        viewport.viewportWidth
      )
    : viewport.viewportWidth;

  // Drop zone handlers for empty state
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

      // Calculate drop position if dropped on track area
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
      <Box css={styles(theme)}>
        <div className="timeline-empty-state">
          <Typography variant="h6">Loading Timeline...</Typography>
        </div>
      </Box>
    );
  }

  return (
    <Box css={styles(theme)} className="timeline-editor">
      {/* Toolbar */}
      <TimelineToolbar />

      {/* Main timeline area */}
      <div className="timeline-main">
        {/* Sidebar with track headers */}
        <div className="timeline-sidebar">
          <div className="timeline-sidebar-header">
            <Typography variant="caption" color="textSecondary">
              Tracks
            </Typography>
          </div>
          <div className="timeline-track-headers">
            <TrackList />
          </div>
        </div>

        {/* Asset Browser Panel */}
        {showAssetBrowser && (
          <div className="timeline-asset-panel">
            <TimelineAssetBrowser
              onClose={() => setShowAssetBrowser(false)}
            />
          </div>
        )}

        {/* Timeline content */}
        <div className="timeline-content">
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
              <div
                className="timeline-tracks-canvas"
                style={{ width: timelineWidth }}
              >
                {/* Render track lanes */}
                {project.tracks.map((track) => (
                  <TrackLane
                    key={track.id}
                    track={track}
                    pixelsPerSecond={viewport.pixelsPerSecond}
                    scrollLeft={viewport.scrollLeft}
                  />
                ))}

                {/* Empty state if no tracks - also a drop zone */}
                {project.tracks.length === 0 && (
                  <div
                    className={`timeline-drop-zone ${
                      isDropZoneDragOver ? "drag-over" : ""
                    }`}
                    onDragOver={handleDropZoneDragOver}
                    onDragLeave={handleDropZoneDragLeave}
                    onDrop={handleDropZoneDrop}
                  >
                    <Typography
                      variant="body1"
                      color="textSecondary"
                      sx={{ mb: 1 }}
                    >
                      Drop media files here
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Or click the <strong>+</strong> button in the toolbar to
                      add a track, then drag assets from the Asset Browser.
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
        </div>
      </div>

      {/* Bottom panel with preview */}
      {showPreview && (
        <div className="timeline-bottom-panel">
          <div className="timeline-preview-container">
            <PreviewWindow />
          </div>
        </div>
      )}
    </Box>
  );
};

export default TimelineEditor;
