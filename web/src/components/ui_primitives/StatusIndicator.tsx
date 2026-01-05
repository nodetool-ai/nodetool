/** @jsxImportSource @emotion/react */
import React from "react";
import { css, keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography, Tooltip } from "@mui/material";
import CircleIcon from "@mui/icons-material/Circle";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningIcon from "@mui/icons-material/Warning";
import PendingIcon from "@mui/icons-material/Pending";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const pulseAnimation = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.4; }
  100% { opacity: 1; }
`;

const styles = (theme: Theme, pulse: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(0.75),
    ".status-icon": {
      fontSize: 12,
      animation: pulse ? `${pulseAnimation} 2s infinite` : "none"
    },
    ".status-label": {
      fontSize: 12,
      fontWeight: 500
    }
  });

export type StatusType = "success" | "error" | "warning" | "info" | "pending" | "default";

export interface StatusIndicatorProps {
  /** Status type */
  status: StatusType;
  /** Optional label text */
  label?: string;
  /** Show icon */
  showIcon?: boolean;
  /** Use filled icon variant */
  filledIcon?: boolean;
  /** Pulse animation for pending/active states */
  pulse?: boolean;
  /** Optional tooltip */
  tooltip?: string;
  /** Size */
  size?: "small" | "medium";
  /** Custom class name */
  className?: string;
}

const statusColors: Record<StatusType, string> = {
  success: "success.main",
  error: "error.main",
  warning: "warning.main",
  info: "info.main",
  pending: "grey.500",
  default: "text.secondary"
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  showIcon = true,
  filledIcon = false,
  pulse = false,
  tooltip,
  size = "small",
  className
}) => {
  const theme = useTheme();

  const getIcon = () => {
    const iconSize = size === "small" ? "small" : "medium";
    
    if (filledIcon) {
      switch (status) {
        case "success":
          return <CheckCircleIcon className="status-icon" fontSize={iconSize} />;
        case "error":
          return <ErrorIcon className="status-icon" fontSize={iconSize} />;
        case "warning":
          return <WarningIcon className="status-icon" fontSize={iconSize} />;
        case "pending":
          return <PendingIcon className="status-icon" fontSize={iconSize} />;
        default:
          return <CircleIcon className="status-icon" fontSize={iconSize} />;
      }
    }
    
    return <CircleIcon className="status-icon" fontSize={iconSize} />;
  };

  const statusClassName = `status-indicator status-${status}${className ? ` ${className}` : ""}`;

  const content = (
    <Box
      css={styles(theme, pulse)}
      className={statusClassName}
      sx={{
        ".status-icon": {
          color: statusColors[status]
        },
        ".status-label": {
          color: statusColors[status],
          fontSize: size === "small" ? 12 : 14
        }
      }}
    >
      {showIcon && getIcon()}
      {label && (
        <Typography className="status-label" component="span">
          {label}
        </Typography>
      )}
    </Box>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} enterDelay={TOOLTIP_ENTER_DELAY}>
        {content}
      </Tooltip>
    );
  }

  return content;
};

export default StatusIndicator;
