/**
 * DownloadButton
 *
 * A standardized download button.
 *
 * @example
 * <DownloadButton onClick={handleDownload} tooltip="Download file" />
 */

import React, { memo, forwardRef, useCallback } from "react";
import { IconButton, Button, Tooltip, CircularProgress } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface DownloadButtonProps {
  /**
   * Click handler
   */
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /**
   * Tooltip text
   * @default "Download"
   */
  tooltip?: string;
  /**
   * Button label (renders as text button when provided)
   */
  label?: string;
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
   * @default "download"
   */
  iconVariant?: "download" | "file";
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
   * Whether the download is in progress
   */
  isLoading?: boolean;
  /**
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx styles
   */
  sx?: object;
}

export const DownloadButton = memo(
  forwardRef<HTMLButtonElement, DownloadButtonProps>(
    (
      {
        onClick,
        tooltip = "Download",
        label,
        tooltipPlacement = "bottom",
        buttonSize = "small",
        iconVariant = "download",
        nodrag = true,
        disabled = false,
        isLoading = false,
        className,
        sx
      },
      ref
    ) => {
      const theme = useTheme();

      const handleClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          if (!isLoading) {
            onClick(e);
          }
        },
        [onClick, isLoading]
      );

      const Icon = iconVariant === "file" ? FileDownloadIcon : DownloadIcon;

      const content = isLoading ? (
        <CircularProgress size={buttonSize === "small" ? 16 : 20} />
      ) : (
        <Icon fontSize={buttonSize} />
      );

      if (label) {
        return (
          <Tooltip
            title={tooltip}
            enterDelay={TOOLTIP_ENTER_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            placement={tooltipPlacement}
          >
            <Button
              ref={ref}
              tabIndex={-1}
              aria-label={tooltip}
              className={cn(
                "download-button",
                nodrag && editorClassNames.nodrag,
                className
              )}
              onClick={handleClick}
              disabled={disabled || isLoading}
              size={buttonSize}
              startIcon={content}
              sx={{
                color: theme.vars.palette.grey[300],
                "&:hover": {
                  color: theme.vars.palette.primary.main,
                  backgroundColor: "rgba(33, 150, 243, 0.08)"
                },
                ...sx
              }}
            >
              {label}
            </Button>
          </Tooltip>
        );
      }

      return (
        <Tooltip
          title={tooltip}
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement={tooltipPlacement}
        >
          <IconButton
            ref={ref}
            tabIndex={-1}
            aria-label={tooltip}
            className={cn(
              "download-button",
              nodrag && editorClassNames.nodrag,
              className
            )}
            onClick={handleClick}
            disabled={disabled || isLoading}
            size={buttonSize}
            sx={{
              color: theme.vars.palette.grey[300],
              "&:hover": {
                color: theme.vars.palette.primary.main,
                backgroundColor: "rgba(33, 150, 243, 0.08)"
              },
              ...sx
            }}
          >
            {content}
          </IconButton>
        </Tooltip>
      );
    }
  )
);

DownloadButton.displayName = "DownloadButton";
