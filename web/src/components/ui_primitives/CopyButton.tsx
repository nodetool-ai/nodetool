/**
 * CopyButton
 *
 * A standardized copy-to-clipboard button with visual feedback.
 * Shows a checkmark on successful copy and an error icon on failure.
 *
 * @example
 * <CopyButton
 *   value="Text to copy"
 *   tooltip="Copy prompt"
 * />
 */

import { useState, useCallback, useRef, useEffect, memo, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@mui/material";
import { Tooltip } from "./Tooltip";
import { SxProps, Theme } from "@mui/material/styles";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import { useTheme } from "@mui/material/styles";
import { useClipboard } from "../../hooks/browser/useClipboard";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";
import { isString } from "../../utils/typePredicates";
import { iconButtonBoxSx } from "./ToolbarIconButton";

const FEEDBACK_TIMEOUT = 2000;

export interface CopyButtonProps {
  /**
   * The value to copy to clipboard
   */
  value: unknown;
  /**
   * Tooltip text when not copied
   * @default "Copy"
   */
  tooltip?: string;
  /**
   * Tooltip placement
   * @default "bottom"
   */
  tooltipPlacement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "bottom-end"
    | "bottom-start"
    | "left-end"
    | "left-start"
    | "right-end"
    | "right-start"
    | "top-end"
    | "top-start";
  /**
   * Button size
   * @default "small"
   */
  buttonSize?: "small" | "medium" | "large";
  /**
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
  /**
   * Callback when copy succeeds
   */
  onCopySuccess?: () => void;
  /**
   * Callback when copy fails
   */
  onCopyError?: (error: Error) => void;
  /**
   * Whether the button is disabled
   */
  disabled?: boolean;
  /**
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx styles
   */
  sx?: SxProps<Theme>;
  /**
   * Tab index for keyboard navigation
   * @default 0
   */
  tabIndex?: number;
}

export const CopyButton = memo(
  forwardRef<HTMLButtonElement, CopyButtonProps>(
    (
      {
        value,
        tooltip,
        tooltipPlacement = "bottom",
        buttonSize = "small",
        nodrag = true,
        onCopySuccess,
        onCopyError,
        disabled = false,
        className,
        sx,
        tabIndex = 0
      },
      ref
    ) => {
      const theme = useTheme();
      const { t } = useTranslation();
      const defaultTooltip = t("i18n-next85.uiPrimitives.copy");
      const { writeClipboard } = useClipboard();
      const [state, setState] = useState<"idle" | "copied" | "error">("idle");
      const timeoutRef = useRef<NodeJS.Timeout | null>(null);

      useEffect(() => {
        return () => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
        };
      }, []);

      const handleCopy = useCallback(() => {
        if (disabled) {
          return;
        }

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        const textToCopy =
          isString(value) ? value : JSON.stringify(value, null, 2);

        if (!textToCopy || textToCopy.trim().length === 0) {
          setState("error");
          timeoutRef.current = setTimeout(() => setState("idle"), FEEDBACK_TIMEOUT);
          return;
        }

        writeClipboard(textToCopy, true)
          .then(() => {
            setState("copied");
            onCopySuccess?.();
            timeoutRef.current = setTimeout(
              () => setState("idle"),
              FEEDBACK_TIMEOUT
            );
          })
          .catch((_err: Error) => {
            setState("error");
            onCopyError?.(_err);
            timeoutRef.current = setTimeout(
              () => setState("idle"),
              FEEDBACK_TIMEOUT
            );
          });
      }, [value, disabled, writeClipboard, onCopySuccess, onCopyError]);

      const tooltipText =
        state === "error"
          ? t("i18n-next85.uiPrimitives.nothingToCopy")
          : state === "copied"
            ? t("i18n-next85.uiPrimitives.copied")
            : tooltip ?? defaultTooltip;

      const iconSize =
        buttonSize === "small"
          ? "0.875rem"
          : buttonSize === "medium"
            ? "1rem"
            : "1.25rem";

      return (
        <Tooltip
          title={tooltipText}
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement={tooltipPlacement}
        >
          <span style={{ display: "inline-flex" }}>
          <IconButton
            ref={ref}
            tabIndex={tabIndex}
            aria-label={tooltipText}
            className={cn(
              "copy-button",
              nodrag && editorClassNames.nodrag,
              className
            )}
            onClick={handleCopy}
            disabled={disabled}
            size={buttonSize}
            sx={{
              ...iconButtonBoxSx(buttonSize),
              color: theme.vars.palette.text.secondary,
              "&:hover": {
                color: theme.vars.palette.text.primary,
                backgroundColor: theme.vars.palette.action.hover
              },
              ...(sx ?? {})
            }}
          >
            {state === "error" ? (
              <CloseIcon
                sx={{ fontSize: iconSize, color: theme.vars.palette.error.main }}
              />
            ) : state === "copied" ? (
              <CheckIcon
                sx={{ fontSize: iconSize, color: theme.vars.palette.success.main }}
              />
            ) : (
              <ContentCopyIcon sx={{ fontSize: iconSize }} />
            )}
          </IconButton>
          </span>
        </Tooltip>
      );
    }
  )
);

CopyButton.displayName = "CopyButton";
