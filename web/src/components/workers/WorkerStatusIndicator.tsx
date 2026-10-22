/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        label={t("screens4_8.workers.status.workerLabel", { name: activeWorker.profile_name })}
        pulse
        tooltip={t("screens4_8.workers.status.attachedTooltip", {
          id: activeWorker.id,
          url: activeWorker.ws_url
        })}
      />
      <ToolbarIconButton
        ariaLabel={t("screens4_8.workers.status.stopAttached")}
        tooltip={t("screens4_8.workers.status.stopAttached")}
        onClick={handleStop}
        loading={stopping}
      >
        <StopCircleIcon fontSize="small" />
      </ToolbarIconButton>
    </FlexRow>
  );
};

export default memo(WorkerStatusIndicator);
