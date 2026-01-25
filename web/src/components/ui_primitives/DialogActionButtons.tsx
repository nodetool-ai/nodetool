/** @jsxImportSource @emotion/react */
/**
 * DialogActionButtons
 *
 * A standardized component for dialog confirm/cancel button pairs.
 * Provides consistent styling and behavior for dialog actions.
 *
 * @example
 * <DialogActionButtons
 *   onConfirm={handleSave}
 *   onCancel={handleClose}
 *   confirmText="Save"
 *   cancelText="Cancel"
 * />
 */

import React, { forwardRef, useCallback, memo } from "react";
import { Button, ButtonProps, CircularProgress } from "@mui/material";
import DialogActions from "@mui/material/DialogActions";
import { useTheme } from "@mui/material/styles";

export interface DialogActionButtonsProps {
  /**
   * Callback when confirm button is clicked
   */
  onConfirm: () => void;
  /**
   * Callback when cancel button is clicked
   */
  onCancel: () => void;
  /**
   * Text for the confirm button
   * @default "Confirm"
   */
  confirmText?: string;
  /**
   * Text for the cancel button
   * @default "Cancel"
   */
  cancelText?: string;
  /**
   * Whether the confirm action is loading
   * @default false
   */
  isLoading?: boolean;
  /**
   * Whether the confirm button is disabled
   * @default false
   */
  confirmDisabled?: boolean;
  /**
   * Whether the cancel button is disabled
   * @default false
   */
  cancelDisabled?: boolean;
  /**
   * Variant for destructive actions (delete, remove)
   * @default false
   */
  destructive?: boolean;
  /**
   * Additional class name for the container
   */
  className?: string;
  /**
   * Additional props for the confirm button
   */
  confirmButtonProps?: Partial<ButtonProps>;
  /**
   * Additional props for the cancel button
   */
  cancelButtonProps?: Partial<ButtonProps>;
}

/**
 * Standardized dialog action buttons for confirm/cancel pairs.
 * Handles loading states, disabled states, and destructive action styling.
 */
export const DialogActionButtons = memo(
  forwardRef<HTMLDivElement, DialogActionButtonsProps>(
    (
      {
        onConfirm,
        onCancel,
        confirmText = "Confirm",
        cancelText = "Cancel",
        isLoading = false,
        confirmDisabled = false,
        cancelDisabled = false,
        destructive = false,
        className,
        confirmButtonProps,
        cancelButtonProps
      },
      ref
    ) => {
      const theme = useTheme();

      const handleConfirm = useCallback(() => {
        if (!isLoading && !confirmDisabled) {
          onConfirm();
        }
      }, [onConfirm, isLoading, confirmDisabled]);

      const handleCancel = useCallback(() => {
        if (!isLoading && !cancelDisabled) {
          onCancel();
        }
      }, [onCancel, isLoading, cancelDisabled]);

      return (
        <DialogActions
          ref={ref}
          className={`dialog-actions ${className ?? ""}`}
          sx={{
            padding: "0.5em 1em",
            gap: 1
          }}
        >
          <Button
            className="button-cancel"
            onClick={handleCancel}
            disabled={isLoading || cancelDisabled}
            sx={{
              color: theme.vars.palette.grey[100],
              "&:hover": {
                backgroundColor: theme.vars.palette.grey[800]
              }
            }}
            {...cancelButtonProps}
          >
            {cancelText}
          </Button>
          <Button
            className="button-confirm"
            onClick={handleConfirm}
            disabled={isLoading || confirmDisabled}
            color={destructive ? "error" : "primary"}
            variant={destructive ? "contained" : "text"}
            autoFocus
            sx={{
              color: destructive
                ? theme.vars.palette.error.main
                : "var(--palette-primary-main)",
              fontWeight: "bold",
              "&:hover": {
                backgroundColor: destructive
                  ? theme.vars.palette.error.dark
                  : theme.vars.palette.grey[900]
              }
            }}
            {...confirmButtonProps}
          >
            {isLoading ? <CircularProgress size={20} /> : confirmText}
          </Button>
        </DialogActions>
      );
    }
  )
);

DialogActionButtons.displayName = "DialogActionButtons";
