import { memo } from "react";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { Caption } from "../ui_primitives";

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
    <Caption
      className="status-message animating"
      color="inherit"
    >
      {statusMessage || ""}
    </Caption>
  );
});

StatusMessage.displayName = "StatusMessage";

export default StatusMessage;
