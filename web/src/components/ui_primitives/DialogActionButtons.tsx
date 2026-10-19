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

import { forwardRef, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { Button, ButtonProps } from "@mui/material";
import { LoadingSpinner } from "./LoadingSpinner";
import DialogActions from "@mui/material/DialogActions";
import { MOTION } from "./tokens";

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
        confirmText,
        cancelText,
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
      const { t } = useTranslation();
      const resolvedConfirmText = confirmText ?? t("i18n-next103.dialogActionButtons.confirm");
      const resolvedCancelText = cancelText ?? t("i18n-next103.dialogActionButtons.cancel");
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
        >
          <Button
            className="button-cancel"
            onClick={handleCancel}
            disabled={isLoading || cancelDisabled}
            color="inherit"
            sx={{ transition: MOTION.all }}
            {...cancelButtonProps}
          >
            {resolvedCancelText}
          </Button>
          <Button
            className="button-confirm"
            onClick={handleConfirm}
            disabled={isLoading || confirmDisabled}
            color={destructive ? "error" : "primary"}
            variant="contained"
            autoFocus
            sx={{ transition: MOTION.all }}
            {...confirmButtonProps}
          >
            {isLoading ? (
              <LoadingSpinner inline size={20} color="inherit" />
            ) : (
              resolvedConfirmText
            )}
          </Button>
        </DialogActions>
      );
    }
  )
);

DialogActionButtons.displayName = "DialogActionButtons";
