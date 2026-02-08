/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Badge, BadgeProps, Tooltip } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface NotificationBadgeProps {
  /** The count to display */
  count: number;
  /** Maximum count to show (displays "max+" for higher values) */
  max?: number;
  /** Badge color */
  color?: "primary" | "secondary" | "error" | "info" | "success" | "warning";
  /** Whether to show zero values */
  showZero?: boolean;
  /** Whether the badge is a dot instead of a number */
  dot?: boolean;
  /** Position of the badge */
  anchorOrigin?: BadgeProps["anchorOrigin"];
  /** Tooltip text */
  tooltip?: string;
  /** Size variant */
  size?: "small" | "medium";
  /** Whether to animate on change */
  animate?: boolean;
  /** Children to wrap */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

const styles = (theme: Theme, animate: boolean) => css`
  .notification-badge {
    .MuiBadge-badge {
      font-size: 11px;
      font-weight: 600;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      ${animate ? css`
        transition: transform 0.2s ease, opacity 0.2s ease;
        
        &.MuiBadge-invisible {
          transform: scale(0);
          opacity: 0;
        }
      ` : ""}
    }
    
    &.small .MuiBadge-badge {
      font-size: 10px;
      min-width: 16px;
      height: 16px;
      padding: 0 3px;
    }
    
    &.dot .MuiBadge-badge {
      min-width: 8px;
      height: 8px;
      padding: 0;
      border-radius: 50%;
    }
  }
`;

const NotificationBadgeInternal: React.FC<NotificationBadgeProps> = ({
  count,
  max = 99,
  color = "error",
  showZero = false,
  dot = false,
  anchorOrigin = { vertical: "top", horizontal: "right" },
  tooltip,
  size = "medium",
  animate = true,
  children,
  className
}) => {
  const theme = useTheme();
  
  const badgeContent = (
    <Badge
      className={`notification-badge ${size} ${dot ? "dot" : ""}`}
      badgeContent={dot ? undefined : count}
      max={max}
      color={color}
      showZero={showZero}
      variant={dot ? "dot" : "standard"}
      anchorOrigin={anchorOrigin}
      invisible={!showZero && count === 0}
    >
      {children}
    </Badge>
  );
  
  if (tooltip) {
    return (
      <div className={`notification-badge-wrapper nodrag ${className || ""}`} css={styles(theme, animate)}>
        <Tooltip title={tooltip} enterDelay={TOOLTIP_ENTER_DELAY}>
          {badgeContent}
        </Tooltip>
      </div>
    );
  }
  
  return (
    <div className={`notification-badge-wrapper nodrag ${className || ""}`} css={styles(theme, animate)}>
      {badgeContent}
    </div>
  );
};

const NotificationBadge = memo(NotificationBadgeInternal);

NotificationBadge.displayName = "NotificationBadge";

export { NotificationBadge };
export default NotificationBadge;
