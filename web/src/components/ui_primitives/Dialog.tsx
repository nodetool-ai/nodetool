/** @jsxImportSource @emotion/react */
/**
 * Dialog
 *
 * A standardized dialog component that wraps MUI Dialog with consistent styling.
 * Provides a foundation for building modal dialogs with optional action buttons.
 *
 * @example
 * // Basic dialog
 * <Dialog
 *   open={open}
 *   onClose={handleClose}
 *   title="Dialog Title"
 * >
 *   <DialogContent>
 *     Your content here
 *   </DialogContent>
 * </Dialog>
 *
 * @example
 * // Dialog with action buttons
 * <Dialog
 *   open={open}
 *   onClose={handleClose}
 *   title="Confirm Action"
 *   onConfirm={handleConfirm}
 *   confirmText="Save"
 *   cancelText="Cancel"
 * >
 *   <DialogContent>
 *     Are you sure you want to continue?
 *   </DialogContent>
 * </Dialog>
 */

import React, { forwardRef, memo, ReactNode } from "react";
import {
  Dialog as MuiDialog,
  DialogProps as MuiDialogProps,
  DialogTitle,
  DialogContent
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import dialogStyles from "../../styles/DialogStyles";
import { DialogActionButtons, DialogActionButtonsProps } from "./DialogActionButtons";

export interface DialogProps extends Omit<MuiDialogProps, "title" | "content"> {
  /**
   * Dialog title text
   */
  title?: ReactNode;
  /**
   * Dialog content (can also be passed as children)
   */
  content?: ReactNode;
  /**
   * Whether to show action buttons
   * @default false
   */
  showActions?: boolean;
  /**
   * Callback when confirm button is clicked (enables action buttons)
   */
  onConfirm?: () => void;
  /**
   * Callback when cancel button is clicked (uses onClose if not provided)
   */
  onCancel?: () => void;
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
   * Additional props for DialogActionButtons
   */
  actionButtonsProps?: Partial<DialogActionButtonsProps>;
}

/**
 * Standardized dialog component with consistent styling and optional action buttons.
 * Wraps MUI Dialog and integrates with DialogActionButtons for a unified experience.
 */
export const Dialog = memo(
  forwardRef<HTMLDivElement, DialogProps>(
    (
      {
        open,
        onClose,
        title,
        content,
        children,
        showActions,
        onConfirm,
        onCancel,
        confirmText,
        cancelText,
        isLoading,
        confirmDisabled,
        cancelDisabled,
        destructive,
        actionButtonsProps,
        className,
        ...dialogProps
      },
      ref
    ) => {
      const theme = useTheme();

      // Show actions if explicitly requested or if onConfirm is provided
      const shouldShowActions = showActions || !!onConfirm;

      const handleCancel = () => {
        if (onCancel) {
          onCancel();
        } else if (onClose) {
          onClose({}, "escapeKeyDown");
        }
      };

      const dialogContent = content || children;

      return (
        <MuiDialog
          ref={ref}
          open={open}
          onClose={onClose}
          css={dialogStyles(theme)}
          className={`dialog ${className ?? ""}`}
          aria-labelledby={title ? "dialog-title" : undefined}
          {...dialogProps}
        >
          {title && (
            <DialogTitle className="dialog-title" id="dialog-title">
              {title}
            </DialogTitle>
          )}
          {dialogContent && (
            <DialogContent className="dialog-content">
              {dialogContent}
            </DialogContent>
          )}
          {shouldShowActions && onConfirm && (
            <DialogActionButtons
              onConfirm={onConfirm}
              onCancel={handleCancel}
              confirmText={confirmText}
              cancelText={cancelText}
              isLoading={isLoading}
              confirmDisabled={confirmDisabled}
              cancelDisabled={cancelDisabled}
              destructive={destructive}
              {...actionButtonsProps}
            />
          )}
        </MuiDialog>
      );
    }
  )
);

Dialog.displayName = "Dialog";
