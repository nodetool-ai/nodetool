/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useState } from "react";
import {
  FlexRow,
  StatusIndicator,
  ToolbarIconButton
} from "../ui_primitives";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import { useWorkers } from "../../hooks/useWorkers";

/**
 * Status-bar attached-worker indicator. Renders only when the local NodeTool
 * instance has adopted a worker (`activeWorker`), showing which profile is live
 * and a one-click quick-stop so a forgotten, billing GPU is always one tap from
 * teardown.
 */
const WorkerStatusIndicator: React.FC = () => {
  const { activeWorker, stop } = useWorkers();
  const [stopping, setStopping] = useState(false);

  const handleStop = useCallback(async () => {
    if (!activeWorker) return;
    setStopping(true);
    try {
      await stop(activeWorker.id);
    } finally {
      setStopping(false);
    }
  }, [activeWorker, stop]);

  if (!activeWorker) {
    return null;
  }

  return (
    <FlexRow gap={1} align="center" className="worker-status-indicator">
      <StatusIndicator
        status="success"
        label={`Worker: ${activeWorker.profile_name}`}
        pulse
        tooltip={`Attached to ${activeWorker.id} (${activeWorker.ws_url})`}
      />
      <ToolbarIconButton
        ariaLabel="Stop attached worker"
        tooltip="Stop attached worker"
        onClick={handleStop}
        disabled={stopping}
      >
        <StopCircleIcon fontSize="small" />
      </ToolbarIconButton>
    </FlexRow>
  );
};

export default memo(WorkerStatusIndicator);
