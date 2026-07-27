import React, { memo, useMemo } from "react";
import BoltIcon from "@mui/icons-material/Bolt";
import { Box, Tooltip } from "../ui_primitives";
import { useRunningTriggers } from "../../serverState/useTriggers";
import { describeTriggerDisabledReason } from "@nodetool-ai/protocol";

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
  const label = stopped
    ? (describeTriggerDisabledReason(stopped.disabled_reason) ??
      "Trigger disabled")
    : failing
      ? `Trigger armed — last run failed: ${armed.find((r) => r.last_error)?.last_error}`
      : armed.length === 1
        ? "Trigger armed"
        : `${armed.length} triggers armed`;

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
        <BoltIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />
      </Box>
    </Tooltip>
  );
};

export const WorkflowTriggerIndicator = memo(WorkflowTriggerIndicatorInternal);
WorkflowTriggerIndicator.displayName = "WorkflowTriggerIndicator";

export default WorkflowTriggerIndicator;
