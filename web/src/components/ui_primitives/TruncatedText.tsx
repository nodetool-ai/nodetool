/**
 * TruncatedText Component
 *
 * Text that automatically truncates with an ellipsis when it overflows.
 * Supports single-line truncation and multi-line clamping.
 * Replaces 116+ instances of manual textOverflow/ellipsis/nowrap patterns.
 */

import React from "react";
import { Typography, TypographyProps, Tooltip } from "@mui/material";

export interface TruncatedTextProps extends TypographyProps {
  /** Maximum number of lines before clamping (default: 1 for single-line ellipsis) */
  maxLines?: number;
  /** Show full text in a tooltip on hover */
  showTooltip?: boolean;
  /** Tooltip placement */
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
}

/**
 * TruncatedText - Text with automatic ellipsis truncation
 *
 * @example
 * // Single-line truncation
 * <TruncatedText>This long text will be truncated with an ellipsis</TruncatedText>
 *
 * @example
 * // Multi-line clamping
 * <TruncatedText maxLines={2}>
 *   This text will wrap to two lines and then show an ellipsis
 * </TruncatedText>
 *
 * @example
 * // With tooltip showing full text
 * <TruncatedText showTooltip>
 *   Hover to see the full text in a tooltip
 * </TruncatedText>
 */
export const TruncatedText = React.forwardRef<HTMLSpanElement, TruncatedTextProps>(({
  maxLines = 1,
  showTooltip = false,
  tooltipPlacement = "top",
  sx,
  children,
  ...props
}, ref) => {
  const truncateStyles = maxLines === 1
    ? {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }
    : {
        display: "-webkit-box",
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: "vertical" as const,
        overflow: "hidden",
        textOverflow: "ellipsis",
      };

  const typography = (
    <Typography
      ref={ref}
      sx={{
        ...truncateStyles,
        ...sx,
      }}
      {...props}
    >
      {children}
    </Typography>
  );

  if (showTooltip && typeof children === "string") {
    return (
      <Tooltip title={children} placement={tooltipPlacement}>
        {typography}
      </Tooltip>
    );
  }

  return typography;
});

TruncatedText.displayName = "TruncatedText";
