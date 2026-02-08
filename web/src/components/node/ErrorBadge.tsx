/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Badge, Tooltip, Box } from "@mui/material";
import { Error, Warning, Info } from "@mui/icons-material";
import useErrorStore from "../../stores/ErrorStore";

/**
 * Error severity levels for categorizing node errors
 */
export enum ErrorSeverity {
  CRITICAL = "critical",
  WARNING = "warning",
  INFO = "info"
}

/**
 * Determine error severity from error content
 */
const getErrorSeverity = (error: Error | string | null | Record<string, unknown>): ErrorSeverity => {
  if (!error) {
    return ErrorSeverity.INFO;
  }

  let errorText = "";
  if (typeof error === "string") {
    errorText = error.toLowerCase();
  } else if (error instanceof Error) {
    errorText = (error.message as string).toLowerCase();
  } else if (typeof error === "object" && "message" in error) {
    errorText = String((error as { message: string }).message).toLowerCase();
  }

  // Critical errors: failures, crashes, exceptions
  if (errorText.match(/failed|error|exception|crash|timeout|denied|forbidden/)) {
    return ErrorSeverity.CRITICAL;
  }

  // Warnings: deprecations, issues that don't block execution
  if (errorText.match(/warning|deprecated|retry|slow|large/)) {
    return ErrorSeverity.WARNING;
  }

  // Info: everything else
  return ErrorSeverity.INFO;
};

/**
 * Get error display properties based on severity
 */
const getSeverityProps = (severity: ErrorSeverity, theme: Theme) => {
  switch (severity) {
    case ErrorSeverity.CRITICAL:
      return {
        color: theme.vars.palette.error.main,
        icon: <Error />,
        label: "Critical Error"
      };
    case ErrorSeverity.WARNING:
      return {
        color: theme.vars.palette.warning.main,
        icon: <Warning />,
        label: "Warning"
      };
    case ErrorSeverity.INFO:
    default:
      return {
        color: theme.vars.palette.info.main,
        icon: <Info />,
        label: "Info"
      };
  }
};

interface ErrorBadgeProps {
  nodeId: string;
  workflowId: string;
  errorCount?: number;
}

/**
 * ErrorBadge displays a visual indicator on nodes when they have errors.
 *
 * Features:
 * - Color-coded by severity (critical=red, warning=orange, info=blue)
 * - Shows error count if multiple errors exist
 * - Tooltip with error summary on hover
 * - Positioned at top-right corner of node
 *
 * @param props - Component props
 * @returns Error badge component or null if no errors
 */
export const ErrorBadge: React.FC<ErrorBadgeProps> = memo(
  ({ nodeId, workflowId, errorCount }: ErrorBadgeProps) => {
    const theme = useTheme();

    const error = useErrorStore((state) =>
      workflowId !== undefined ? state.getError(workflowId, nodeId) : undefined
    );

    const severity = useMemo(() => (error ? getErrorSeverity(error) : ErrorSeverity.INFO), [error]);
    const severityProps = useMemo(
      () => getSeverityProps(severity, theme),
      [severity, theme]
    );

    if (!error) {
      return null;
    }

    let errorText = "";
    if (typeof error === "string") {
      errorText = error;
    } else if (error instanceof Error) {
      errorText = error.message as string;
    } else if (typeof error === "object" && "message" in error) {
      errorText = String((error as { message: string }).message);
    } else {
      errorText = JSON.stringify(error);
    }

    const truncatedError = errorText.length > 100
      ? `${errorText.substring(0, 100)}...`
      : errorText;

    const badgeContent = errorCount && errorCount > 1 ? errorCount : "!";

    return (
      <Tooltip
        title={
          <Box sx={{ maxWidth: 300 }}>
            <Box sx={{ fontWeight: "bold", mb: 0.5, display: "flex", alignItems: "center", gap: 0.5 }}>
              {severityProps.icon}
              {severityProps.label}
            </Box>
            <Box sx={{ fontSize: "0.8rem" }}>{truncatedError}</Box>
          </Box>
        }
        placement="top"
        arrow
      >
        <Badge
          badgeContent={badgeContent}
          color="error"
          sx={{
            position: "absolute",
            top: -8,
            right: -8,
            zIndex: 10,
            pointerEvents: "none",
            "& .MuiBadge-badge": {
              backgroundColor: severityProps.color,
              color: theme.vars.palette.background.paper,
              border: `2px solid ${theme.vars.palette.background.paper}`,
              fontWeight: "bold",
              fontSize: "0.65rem",
              height: 18,
              minWidth: 18,
              padding: "0 4px"
            }
          }}
        >
          <Box
            sx={{
              width: 0,
              height: 0
            }}
          />
        </Badge>
      </Tooltip>
    );
  }
);

ErrorBadge.displayName = "ErrorBadge";

export default ErrorBadge;
