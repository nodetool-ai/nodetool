import { Typography } from "@mui/material";
import { memo } from "react";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";

const StatusMessage = memo(function StatusMessage() {
  const statusMessage = useWebsocketRunner((state) => state.statusMessage);
  const runnerState = useWebsocketRunner((state) => state.state);
  const isWorkflowRunning = runnerState === "running";

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

export default memo(StatusMessage);
