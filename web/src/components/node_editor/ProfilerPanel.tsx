/** @jsxImportSource @emotion/react */
import React from "react";
import { Box } from "@mui/material";
import { PerformanceProfiler } from "./PerformanceProfiler";
import { useRightPanelStore } from "../../stores/RightPanelStore";

interface ProfilerPanelProps {
  workflowId: string;
}

export const ProfilerPanel: React.FC<ProfilerPanelProps> = ({ workflowId }) => {
  const { panel } = useRightPanelStore();

  if (!panel.isVisible || panel.activeView !== "profiler") {
    return null;
  }

  return (
    <Box
      sx={{
        height: "100%",
        overflow: "auto",
        bgcolor: "background.paper",
      }}
    >
      <PerformanceProfiler workflowId={workflowId} />
    </Box>
  );
};

export default ProfilerPanel;
