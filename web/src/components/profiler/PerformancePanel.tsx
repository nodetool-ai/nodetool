/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Box } from "@mui/material";
import { Speed as SpeedIcon } from "@mui/icons-material";
import isEqual from "lodash/isEqual";
import { IDockviewPanelProps } from "dockview";
import WorkflowProfiler from "./WorkflowProfiler";

interface PerformancePanelProps extends IDockviewPanelProps {
  workflowId: string;
}

const PerformancePanel: React.FC<PerformancePanelProps> = ({
  workflowId,
}) => {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 1.5,
          py: 0.75,
          borderBottom: 1,
          borderColor: "divider",
          backgroundColor: "background.default",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SpeedIcon fontSize="small" color="primary" />
          <span style={{ fontWeight: 500, fontSize: "0.875rem" }}>Performance</span>
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflow: "auto" }}>
        <WorkflowProfiler workflowId={workflowId} />
      </Box>
    </Box>
  );
};

export default memo(PerformancePanel, isEqual);
