/**
 * Label Component
 * 
 * A semantic label component for form fields and UI labels.
 * Provides consistent label styling across the application.
 */

import React from "react";
import { Typography, TypographyProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface LabelProps extends Omit<TypographyProps, 'variant'> {
  /** Label size variant */
  size?: "small" | "normal" | "large";
  /** Required field indicator */
  required?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Error state */
  error?: boolean;
  /** Associated input id (for accessibility) */
  htmlFor?: string;
}

/**
 * Label - A semantic label component
 * 
 * @example
 * // Basic label
 * <Label htmlFor="email">Email Address</Label>
 * 
 * @example
 * // Required field label
 * <Label required htmlFor="name">Full Name</Label>
 * 
 * @example
 * // Error state label
 * <Label error>Invalid input</Label>
 * 
 * @example
 * // Disabled label
 * <Label disabled>Disabled Field</Label>
 */
export const Label: React.FC<LabelProps> = ({
  size = "normal",
  required = false,
  disabled = false,
  error = false,
  htmlFor,
  sx,
  children,
  ...props
}) => {
  const theme = useTheme();

  const getFontSize = () => {
    const sizeMap = {
      small: theme.fontSizeSmaller,
      normal: theme.fontSizeSmall,
      large: theme.fontSizeNormal
    };
    return sizeMap[size];
  };

  const getColor = () => {
    if (error) {
      return theme.vars.palette.error.main;
    }
    if (disabled) {
      return theme.vars.palette.text.disabled;
    }
    return theme.vars.palette.text.secondary;
  };

  return (
    <Typography
      component="label"
      htmlFor={htmlFor}
      sx={{
        fontSize: getFontSize(),
        fontWeight: 500,
        color: getColor(),
        display: "block",
        marginBottom: theme.spacing(0.5),
        cursor: disabled ? "not-allowed" : "default",
        ...sx
      }}
      {...props}
    >
      {children}
      {required && (
        <span
          style={{
            color: theme.vars.palette.error.main,
            marginLeft: theme.spacing(0.5)
          }}
        >
          *
        </span>
      )}
    </Typography>
  );
};
