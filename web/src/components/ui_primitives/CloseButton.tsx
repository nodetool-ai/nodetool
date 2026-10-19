/**
 * CloseButton
 *
 * A standardized close button for dialogs, panels, and popovers.
 *
 * @example
 * <CloseButton onClick={handleClose} />
 */

import React, { memo, forwardRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import ClearIcon from "@mui/icons-material/Clear";
import { useTheme, SxProps, Theme } from "@mui/material/styles";
import { editorClassNames, cn } from "../editor_ui/editorUtils";
import { Tooltip, tooltipWithShortcut } from "./Tooltip";

export interface CloseButtonProps {
  /**
   * Click handler
   */
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /**
   * Tooltip text
   * @default "Close"
   */
  tooltip?: string;
  /**
   * Keyboard shortcut shown in the tooltip, e.g. ["Esc"]
   */
  shortcut?: string[];
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
   * Icon variant
   * @default "close"
   */
  iconVariant?: "close" | "clear";
  /**
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
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

export const CloseButton = memo(
  forwardRef<HTMLButtonElement, CloseButtonProps>(
    (
      {
        onClick,
        tooltip,
        shortcut,
        tooltipPlacement = "bottom",
        buttonSize = "small",
        iconVariant = "close",
        nodrag = true,
        disabled = false,
        className,
        sx,
        tabIndex = 0
      },
      ref
    ) => {
      const theme = useTheme();
      const { t } = useTranslation();
      const tooltipText = tooltip ?? t("i18n-next85.uiPrimitives.close");

      const handleClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          onClick(e);
        },
        [onClick]
      );

      const Icon = iconVariant === "clear" ? ClearIcon : CloseIcon;

      return (
        <Tooltip
          title={tooltipWithShortcut(tooltipText, shortcut)}
          placement={tooltipPlacement}
        >
          <span style={{ display: "inline-flex" }}>
          <IconButton
            ref={ref}
            tabIndex={tabIndex}
            aria-label={tooltipText}
            className={cn(
              "close-button",
              nodrag && editorClassNames.nodrag,
              className
            )}
            onClick={handleClick}
            disabled={disabled}
            size={buttonSize}
            sx={{
              color: theme.vars.palette.grey[300],
              "&:hover": {
                color: theme.vars.palette.grey[100],
                backgroundColor: `rgba(${theme.vars.palette.common.whiteChannel ?? '255 255 255'} / 0.08)`
              },
              ...sx
            }}
          >
            <Icon fontSize={buttonSize} />
          </IconButton>
          </span>
        </Tooltip>
      );
    }
  )
);

CloseButton.displayName = "CloseButton";
