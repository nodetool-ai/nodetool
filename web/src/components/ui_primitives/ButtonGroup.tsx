/**
 * ButtonGroup Component
 *
 * A semantic wrapper around MUI ButtonGroup with consistent styling.
 * Groups related buttons together with a shared visual container.
 */

import React, { memo } from "react";
import {
  ButtonGroup as MuiButtonGroup,
  ButtonGroupProps as MuiButtonGroupProps,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface ButtonGroupProps
  extends Omit<MuiButtonGroupProps, "size"> {
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Compact mode with tighter spacing */
  compact?: boolean;
  /** Full width group */
  fullWidth?: boolean;
}

/**
 * ButtonGroup - A themed group of related buttons
 *
 * @example
 * // Basic horizontal group
 * <ButtonGroup>
 *   <Button>Left</Button>
 *   <Button>Center</Button>
 *   <Button>Right</Button>
 * </ButtonGroup>
 *
 * @example
 * // Compact vertical group
 * <ButtonGroup orientation="vertical" compact size="small">
 *   <Button>Option A</Button>
 *   <Button>Option B</Button>
 * </ButtonGroup>
 *
 * @example
 * // Full width contained group
 * <ButtonGroup variant="contained" fullWidth>
 *   <Button>Save</Button>
 *   <Button>Cancel</Button>
 * </ButtonGroup>
 */
const ButtonGroupInternal: React.FC<ButtonGroupProps> = ({
  size = "medium",
  compact = false,
  fullWidth = false,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();

  return (
    <MuiButtonGroup
      size={compact ? "small" : size}
      fullWidth={fullWidth}
      sx={{
        ...(compact && {
          "& .MuiButton-root": {
            py: 0.25,
            px: 1,
            fontSize: theme.fontSizeSmall || "0.875rem",
            minWidth: "auto",
          },
        }),
        ...sx,
      }}
      {...props}
    >
      {children}
    </MuiButtonGroup>
  );
};

export const ButtonGroup = memo(ButtonGroupInternal);
ButtonGroup.displayName = "ButtonGroup";
