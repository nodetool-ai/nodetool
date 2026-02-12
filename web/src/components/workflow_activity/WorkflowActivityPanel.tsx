import React from "react";
import { Box, Typography, alpha, useTheme } from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { WorkflowActivityLog } from "./WorkflowActivityLog";
import type { SxProps } from "@mui/system";

export interface WorkflowActivityPanelProps {
  /** Filter to show only executions for this workflow */
  workflowId?: string;
  /** Height of the panel */
  height?: number | string;
  /** Callback when panel should close */
  onClose?: () => void;
  /** Optional sx prop for custom styling */
  sx?: SxProps;
}

/**
 * WorkflowActivityPanel is a standalone panel component that displays
 * workflow execution history. Can be used as a side panel,
 * bottom panel, or in a dialog.
 *
 * @example
 * ```tsx
 * <WorkflowActivityPanel
 *   workflowId="wf-123"
 *   height={500}
 *   onClose={() => setShowActivity(false)}
 * />
 * ```
 */
export const WorkflowActivityPanel: React.FC<WorkflowActivityPanelProps> = ({
  workflowId,
  height = 500,
  onClose,
  sx
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height,
        bgcolor: theme.vars.palette.background.paper,
        border: `1px solid ${alpha(theme.vars.palette.common.black, 0.12)}`,
        borderRadius: theme.shape.borderRadius,
        overflow: "hidden",
        ...sx
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          borderBottom: `1px solid ${alpha(theme.vars.palette.common.black, 0.12)}`
        }}
      >
        <Typography variant="h6" component="h2">
          Activity Log
        </Typography>
        {onClose && (
          <CloseIcon
            sx={{
              cursor: "pointer",
              color: theme.vars.palette.action.active,
              "&:hover": {
                color: theme.vars.palette.action.hover
              }
            }}
            onClick={onClose}
          />
        )}
      </Box>

      {/* Content */}
      <WorkflowActivityLog
        workflowId={workflowId}
        height="calc(100% - 50px)"
        sx={{ height: "calc(100% - 50px)" }}
      />
    </Box>
  );
};
