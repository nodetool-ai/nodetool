/**
 * Card Component
 *
 * A card component with standardized styling, elevation, and padding.
 * Provides consistent card appearance across the application.
 */

import { memo, forwardRef } from "react";
import { Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { BORDER_RADIUS, MOTION, SHADOW, reducedMotion } from "./tokens";
import { SPACING } from "./spacing";
import { Text } from "./Text";
import { focusRing } from "./selectionStyles";
import { activateOnKey } from "./keyboardActivation";
import { isNumber } from "../../utils/typePredicates";

export interface CardProps extends BoxProps {
  /**
   * Padding size variant. Defaults to "normal", or "none" for the `inline`
   * variant, whose header, body and actions rows carry their own padding.
   */
  padding?: "none" | "compact" | "normal" | "comfortable" | "spacious" | number;
  /** Elevation/shadow level (0-24) */
  elevation?: number;
  /** Border variant */
  variant?: "default" | "outlined" | "elevated" | "inline";
  /**
   * Semantic tint, `inline` variant only. `info` frames the card in the info
   * colour on a faint info wash (a proposal awaiting review). `warning` adds a
   * 3px warning edge (something that needs a decision). Never decorative.
   */
  tone?: "default" | "info" | "warning";
  /** Corner radius. Defaults to "md", or "lg" for the `inline` variant. */
  radius?: "sm" | "md" | "lg";
  /** Hover effect */
  hoverable?: boolean;
  /** Clickable card */
  clickable?: boolean;
}

const PADDING_VARIANTS = {
  none: 0,
  compact: 1.5,
  normal: 2.5,
  comfortable: 3,
  spacious: 4
};

/**
 * Card - A card component with standardized styling
 * 
 * @example
 * // Basic card
 * <Card>
 *   <Typography>Card content</Typography>
 * </Card>
 * 
 * @example
 * // Outlined card with custom padding
 * <Card variant="outlined" padding="compact">
 *   <Typography>Compact card</Typography>
 * </Card>
 * 
 * @example
 * // Clickable/hoverable card
 * <Card hoverable clickable onClick={handleClick}>
 *   <Typography>Click me</Typography>
 * </Card>
 * 
 * @example
 * // Elevated card
 * <Card variant="elevated" elevation={8}>
 *   <Typography>Elevated content</Typography>
 * </Card>
 */
const CardInternal = forwardRef<HTMLDivElement, CardProps>(({
  padding,
  elevation = 1,
  variant = "default",
  tone = "default",
  radius,
  hoverable = false,
  clickable = false,
  sx,
  children,
  onClick,
  ...props
}, ref) => {
  const theme = useTheme();
  
  const isInline = variant === "inline";
  const resolvedPadding = padding ?? (isInline ? "none" : "normal");
  const paddingValue = isNumber(resolvedPadding)
    ? resolvedPadding
    : PADDING_VARIANTS[resolvedPadding];
  const resolvedRadius = radius ?? (isInline ? "lg" : "md");

  const getBorder = () => {
    if (isInline && tone === "info") {
      return `1px solid rgb(${theme.vars.palette.info.mainChannel} / 0.4)`;
    }
    if (variant === "outlined" || isInline) {
      return `1px solid ${theme.vars.palette.divider}`;
    }
    return undefined;
  };

  const getBoxShadow = () => {
    if (variant === "elevated" && elevation > 0) {
      const shadowIntensity = Math.min(elevation / 24, 1);
      return `0 ${elevation}px ${elevation * 2}px rgba(0, 0, 0, ${0.2 * shadowIntensity})`;
    }
    return undefined;
  };

  return (
    <Box
      ref={ref}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? activateOnKey<HTMLDivElement>((event) => event.currentTarget.click())
          : undefined
      }
      sx={{
        padding: theme.spacing(paddingValue),
        backgroundColor:
          isInline && tone === "info"
            ? `rgb(${theme.vars.palette.info.mainChannel} / 0.06)`
            : theme.vars.palette.background.paper,
        border: getBorder(),
        borderLeft:
          isInline && tone === "warning"
            ? `3px solid ${theme.vars.palette.warning.main}`
            : undefined,
        overflow: isInline ? "hidden" : undefined,
        // String token, not the numeric theme.shape.borderRadius: sx multiplies
        // bare numbers by the theme radius (6 × 6 = 36px), which is what made
        // cards balloon off-brand.
        borderRadius: BORDER_RADIUS[resolvedRadius],
        boxShadow: getBoxShadow(),
        cursor: clickable ? "pointer" : undefined,
        transition: hoverable || clickable
          ? `${MOTION.transform}, ${MOTION.shadow}, ${MOTION.background}`
          : undefined,
        "&:hover": hoverable || clickable
          ? {
              transform: "translateY(-2px)",
              boxShadow: SHADOW(theme).md,
              backgroundColor: theme.vars.palette.action.hover
            }
          : undefined,
        ...reducedMotion({
          transition: MOTION.none,
          "&:hover": { transform: "none" }
        }),
        "&:focus-visible": clickable ? focusRing(theme, 2) : undefined,
        ...sx
      }}
      {...props}
    >
      {children}
    </Box>
  );
});

export const Card = memo(CardInternal);
Card.displayName = "Card";

export interface CardHeaderProps extends BoxProps {
  /** Leading icon, already sized and tinted by the caller. */
  icon?: ReactNode;
  title: ReactNode;
  /** Secondary line under the title. */
  subtitle?: ReactNode;
  /** Trailing content, pushed to the right edge (an id, a badge). */
  trailing?: ReactNode;
  /** Draw a divider under the header. */
  divided?: boolean;
}

/** Header row of an `inline` Card: icon, title (+ subtitle), trailing slot. */
export const CardHeader = memo(function CardHeader({
  icon,
  title,
  subtitle,
  trailing,
  divided = false,
  sx,
  ...props
}: CardHeaderProps) {
  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        alignItems: "center",
        gap: theme.spacing(SPACING.md),
        padding: theme.spacing(SPACING.sm, SPACING.md),
        borderBottom: divided
          ? `1px solid ${theme.vars.palette.divider}`
          : undefined,
        ...(typeof sx === "function" ? sx(theme) : sx)
      })}
      {...props}
    >
      {icon}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Text component="div" size="small" weight={600}>
          {title}
        </Text>
        {subtitle && (
          <Text component="div" size="smaller" color="secondary">
            {subtitle}
          </Text>
        )}
      </Box>
      {trailing}
    </Box>
  );
});

/** Body of an `inline` Card. */
export const CardBody = memo(function CardBody({ sx, ...props }: BoxProps) {
  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing(SPACING.sm),
        padding: theme.spacing(SPACING.sm, SPACING.md),
        ...(typeof sx === "function" ? sx(theme) : sx)
      })}
      {...props}
    />
  );
});

/** Actions row of an `inline` Card, separated from the body by a divider. */
export const CardActions = memo(function CardActions({
  sx,
  ...props
}: BoxProps) {
  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: theme.spacing(SPACING.md),
        padding: theme.spacing(SPACING.md, SPACING.lg),
        borderTop: `1px solid ${theme.vars.palette.divider}`,
        ...(typeof sx === "function" ? sx(theme) : sx)
      })}
      {...props}
    />
  );
});
