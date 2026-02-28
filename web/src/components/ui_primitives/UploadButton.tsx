/**
 * UploadButton
 *
 * A standardized upload button with file input handling.
 *
 * @example
 * <UploadButton onFileSelect={handleFiles} tooltip="Upload files" />
 */

import React, { memo, forwardRef, useCallback, useRef } from "react";
import { IconButton, Button, Tooltip } from "@mui/material";
import UploadIcon from "@mui/icons-material/Upload";
import FileUploadIcon from "@mui/icons-material/FileUpload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface UploadButtonProps {
  /**
   * Callback when files are selected
   */
  onFileSelect: (files: File[]) => void;
  /**
   * Tooltip text
   * @default "Upload"
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
   * @default "upload"
   */
  iconVariant?: "upload" | "file" | "cloud";
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
   * Whether to allow multiple file selection
   * @default true
   */
  multiple?: boolean;
  /**
   * Accepted file types (e.g., "image/*", ".pdf")
   */
  accept?: string;
  /**
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx styles
   */
  sx?: object;
}

export const UploadButton = memo(
  forwardRef<HTMLButtonElement, UploadButtonProps>(
    (
      {
        onFileSelect,
        tooltip = "Upload",
        label,
        tooltipPlacement = "bottom",
        buttonSize = "small",
        iconVariant = "upload",
        nodrag = true,
        disabled = false,
        multiple = true,
        accept,
        className,
        sx
      },
      ref
    ) => {
      const theme = useTheme();
      const fileInputRef = useRef<HTMLInputElement>(null);

      const handleClick = useCallback(() => {
        fileInputRef.current?.click();
      }, []);

      const handleFileChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            onFileSelect(files);
          }
          // Reset input so same file can be selected again
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        },
        [onFileSelect]
      );

      const Icon =
        iconVariant === "file"
          ? FileUploadIcon
          : iconVariant === "cloud"
            ? CloudUploadIcon
            : UploadIcon;

      const content = <Icon fontSize={buttonSize} />;

      return (
        <>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple={multiple}
            accept={accept}
            onChange={handleFileChange}
          />
          {label ? (
            <Tooltip
              title={tooltip}
              enterDelay={TOOLTIP_ENTER_DELAY}
              enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
              placement={tooltipPlacement}
            >
              <Button
                ref={ref}
                tabIndex={-1}
                className={cn(
                  "upload-button",
                  nodrag && editorClassNames.nodrag,
                  className
                )}
                onClick={handleClick}
                disabled={disabled}
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
          ) : (
            <Tooltip
              title={tooltip}
              enterDelay={TOOLTIP_ENTER_DELAY}
              enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
              placement={tooltipPlacement}
            >
              <IconButton
                ref={ref}
                tabIndex={-1}
                className={cn(
                  "upload-button",
                  nodrag && editorClassNames.nodrag,
                  className
                )}
                onClick={handleClick}
                disabled={disabled}
                size={buttonSize}
                aria-label={tooltip}
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
          )}
        </>
      );
    }
  )
);

UploadButton.displayName = "UploadButton";
