import { memo, useCallback } from "react";
import { Tooltip, IconButton, Badge } from "@mui/material";
import { ErrorOutlined } from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useWorkflowErrorPanelStore from "../../stores/WorkflowErrorPanelStore";
import useErrorStore from "../../stores/ErrorStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

/**
 * ErrorPanelButton is a toolbar button that toggles the workflow error panel.
 *
 * Features:
 * - Shows error count badge when errors exist
 * - Tooltip with current error count
 * - Opens/closes the error panel on click
 *
 * @returns Error panel toggle button
 */
export const ErrorPanelButton = memo(() => {
  const { togglePanel, isOpen } = useWorkflowErrorPanelStore();
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);

  // Count errors for current workflow
  const errorCount = useErrorStore((state) => {
    if (!currentWorkflowId) {
      return 0;
    }
    return Object.entries(state.errors).filter(([key]) =>
      key.startsWith(`${currentWorkflowId}:`)
    ).length;
  });

  const handleClick = useCallback(() => {
    togglePanel();
  }, [togglePanel]);

  return (
    <Tooltip
      title={`Workflow Errors (${errorCount})`}
      enterDelay={TOOLTIP_ENTER_DELAY}
      arrow
    >
      <IconButton
        onClick={handleClick}
        color={isOpen ? "primary" : "default"}
        sx={{
          position: "relative"
        }}
      >
        <Badge
          badgeContent={errorCount > 0 ? errorCount : 0}
          color="error"
          sx={{
            "& .MuiBadge-badge": {
              fontSize: "0.65rem",
              height: 16,
              minWidth: 16
            }
          }}
        >
          <ErrorOutlined />
        </Badge>
      </IconButton>
    </Tooltip>
  );
});

ErrorPanelButton.displayName = "ErrorPanelButton";

export default ErrorPanelButton;
