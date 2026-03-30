/**
 * Toast Component
 *
 * A notification toast wrapping MUI Snackbar + Alert.
 * Provides a simple API for showing temporary feedback messages.
 */

import React, { memo, useCallback } from "react";
import { Snackbar, SnackbarProps, Alert, AlertColor } from "@mui/material";

export interface ToastProps
  extends Omit<SnackbarProps, "children" | "onClose" | "message"> {
  /** Toast message */
  message: string;
  /** Severity/color of the toast */
  severity?: AlertColor;
  /** Auto-dismiss duration in ms. Set to null to disable. */
  duration?: number | null;
  /** Callback when toast is dismissed */
  onClose: () => void;
  /** Alert variant style */
  variant?: "filled" | "outlined" | "standard";
  /** Vertical position */
  vertical?: "top" | "bottom";
  /** Horizontal position */
  horizontal?: "left" | "center" | "right";
}

/**
 * Toast - Temporary feedback notification
 *
 * @example
 * // Basic success toast
 * <Toast
 *   open={showToast}
 *   message="Saved successfully"
 *   severity="success"
 *   onClose={() => setShowToast(false)}
 * />
 *
 * @example
 * // Error toast at top center
 * <Toast
 *   open={hasError}
 *   message="Failed to save"
 *   severity="error"
 *   vertical="top"
 *   horizontal="center"
 *   duration={6000}
 *   onClose={clearError}
 * />
 *
 * @example
 * // useToast pattern
 * const [toast, setToast] = useState({ open: false, message: "", severity: "success" as const });
 * <Toast {...toast} onClose={() => setToast(t => ({ ...t, open: false }))} />
 */
const ToastInternal: React.FC<ToastProps> = ({
  message,
  severity = "success",
  duration = 4000,
  onClose,
  variant = "filled",
  vertical = "bottom",
  horizontal = "center",
  ...props
}) => {
  const handleClose = useCallback(
    (_event?: React.SyntheticEvent | Event, reason?: string) => {
      if (reason === "clickaway") {return;}
      onClose();
    },
    [onClose]
  );

  return (
    <Snackbar
      open={props.open}
      autoHideDuration={duration}
      onClose={handleClose}
      anchorOrigin={{ vertical, horizontal }}
      {...props}
    >
      <Alert
        severity={severity}
        variant={variant}
        onClose={handleClose}
        sx={{ width: "100%" }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
};

export const Toast = memo(ToastInternal);
