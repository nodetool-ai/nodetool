/**
 * Timeline Preview Panel
 * Dockview panel wrapper for the PreviewWindow component
 */
import React from "react";
import { IDockviewPanelProps } from "dockview";
import { Box } from "@mui/material";
import PreviewWindow from "../PreviewWindow";
import { TimelinePanelProps } from "../timelinePanelConfig";

const TimelinePreviewPanel: React.FC<
  IDockviewPanelProps<TimelinePanelProps>
> = () => {
  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 1,
        pt: "1.75rem"
      }}
    >
      <PreviewWindow />
    </Box>
  );
};

export default TimelinePreviewPanel;
