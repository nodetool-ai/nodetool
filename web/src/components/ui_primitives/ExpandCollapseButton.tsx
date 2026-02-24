/** @jsxImportSource @emotion/react */
/**
 * ExpandCollapseButton
 *
 * A button for expanding or collapsing content sections.
 * Provides animated rotation and consistent styling.
 *
 * @example
 * <ExpandCollapseButton
 *   expanded={isExpanded}
 *   onClick={() => setIsExpanded(!isExpanded)}
 * />
 */

import React, { forwardRef, memo } from "react";
import { IconButton, IconButtonProps, Tooltip } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface ExpandCollapseButtonProps
  extends Omit<IconButtonProps, "children"> {
  /**
   * Whether the content is expanded
   */
  expanded: boolean;
  /**
   * Icon style variant
   * - "rotate": Uses ExpandMore icon that rotates
   * - "chevron": Toggles between ChevronRight and ExpandMore
   * @default "rotate"
   */
  iconVariant?: "rotate" | "chevron";
  /**
   * Custom expand tooltip
   * @default "Expand"
   */
  expandTooltip?: string;
  /**
   * Custom collapse tooltip
   * @default "Collapse"
   */
  collapseTooltip?: string;
  /**
   * Tooltip placement
   * @default "top"
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
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
  /**
   * Button size
   * @default "small"
   */
  buttonSize?: "small" | "medium";
}

/**
 * Button for expanding/collapsing content with animated icon.
 */
export const ExpandCollapseButton = memo(
  forwardRef<HTMLButtonElement, ExpandCollapseButtonProps>(
    (
      {
        expanded,
        iconVariant = "rotate",
        expandTooltip = "Expand",
        collapseTooltip = "Collapse",
        tooltipPlacement = "top",
        nodrag = true,
        buttonSize = "small",
        className,
        sx,
        ...props
      },
      ref
    ) => {
      const theme = useTheme();

      const tooltip = expanded ? collapseTooltip : expandTooltip;

      const getIcon = () => {
        if (iconVariant === "chevron") {
          return expanded ? <ExpandMoreIcon /> : <ChevronRightIcon />;
        }
        // rotate variant - same icon, different rotation
        return <ExpandMoreIcon />;
      };

      const getSizeStyles = () => {
        if (buttonSize === "medium") {
          return {
            width: 32,
            height: 32,
            "& svg": { fontSize: 22 }
          };
        }
        return {
          width: 24,
          height: 24,
          "& svg": { fontSize: 18 }
        };
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
            className={cn(
              "expand-collapse-button",
              nodrag && editorClassNames.nodrag,
              expanded && "expanded",
              className
            )}
            aria-label={tooltip}
            sx={{
              ...getSizeStyles(),
              color: theme.vars.palette.grey[300],
              padding: 0,
              transition: "transform 0.2s ease-in-out, color 0.2s ease-in-out",
              transform:
                iconVariant === "rotate" && expanded
                  ? "rotate(180deg)"
                  : "rotate(0deg)",
              "&:hover": {
                backgroundColor: theme.vars.palette.grey[800],
                color: theme.vars.palette.grey[100]
              },
              ...sx
            }}
            {...props}
          >
            {getIcon()}
          </IconButton>
        </Tooltip>
      );
    }
  )
);

ExpandCollapseButton.displayName = "ExpandCollapseButton";
