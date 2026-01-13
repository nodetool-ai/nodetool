import React, { memo } from "react";
import { Typography, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useNodeTimingStore from "../../stores/NodeTimingStore";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";

interface NodeExecutionTimeProps {
  workflowId: string;
  nodeId: string;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
};

const NodeExecutionTime: React.FC<NodeExecutionTimeProps> = ({
  workflowId,
  nodeId
}) => {
  const theme = useTheme();
  const timing = useNodeTimingStore((state) =>
    state.getTiming(workflowId, nodeId)
  );

  if (!timing?.duration) {
    return null;
  }

  return (
    <Tooltip title="Execution time" placement="top" arrow>
      <Typography
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "2px",
          fontSize: "0.65rem",
          color: theme.vars?.palette?.text?.secondary ?? theme.palette.text.secondary,
          backgroundColor: theme.vars?.palette?.action?.hover ?? theme.palette.action.hover,
          padding: "1px 4px",
          borderRadius: "3px",
          fontFamily: "monospace",
          marginLeft: "4px",
          cursor: "default",
          "&:hover": {
            backgroundColor: theme.vars?.palette?.action?.selected ?? theme.palette.action.selected
          }
        }}
      >
        <TimerOutlinedIcon sx={{ fontSize: "0.75rem" }} />
        {formatDuration(timing.duration)}
      </Typography>
    </Tooltip>
  );
};

export default memo(NodeExecutionTime);
