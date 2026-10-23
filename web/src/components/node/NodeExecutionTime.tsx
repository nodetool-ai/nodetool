/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  StatusPill,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  Z_INDEX
} from "../ui_primitives";
import isEqual from "../../utils/isEqual";
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

// The pill tint is translucent, so it sits on the node surface to stay
// readable over canvas grid lines and edges.
const ROW_SX = {
  position: "absolute" as const,
  bottom: `calc(100% + ${getSpacingPx(SPACING.xs)})`,
  right: getSpacingPx(SPACING.md),
  borderRadius: BORDER_RADIUS.pill,
  backgroundColor: "var(--c_node_bg)",
  zIndex: Z_INDEX.toast
};

const NodeExecutionTime: React.FC<NodeExecutionTimeProps> = ({
  nodeId,
  workflowId,
  status
}) => {
  const { t } = useTranslation();
  const duration = useNodeExecutionDuration(workflowId, nodeId);

  const shouldShow = status === "completed" || status === "error";

  if (!shouldShow || duration === undefined) {
    return null;
  }

  const isError = status === "error";

  return (
    <Box className="node-execution-indicator" sx={ROW_SX}>
      <StatusPill tone={isError ? "failed" : "done"}>
        {isError
          ? t("i18n-next66.node.nodeExecutionTime.failedIn")
          : t("i18n-next66.node.nodeExecutionTime.completedIn")}
        &nbsp;{formatDuration(duration)}
      </StatusPill>
    </Box>
  );
};

export default memo(NodeExecutionTime, isEqual);
