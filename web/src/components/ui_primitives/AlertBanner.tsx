/**
 * AlertBanner Component
 *
 * A themed alert/notification banner wrapping MUI Alert.
 * Provides consistent styling for success, error, warning, and info messages.
 * Used in 8+ files that directly import MUI Alert.
 */

import { forwardRef } from "react";
import { Alert, AlertTitle, AlertProps as MuiAlertProps } from "@mui/material";

export interface AlertBannerProps extends Omit<MuiAlertProps, 'variant'> {
  /** Alert title (optional) */
  title?: string;
  /** Visual variant */
  variant?: "filled" | "outlined" | "standard";
  /** Compact mode with reduced padding */
  compact?: boolean;
}

/**
 * AlertBanner - A themed alert/notification component
 *
 * @example
 * // Basic info alert
 * <AlertBanner severity="info">Information message</AlertBanner>
 *
 * @example
 * // Error alert with title
 * <AlertBanner severity="error" title="Error">
 *   Something went wrong
 * </AlertBanner>
 *
 * @example
 * // Dismissible warning
 * <AlertBanner severity="warning" onClose={handleClose}>
 *   Please update your settings
 * </AlertBanner>
 *
 * @example
 * // Compact success alert
 * <AlertBanner severity="success" compact>
 *   Saved successfully
 * </AlertBanner>
 */
export const AlertBanner = forwardRef<HTMLDivElement, AlertBannerProps>(({
  title,
  variant = "standard",
  compact = false,
  sx,
  children,
  ...props
}, ref) => {
  return (
    <Alert
      ref={ref}
      variant={variant}
      sx={{
        borderRadius: "var(--rounded-lg)",
        ...(compact && {
          py: 0.5,
          px: 1.5,
          "& .MuiAlert-icon": {
            py: 0.5,
          },
          "& .MuiAlert-message": {
            py: 0.5,
          },
        }),
        ...sx,
      }}
      {...props}
    >
      {title && <AlertTitle>{title}</AlertTitle>}
      {children}
    </Alert>
  );
});

AlertBanner.displayName = "AlertBanner";
