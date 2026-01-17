/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { Typography, Box } from "@mui/material";
import isEqual from "lodash/isEqual";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";
import { formatDuration } from "../../utils/duration";

interface NodeExecutionTimeProps {
  nodeId: string;
  workflowId: string;
  status: string;
}

const NodeExecutionTime: React.FC<NodeExecutionTimeProps> = ({
  nodeId,
  workflowId,
  status
}) => {
  const duration = useExecutionTimeStore((state) =>
    state.getDuration(workflowId, nodeId)
  );

  const shouldShow = useMemo(
    () => status === "completed" || status === "error",
    [status]
  );

  if (!shouldShow || duration === undefined) {
    return null;
  }

  const isError = status === "error";

  return (
    <Box
      sx={{
        padding: "2px 8px",
        display: "flex",
        alignItems: "center",
        gap: "4px"
      }}
    >
      <Typography
        sx={{
          color: isError ? "error.main" : "success.main",
          fontSize: "0.7rem",
          fontWeight: 500
        }}
      >
        <span>{isError ? "Failed in" : "Completed in"}</span>
        <Box
          component="span"
          sx={{
            fontFamily: "monospace",
            fontWeight: 600,
            marginLeft: "4px"
          }}
        >
          {formatDuration(duration)}
        </Box>
      </Typography>
    </Box>
  );
};

export default memo(NodeExecutionTime, isEqual);
