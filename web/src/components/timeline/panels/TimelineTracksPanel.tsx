/**
 * Timeline Tracks Panel
 * Dockview panel wrapper for the TrackList component
 */
import React from "react";
import { IDockviewPanelProps } from "dockview";
import { Box } from "@mui/material";
import TrackList from "../TrackList";
import { TimelinePanelProps } from "../timelinePanelConfig";

const TimelineTracksPanel: React.FC<IDockviewPanelProps<TimelinePanelProps>> = () => {
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
      <TrackList />
    </Box>
  );
};

export default TimelineTracksPanel;

