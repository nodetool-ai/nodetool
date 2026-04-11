/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { Box } from "@mui/material";
import { Text, FlexRow } from "../ui_primitives";
import isEqual from "fast-deep-equal";
import useExecutionTimeStore from "../../stores/ExecutionTimeStore";

interface NodeExecutionTimeProps {
  nodeId: string;
  workflowId: string;
  status?: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    const remainderMs = ms % 1000;
    if (remainderMs === 0) {
      return `${seconds}s`;
    }
    return `${seconds}s ${remainderMs}ms`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  if (remainderSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainderSeconds}s`;
};

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
    <FlexRow
      className="node-execution-indicator"
      align="center"
      gap={0.5}
      sx={{
        position: "absolute",
        top: -20,
        right: 4,
        padding: "2px 8px",
        backgroundColor: isError ? "error.dark" : "success.dark",
        borderRadius: 1,
        zIndex: 1000,
        boxShadow: 1
      }}
    >
      <Text
        size="smaller"
        weight={500}
        sx={{
          color: isError ? "error.contrastText" : "success.contrastText",
          whiteSpace: "nowrap"
        }}
      >
        {isError ? "Failed in" : "Completed in"}
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
      </Text>
    </FlexRow>
  );
};

export default memo(NodeExecutionTime, isEqual);
