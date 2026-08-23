/**
 * Label Component
 * 
 * A semantic label component for form fields and UI labels.
 * Provides consistent label styling across the application.
 */

import { forwardRef } from "react";
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

// Label is the sanctioned "label" role (13px / 500). The `small` variant
// drops to the caption combo (11px / 400). Both stay within the 4 combos.
const FONT_SIZES = {
  small: "var(--fontSizeSmaller)", // 11px — caption combo
  normal: "var(--fontSizeSmall)", // 13px — label combo
  large: "var(--fontSizeSmall)" // 13px — label combo
} satisfies Record<NonNullable<LabelProps["size"]>, string>;

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
export const Label = forwardRef<HTMLElement, LabelProps>(({
  size = "normal",
  required = false,
  disabled = false,
  error = false,
  htmlFor,
  sx,
  children,
  ...props
}, ref) => {
  const theme = useTheme();

  const fontWeight = size === "small" ? 400 : 500;

  const color = error
    ? theme.vars.palette.error.main
    : disabled
      ? theme.vars.palette.text.disabled
      : theme.vars.palette.text.secondary;

  return (
    <Typography
      ref={ref}
      component="label"
      htmlFor={htmlFor}
      sx={{
        fontSize: FONT_SIZES[size],
        fontWeight,
        color,
        display: "block",
        marginBottom: theme.spacing(1),
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
});

Label.displayName = "Label";
