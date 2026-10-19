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

import { CSSProperties, forwardRef, memo, ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog as MuiDialog,
  DialogProps as MuiDialogProps,
  DialogTitle,
  DialogContent,
  DialogActions as MuiDialogActions
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import dialogStyles from "../../styles/DialogStyles";
import {
  DialogActionButtons,
  DialogActionButtonsProps
} from "./DialogActionButtons";
import { CloseButton } from "./CloseButton";
import { FlexRow } from "./FlexRow";
import { Text } from "./Text";
import { SPACING } from "./spacing";
import { isString } from "../../utils/typePredicates";
import { OverlayLayerProvider, useOverlayLayer } from "./OverlayLayer";

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
  /**
   * Custom action buttons rendered in a DialogActions footer.
   * Takes precedence over the built-in confirm/cancel buttons.
   */
  actions?: ReactNode;
  /**
   * Minimum width for the dialog
   * @default "400px"
   */
  minWidth?: string | number;
  /**
   * Show a close (X) button in the title bar.
   * Defaults to true when both `title` and `onClose` are provided.
   */
  showCloseButton?: boolean;
  /**
   * Extra content rendered in the title bar next to the close button.
   */
  titleActions?: ReactNode;
  /**
   * `fullscreen` fills the viewport edge to edge with no radius, border or
   * minimum width, for media viewers and reading views.
   * @default "default"
   */
  variant?: "default" | "fullscreen";
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
        actions,
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
        minWidth,
        className,
        showCloseButton,
        titleActions,
        slotProps,
        variant = "default",
        ...dialogProps
      },
      ref
    ) => {
      const theme = useTheme();
      const { t } = useTranslation();
      const titleId = useId();
      // A dialog opened from inside a popover has to clear that popover's
      // invisible backdrop, which the theme pins far above the modal layer.
      // Outside any overlay there is nothing to clear, so the theme layer and
      // everything stacked against it stay as they are.
      const parentLayer = useOverlayLayer();
      const nestedZIndex =
        parentLayer === undefined ? undefined : parentLayer + 1;

      const shouldShowActions = showActions || !!onConfirm;

      const handleCancel = () => {
        if (onCancel) {
          onCancel();
        } else if (onClose) {
          onClose({}, "escapeKeyDown");
        }
      };

      const dialogContent = content || children;
      const shouldShowCloseButton = showCloseButton ?? (!!title && !!onClose);
      const closeAction =
        shouldShowCloseButton && onClose ? (
          <CloseButton
            onClick={() => onClose({}, "escapeKeyDown")}
            tooltip={t("i18n-next91.dialog.close")}
          />
        ) : null;
      const headerActions =
        titleActions || closeAction ? (
          <>
            {titleActions}
            {closeAction}
          </>
        ) : null;
      const titleIsString = isString(title);
      const glass = theme.vars.palette.glass ?? {
        blur: "blur(12px)",
        backgroundDialog: theme.vars.palette.action.disabledBackground
      };
      // Caller slot props merge onto the shell instead of replacing it, so a
      // paper `sx` or a backdrop handler keeps the glass, border and radius.
      const callerPaper = isSlotObject(slotProps?.paper) ? slotProps.paper : {};
      const callerBackdrop = isSlotObject(slotProps?.backdrop)
        ? slotProps.backdrop
        : {};
      const isFullscreen =
        variant === "fullscreen" || dialogProps.fullScreen === true;
      const callerRoot = isSlotObject(slotProps?.root) ? slotProps.root : {};

      return (
        <MuiDialog
          ref={ref}
          open={open}
          onClose={onClose}
          css={dialogStyles(theme)}
          className={`dialog${isFullscreen ? " dialog--fullscreen" : ""} ${className ?? ""}`}
          aria-labelledby={title ? titleId : undefined}
          slotProps={{
            ...slotProps,
            root: {
              ...callerRoot,
              style: {
                zIndex: nestedZIndex,
                ...callerRoot.style
              }
            },
            backdrop: {
              ...callerBackdrop,
              style: {
                backdropFilter: glass.blur,
                backgroundColor: glass.backgroundDialog,
                ...callerBackdrop.style
              }
            },
            paper: {
              ...callerPaper,
              style: {
                background: theme.vars.palette.background.paper,
                ...(isFullscreen
                  ? { borderRadius: 0, border: "none", margin: 0 }
                  : {
                      borderRadius:
                        theme.rounded?.dialog ?? theme.shape.borderRadius,
                      backdropFilter: `${glass.blur} saturate(180%)`,
                      border: `1px solid ${theme.vars.palette.divider}`,
                      minWidth: minWidth ?? "min(400px, 100vw - 32px)"
                    }),
                ...callerPaper.style
              }
            }
          }}
          fullScreen={isFullscreen}
          {...dialogProps}
        >
          <OverlayLayerProvider value={nestedZIndex}>
            {title && (
              <DialogTitle className="dialog-title" id={titleId}>
                <FlexRow
                  className="dialog-title-row"
                  align="center"
                  justify="space-between"
                  gap={SPACING.md}
                  fullWidth
                >
                  {titleIsString ? (
                    <Text
                      size="big"
                      component="span"
                      className="dialog-title-text"
                    >
                      {title}
                    </Text>
                  ) : (
                    title
                  )}
                  {headerActions && (
                    <FlexRow align="center" gap={SPACING.micro}>
                      {headerActions}
                    </FlexRow>
                  )}
                </FlexRow>
              </DialogTitle>
            )}
            {dialogContent && (
              <DialogContent className="dialog-content">
                {dialogContent}
              </DialogContent>
            )}
            {actions && (
              <MuiDialogActions className="dialog-actions">
                {actions}
              </MuiDialogActions>
            )}
            {!actions && shouldShowActions && onConfirm && (
              <DialogActionButtons
                onConfirm={onConfirm}
                onCancel={handleCancel}
                confirmText={confirmText ?? t("i18n-next91.dialog.confirm")}
                cancelText={cancelText ?? t("i18n-next91.dialog.cancel")}
                isLoading={isLoading}
                confirmDisabled={confirmDisabled}
                cancelDisabled={cancelDisabled}
                destructive={destructive}
                {...actionButtonsProps}
              />
            )}
          </OverlayLayerProvider>
        </MuiDialog>
      );
    }
  )
);

Dialog.displayName = "Dialog";

type SlotStyle = { style?: CSSProperties } & Record<string, unknown>;

function isSlotObject(slot: unknown): slot is SlotStyle {
  return typeof slot === "object" && slot !== null;
}
