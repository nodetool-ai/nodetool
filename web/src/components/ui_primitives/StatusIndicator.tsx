/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css, keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import { GAP } from "./spacing";
import { MOTION, TYPOGRAPHY, reducedMotion } from "./tokens";
import { Tooltip } from "./Tooltip";
import { StatusDot, type StatusDotTone } from "./StatusDot";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningIcon from "@mui/icons-material/Warning";
import PendingIcon from "@mui/icons-material/Pending";

const pulseAnimation = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.4; }
  100% { opacity: 1; }
`;

const styles = (theme: Theme, pulse: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(GAP.tight),
    ".status-icon": {
      fontSize: 12,
      animation: pulse ? `${pulseAnimation} ${MOTION.pulse} infinite` : "none",
      ...reducedMotion({ animation: "none" })
    },
    ".status-label": TYPOGRAPHY.sans.caption
  });

const LABEL_STYLE = {
  small: TYPOGRAPHY.sans.caption,
  medium: TYPOGRAPHY.sans.label
} as const;

/**
 * `running` is work in flight (generating, rendering), `pending` is work
 * waiting its turn. See `GENERATION_STATUS` for the mapping of generated
 * items onto these.
 */
export type StatusType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "running"
  | "pending"
  | "default";

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
  /**
   * Label color. "status" tints the label like the dot; "muted" keeps the
   * label in secondary text so a wall of indicators stays quiet and only the
   * dot carries the color.
   */
  labelTone?: "status" | "muted";
  /** Optional tooltip */
  tooltip?: string;
  /** Size */
  size?: "small" | "medium";
  /** Custom class name */
  className?: string;
}

/** The same tones `StatusDot` and `StatusPill` use, so one state reads as one colour. */
const STATUS_DOT_TONE = {
  success: "success",
  error: "error",
  warning: "warning",
  info: "info",
  running: "primary",
  pending: "neutral",
  default: "neutral"
} satisfies Record<StatusType, StatusDotTone>;

const statusColors = {
  success: "success.main",
  error: "error.main",
  warning: "warning.main",
  info: "info.main",
  running: "primary.main",
  pending: "text.secondary",
  default: "text.secondary"
} satisfies Record<StatusType, string>;

const StatusIndicatorInternal: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  showIcon = true,
  filledIcon = false,
  pulse = false,
  labelTone = "status",
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
        case "running":
          return <PendingIcon className="status-icon" fontSize={iconSize} />;
        default:
          break;
      }
    }

    return (
      <StatusDot
        className="status-icon"
        tone={STATUS_DOT_TONE[status]}
        size="medium"
      />
    );
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
          ...LABEL_STYLE[size],
          color: labelTone === "muted" ? "text.secondary" : statusColors[status]
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
      <Tooltip title={tooltip}>
        {content}
      </Tooltip>
    );
  }

  return content;
};

const StatusIndicator = memo(StatusIndicatorInternal);

StatusIndicator.displayName = "StatusIndicator";

export { StatusIndicator };
export default StatusIndicator;
