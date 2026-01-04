/**
 * Timeline Media Assets Panel
 * Dockview panel wrapper for the TimelineAssetBrowser component
 */
import React from "react";
import { IDockviewPanelProps } from "dockview";
import { Box } from "@mui/material";
import TimelineAssetBrowser from "../TimelineAssetBrowser";
import { TimelinePanelProps } from "../timelinePanelConfig";

const TimelineMediaPanel: React.FC<IDockviewPanelProps<TimelinePanelProps>> = () => {
  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        // Add padding to clear Dockview's tab/drag overlay
        pt: "1.75rem"
      }}
    >
      <TimelineAssetBrowser />
    </Box>
  );
};

export default TimelineMediaPanel;

