import { Typography } from "@mui/material";
import { memo } from "react";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";

const StatusMessage = memo(function StatusMessage() {
  const statusMessage = useWebsocketRunner((state) => state.statusMessage);
  const runnerState = useWebsocketRunner((state) => state.state);
  const isActive =
    runnerState === "running" ||
    runnerState === "connecting" ||
    runnerState === "connected" ||
    runnerState === "paused" ||
    runnerState === "suspended";

  if (!isActive) {return null;}

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

StatusMessage.displayName = "StatusMessage";

export default StatusMessage;
