/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { Badge, BadgeProps } from "@mui/material";
import { Box } from "./Box";
import type { BoxProps } from "./Box";
import { SPACING, getSpacingPx } from "./spacing";
import { BORDER_RADIUS, MOTION } from "./tokens";
import { Tooltip } from "./Tooltip";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface CountBadgeProps {
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
  /**
   * Element to anchor the badge to. Without children the badge is a
   * standalone pill: place it with `sx`, e.g. absolute at a button's corner.
   */
  children?: React.ReactNode;
  /** Style overrides, applied to a standalone badge (no children). */
  sx?: BoxProps["sx"];
  /** Additional className */
  className?: string;
  /** Custom aria-label to override the default generated one */
  ariaLabel?: string;
}

const styles = (animate: boolean) => css`
  .notification-badge {
    .MuiBadge-badge {
      font-size: var(--fontSizeSmaller);
      font-weight: 600;
      min-width: 18px;
      height: 18px;
      padding: 0 ${getSpacingPx(SPACING.xs)};
      ${animate ? css`
        transition: transform ${MOTION.normal}, opacity ${MOTION.normal};
        
        &.MuiBadge-invisible {
          transform: scale(0);
          opacity: 0;
        }
      ` : ""}
    }
    
    &.small .MuiBadge-badge {
      font-size: var(--fontSizeSmaller);
      min-width: 16px;
      height: 16px;
      padding: 0 ${getSpacingPx(SPACING.micro)};
    }
    
    &.dot .MuiBadge-badge {
      min-width: 8px;
      height: 8px;
      padding: 0;
      border-radius: 50%;
    }
  }
`;

const CountBadgeInternal: React.FC<CountBadgeProps> = ({
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
  sx,
  className,
  ariaLabel
}) => {
  const { t } = useTranslation();
  const getAriaLabel = () => {
    if (ariaLabel) {
      return ariaLabel;
    }
    if (tooltip) {
      return tooltip;
    }

    // Provide a reasonable default for screen readers
    if (!showZero && count === 0) {
      return undefined;
    }

    if (dot) {
      return t("i18n-next92.countBadge.notificationNew", { count: 1 });
    }

    return count > max
      ? t("i18n-next92.countBadge.notificationMax", { max })
      : t("i18n-next92.countBadge.notificationNew", { count });
  };
  
  if (children === undefined) {
    if (!showZero && count === 0) {
      return null;
    }
    const side = getSpacingPx(
      dot ? SPACING.md : size === "small" ? SPACING.xl : SPACING.xl + SPACING.xs
    );
    return (
      <Box
        component="span"
        className={className}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        aria-hidden={ariaLabel ? undefined : true}
        sx={[
          {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            minWidth: side,
            height: side,
            px: dot ? SPACING.none : SPACING.xs,
            borderRadius: BORDER_RADIUS.pill,
            bgcolor: `${color}.main`,
            color: `${color}.contrastText`,
            fontSize: "var(--fontSizeSmaller)",
            fontWeight: 600,
            lineHeight: 1,
            flexShrink: 0
          },
          ...(Array.isArray(sx) ? sx : [sx])
        ]}
      >
        {dot ? null : count > max ? `${max}+` : count}
      </Box>
    );
  }

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
      aria-label={getAriaLabel()}
    >
      {children}
    </Badge>
  );
  
  if (tooltip) {
    return (
      <div className={`notification-badge-wrapper nodrag ${className || ""}`} css={styles(animate)}>
        <Tooltip title={tooltip} enterDelay={TOOLTIP_ENTER_DELAY}>
          {badgeContent}
        </Tooltip>
      </div>
    );
  }
  
  return (
    <div className={`notification-badge-wrapper nodrag ${className || ""}`} css={styles(animate)}>
      {badgeContent}
    </div>
  );
};

const CountBadge = memo(CountBadgeInternal);

CountBadge.displayName = "CountBadge";

export { CountBadge };
export default CountBadge;
