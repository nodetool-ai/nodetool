/**
 * DeleteButton
 *
 * A standardized delete button with destructive styling.
 *
 * @example
 * <DeleteButton onClick={handleDelete} tooltip="Delete item" />
 */

import React, { memo, forwardRef, useCallback } from "react";
import { IconButton, Tooltip } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ClearIcon from "@mui/icons-material/Clear";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface DeleteButtonProps {
  /**
   * Click handler
   */
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /**
   * Tooltip text
   * @default "Delete"
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
   * Icon variant
   * @default "delete"
   */
  iconVariant?: "delete" | "clear" | "outline";
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
  sx?: object;
}

export const DeleteButton = memo(
  forwardRef<HTMLButtonElement, DeleteButtonProps>(
    (
      {
        onClick,
        tooltip = "Delete",
        tooltipPlacement = "bottom",
        buttonSize = "small",
        iconVariant = "delete",
        nodrag = true,
        disabled = false,
        className,
        sx
      },
      ref
    ) => {
      const theme = useTheme();

      const handleClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          onClick(e);
        },
        [onClick]
      );

      const Icon =
        iconVariant === "clear"
          ? ClearIcon
          : iconVariant === "outline"
            ? DeleteOutlineIcon
            : DeleteIcon;

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
            className={cn(
              "delete-button",
              nodrag && editorClassNames.nodrag,
              className
            )}
            onClick={handleClick}
            disabled={disabled}
            size={buttonSize}
            sx={{
              color: theme.vars.palette.grey[300],
              "&:hover": {
                color: theme.vars.palette.error.main,
                backgroundColor: "rgba(244, 67, 54, 0.08)"
              },
              ...sx
            }}
          >
            <Icon fontSize={buttonSize} />
          </IconButton>
        </Tooltip>
      );
    }
  )
);

DeleteButton.displayName = "DeleteButton";
