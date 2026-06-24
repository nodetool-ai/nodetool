/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import {
  Text,
  FlexRow,
  Box,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import isEqual from "fast-deep-equal";
import { useNodeExecutionDuration } from "../../hooks/nodes/useNodeExecState";

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

const DURATION_SPAN_SX = {
  fontFamily: "monospace",
  fontWeight: 600,
  marginLeft: getSpacingPx(SPACING.xs)
};

const ROW_SX_BASE = {
  position: "absolute" as const,
  top: -20,
  right: 4,
  padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
  borderRadius: BORDER_RADIUS.xs,
  zIndex: 1000,
  boxShadow: 1
};

const ROW_SX_SUCCESS = { ...ROW_SX_BASE, backgroundColor: "success.dark" };
const ROW_SX_ERROR = { ...ROW_SX_BASE, backgroundColor: "error.dark" };
const TEXT_SX_SUCCESS = { color: "success.contrastText", whiteSpace: "nowrap" };
const TEXT_SX_ERROR = { color: "error.contrastText", whiteSpace: "nowrap" };

const NodeExecutionTime: React.FC<NodeExecutionTimeProps> = ({
  nodeId,
  workflowId,
  status
}) => {
  const duration = useNodeExecutionDuration(workflowId, nodeId);

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
      sx={isError ? ROW_SX_ERROR : ROW_SX_SUCCESS}
    >
      <Text
        size="smaller"
        weight={500}
        sx={isError ? TEXT_SX_ERROR : TEXT_SX_SUCCESS}
      >
        {isError ? "Failed in" : "Completed in"}
        <Box
          component="span"
          sx={DURATION_SPAN_SX}
        >
          {formatDuration(duration)}
        </Box>
      </Text>
    </FlexRow>
  );
};

export default memo(NodeExecutionTime, isEqual);
