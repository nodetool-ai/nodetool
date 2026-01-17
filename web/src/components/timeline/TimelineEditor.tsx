/**
 * Timeline Editor
 * Main container for the video timeline editor using Dockview for panel layout
 */
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import { DockviewReact, DockviewReadyEvent, DockviewApi } from "dockview";
import useTimelineStore from "../../stores/TimelineStore";
import { useTimelineLayoutStore } from "../../stores/TimelineLayoutStore";
import TimelineToolbar from "./TimelineToolbar";
import { createTimelinePanelComponents } from "./timelinePanelComponents";
import { timelineDefaultLayout } from "./timelineDefaultLayout";

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

    ".timeline-toolbar-wrapper": {
      position: "relative",
      zIndex: 100,
      flexShrink: 0
    },

    ".timeline-dockview-container": {
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
      position: "relative",
      zIndex: 1
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
    }
  });

interface TimelineEditorProps {
  showPreview?: boolean;
}

const TimelineEditor: React.FC<TimelineEditorProps> = () => {
  const theme = useTheme();
  const dockviewApiRef = useRef<DockviewApi | null>(null);

  const { project, createProject } = useTimelineStore();
  const { layout: savedLayout, setLayout } = useTimelineLayoutStore();

  // Panel components (memoized)
  const panelComponents = useMemo(() => createTimelinePanelComponents(), []);

  // Initialize project if none exists
  useEffect(() => {
    if (!project) {
      createProject("Untitled Timeline");
    }
  }, [project, createProject]);

  // Save layout on changes
  const handleLayoutChange = useCallback(() => {
    if (dockviewApiRef.current) {
      const currentLayout = dockviewApiRef.current.toJSON();
      setLayout(currentLayout);
    }
  }, [setLayout]);

  // Dockview ready handler
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const { api } = event;
      dockviewApiRef.current = api;

      // Apply saved layout or default
      // Note: We use api.fromJSON directly instead of applyDockviewLayoutSafely
      // because that function is designed for dashboard layouts and would filter out timeline panels
      try {
        if (savedLayout) {
          api.fromJSON(savedLayout);
        } else {
          api.fromJSON(timelineDefaultLayout);
        }
      } catch (err) {
        console.warn("Failed to apply timeline layout, using default:", err);
        try {
          api.fromJSON(timelineDefaultLayout);
        } catch (fallbackErr) {
          console.error(
            "Failed to apply default timeline layout:",
            fallbackErr
          );
        }
      }

      // Subscribe to layout changes for persistence
      const disposable = api.onDidLayoutChange(handleLayoutChange);

      // Cleanup on unmount
      return () => {
        disposable.dispose();
      };
    },
    [savedLayout, handleLayoutChange]
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
      {/* Fixed Toolbar */}
      <div className="timeline-toolbar-wrapper">
        <TimelineToolbar />
      </div>

      {/* Dockview Panel Container */}
      <div className="timeline-dockview-container">
        <DockviewReact
          components={panelComponents}
          onReady={onReady}
          className="dockview-container"
        />
      </div>
    </Box>
  );
};

export default TimelineEditor;
