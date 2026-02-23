/**
 * DeleteButton
 *
 * A standardized delete button with destructive styling.
 *
 * @example
 * <DeleteButton onClick={handleDelete} tooltip="Delete item" />
 */

import React, { memo, forwardRef, useCallback, useMemo, ReactNode } from "react";
import { IconButton, Tooltip } from "@mui/material";
import TrashIcon from "../../icons/trash.svg?react";
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
   * Tooltip text or element
   * @default "Delete"
   */
  tooltip?: ReactNode;
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
  /**
   * Tab index for keyboard navigation
   * @default 0
   */
  tabIndex?: number;
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
        sx,
        tabIndex = 0
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

      const iconSize =
        buttonSize === "small" ? 18 : buttonSize === "medium" ? 20 : 24;

      const buttonSx = useMemo(() => ({
        color: "inherit",
        transition: "all 0.15s ease-in-out",
        "&:hover": {
          color: theme.vars.palette.error.main,
          backgroundColor: "rgba(244, 67, 54, 0.08)",
          transform: "scale(1.1)"
        },
        ...sx
      }), [theme, sx]);

      const renderIcon = () => {
        if (iconVariant === "clear") {
          return <ClearIcon fontSize={buttonSize} />;
        }
        if (iconVariant === "outline") {
          return <DeleteOutlineIcon fontSize={buttonSize} />;
        }
        return <TrashIcon width={iconSize} height={iconSize} />;
      };

      return (
        <Tooltip
          title={tooltip}
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          placement={tooltipPlacement}
        >
          <IconButton
            ref={ref}
            tabIndex={tabIndex}
            aria-label={typeof tooltip === "string" ? tooltip : "Delete"}
            className={cn(
              "delete-button",
              nodrag && editorClassNames.nodrag,
              className
            )}
            onClick={handleClick}
            disabled={disabled}
            size={buttonSize}
            sx={buttonSx}
          >
            {renderIcon()}
          </IconButton>
        </Tooltip>
      );
    }
  )
);

DeleteButton.displayName = "DeleteButton";
