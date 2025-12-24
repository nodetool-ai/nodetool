import { Typography } from "@mui/material";
import { memo } from "react";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";

const StatusMessage = memo(function StatusMessage() {
  const { statusMessage, isWorkflowRunning } = useWebsocketRunner((state) => ({
    statusMessage: state.statusMessage,
    isWorkflowRunning: state.state === "running"
  }));

  if (!isWorkflowRunning) {return null;}

  return (
    <Typography
      className="status-message animating"
      variant="caption"
      color="inherit"
    >
      {statusMessage || ""}
    </Typography>
  );
});

export default StatusMessage;
