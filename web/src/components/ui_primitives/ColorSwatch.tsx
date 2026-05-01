/**
 * ColorSwatch Component
 *
 * A clickable color swatch/indicator for color pickers and palettes.
 * Extracts repeated color-swatch patterns from SwatchPanel and similar components.
 */

import React from "react";
import { Box, BoxProps, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface ColorSwatchProps extends Omit<BoxProps, 'color' | 'onClick'> {
  /** Color value (any valid CSS color) */
  color: string;
  /** Swatch size in pixels */
  size?: number;
  /** Whether the swatch is selected */
  selected?: boolean;
  /** Click handler */
  onClick?: (color: string) => void;
  /** Show color value as tooltip */
  showTooltip?: boolean;
  /** Custom tooltip text */
  tooltip?: string;
  /** Border radius in pixels */
  borderRadius?: number;
  /** Shape variant */
  shape?: "square" | "circle";
}

/**
 * ColorSwatch - A clickable color indicator
 *
 * @example
 * // Basic swatch
 * <ColorSwatch color="#ff0000" onClick={handleColorSelect} />
 *
 * @example
 * // Selected state with tooltip
 * <ColorSwatch color="#00ff00" selected showTooltip />
 *
 * @example
 * // Circle swatch
 * <ColorSwatch color="rgb(0,0,255)" shape="circle" size={32} />
 *
 * @example
 * // In a grid
 * <FlexRow gap={0.5} wrap>
 *   {colors.map(c => <ColorSwatch key={c} color={c} onClick={setColor} />)}
 * </FlexRow>
 */
export const ColorSwatch: React.FC<ColorSwatchProps> = ({
  color,
  size = 24,
  selected = false,
  onClick,
  showTooltip = false,
  tooltip,
  borderRadius,
  shape = "square",
  sx,
  ...props
}) => {
  const theme = useTheme();

  const radius =
    borderRadius ??
    (shape === "circle" ? theme.rounded.circle : theme.rounded.sm);

  const handleClick = () => {
    onClick?.(color);
  };

  const swatch = (
    <Box
      onClick={handleClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && handleClick() : undefined}
      aria-label={`Color ${color}`}
      sx={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: radius,
        backgroundColor: color,
        cursor: onClick ? "pointer" : "default",
        border: selected
          ? `2px solid ${theme.vars.palette.primary.main}`
          : `1px solid ${theme.vars.palette.grey[700]}`,
        boxShadow: selected ? `0 0 0 1px ${theme.vars.palette.background.default}` : undefined,
        transition: "transform 0.15s, box-shadow 0.15s",
        "&:hover": onClick ? {
          transform: "scale(1.1)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          zIndex: 1,
        } : undefined,
        ...sx,
      }}
      {...props}
    />
  );

  if (showTooltip || tooltip) {
    return (
      <Tooltip title={tooltip || color}>
        {swatch}
      </Tooltip>
    );
  }

  return swatch;
};

ColorSwatch.displayName = "ColorSwatch";
