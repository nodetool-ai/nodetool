import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TRIGGER_MAX_CONSECUTIVE_FAILURES } from "@nodetool-ai/protocol";
import BoltIcon from "@mui/icons-material/Bolt";
import { Box, Tooltip, ICON_SIZE } from "../ui_primitives";
import { useRunningTriggers } from "../../serverState/useTriggers";

interface WorkflowTriggerIndicatorProps {
  workflowId: string;
  className?: string;
}

/**
 * Bolt badge on a workflow row or card when that workflow has at least one
 * armed trigger — red when a registration carries a `last_error`, or when the
 * dispatcher disarmed one, which is the case a list has to surface loudest.
 *
 * Every instance reads the same `jobs.triggersRunning` query, so a list of
 * fifty workflows still makes one request.
 */
const WorkflowTriggerIndicatorInternal: React.FC<
  WorkflowTriggerIndicatorProps
> = ({ workflowId, className }) => {
  const { t } = useTranslation();
  const { data } = useRunningTriggers();
  const triggers = useMemo(
    () => (data ?? []).filter((r) => r.workflow_id === workflowId),
    [data, workflowId]
  );

  if (triggers.length === 0) {
    return null;
  }

  const stopped = triggers.find((r) => r.disabled_reason);
  const armed = triggers.filter((r) => r.enabled);
  const failing = Boolean(stopped) || armed.some((r) => r.last_error);
  const disabledReason = stopped?.disabled_reason;
  const label = stopped
    ? disabledReason === "failures"
      ? t("pass3_39.workflowTriggerIndicator.disabledAfterFailures", {
          count: TRIGGER_MAX_CONSECUTIVE_FAILURES
        })
      : disabledReason === "expired"
        ? t("pass3_39.workflowTriggerIndicator.disabledExpired")
        : disabledReason === "max_runs"
          ? t("pass3_39.workflowTriggerIndicator.disabledRunLimit")
          : t("pass3_39.workflowTriggerIndicator.disabled")
    : failing
      ? t("pass3_39.workflowTriggerIndicator.lastRunFailed", {
          error: armed.find((r) => r.last_error)?.last_error
        })
      : armed.length === 1
        ? t("pass3_39.workflowTriggerIndicator.armed")
        : t("pass3_39.workflowTriggerIndicator.armedCount", {
            count: armed.length
          });

  return (
    <Tooltip title={label} placement="top">
      <Box
        component="span"
        className={className}
        role="img"
        aria-label={label}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          color: failing ? "error.main" : "success.main"
        }}
      >
        <BoltIcon sx={{ fontSize: ICON_SIZE.sm }} />
      </Box>
    </Tooltip>
  );
};

export const WorkflowTriggerIndicator = memo(WorkflowTriggerIndicatorInternal);
WorkflowTriggerIndicator.displayName = "WorkflowTriggerIndicator";

export default WorkflowTriggerIndicator;
