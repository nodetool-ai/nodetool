/** @jsxImportSource @emotion/react */
/**
 * SelectionControls
 *
 * A component for bulk selection controls (Select All / Clear).
 * Used in asset lists, workflow lists, and other multi-select interfaces.
 *
 * @example
 * <SelectionControls
 *   selectedCount={selectedItems.length}
 *   totalCount={items.length}
 *   onSelectAll={handleSelectAll}
 *   onClear={handleClear}
 * />
 */

import React, { forwardRef, memo, useCallback } from "react";
import { Button, ButtonProps, Box, Typography, Tooltip } from "@mui/material";
import CheckBoxIcon from "@mui/icons-material/CheckBox";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import IndeterminateCheckBoxIcon from "@mui/icons-material/IndeterminateCheckBox";
import ClearIcon from "@mui/icons-material/Clear";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface SelectionControlsProps {
  /**
   * Number of currently selected items
   */
  selectedCount: number;
  /**
   * Total number of items available
   */
  totalCount: number;
  /**
   * Callback when Select All is clicked
   */
  onSelectAll: () => void;
  /**
   * Callback when Clear is clicked
   */
  onClear: () => void;
  /**
   * Whether to show the selection count
   * @default true
   */
  showCount?: boolean;
  /**
   * Custom "Select All" label
   * @default "Select All"
   */
  selectAllLabel?: string;
  /**
   * Custom "Clear" label
   * @default "Clear"
   */
  clearLabel?: string;
  /**
   * Display variant
   * - "buttons": Separate buttons for select all and clear
   * - "toggle": Single checkbox button that toggles
   * @default "buttons"
   */
  variant?: "buttons" | "toggle";
  /**
   * Button size
   * @default "small"
   */
  size?: "small" | "medium";
  /**
   * Whether to add nodrag class for ReactFlow compatibility
   * @default true
   */
  nodrag?: boolean;
  /**
   * Additional class name
   */
  className?: string;
  /**
   * Additional sx props for the container
   */
  sx?: ButtonProps["sx"];
}

/**
 * Selection controls for bulk select/clear operations.
 */
export const SelectionControls = memo(
  forwardRef<HTMLDivElement, SelectionControlsProps>(
    (
      {
        selectedCount,
        totalCount,
        onSelectAll,
        onClear,
        showCount = true,
        selectAllLabel = "Select All",
        clearLabel = "Clear",
        variant = "buttons",
        size = "small",
        nodrag = true,
        className,
        sx
      },
      ref
    ) => {
      const theme = useTheme();

      const isAllSelected = selectedCount === totalCount && totalCount > 0;
      const isPartiallySelected = selectedCount > 0 && selectedCount < totalCount;
      const hasSelection = selectedCount > 0;

      const handleToggle = useCallback(() => {
        if (hasSelection) {
          onClear();
        } else {
          onSelectAll();
        }
      }, [hasSelection, onSelectAll, onClear]);

      const getCheckboxIcon = () => {
        if (isAllSelected) {
          return <CheckBoxIcon />;
        }
        if (isPartiallySelected) {
          return <IndeterminateCheckBoxIcon />;
        }
        return <CheckBoxOutlineBlankIcon />;
      };

      const buttonSx = {
        minWidth: "auto",
        textTransform: "none" as const,
        fontSize: size === "small" ? theme.fontSizeSmaller : theme.fontSizeSmall,
        padding: size === "small" ? "2px 8px" : "4px 12px",
        color: theme.vars.palette.grey[300],
        "&:hover": {
          backgroundColor: theme.vars.palette.grey[800],
          color: theme.vars.palette.grey[100]
        }
      };

      if (variant === "toggle") {
        return (
          <Box
            ref={ref}
            className={cn(
              "selection-controls",
              nodrag && editorClassNames.nodrag,
              className
            )}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              ...sx
            }}
          >
            <Tooltip
              title={hasSelection ? clearLabel : selectAllLabel}
              enterDelay={TOOLTIP_ENTER_DELAY}
              enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            >
              <Button
                className="selection-toggle-button"
                onClick={handleToggle}
                disabled={totalCount === 0}
                size={size}
                startIcon={getCheckboxIcon()}
                sx={{
                  ...buttonSx,
                  color: hasSelection
                    ? "var(--palette-primary-main)"
                    : theme.vars.palette.grey[300]
                }}
              >
                {showCount && (
                  <span>
                    {selectedCount}/{totalCount}
                  </span>
                )}
              </Button>
            </Tooltip>
          </Box>
        );
      }

      // Buttons variant
      return (
        <Box
          ref={ref}
          className={cn(
            "selection-controls",
            nodrag && editorClassNames.nodrag,
            className
          )}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            ...sx
          }}
        >
          {showCount && hasSelection && (
            <Typography
              variant="body2"
              sx={{
                color: "var(--palette-primary-main)",
                fontSize: size === "small" ? theme.fontSizeSmaller : theme.fontSizeSmall,
                marginRight: 1
              }}
            >
              {selectedCount} selected
            </Typography>
          )}
          <Tooltip
            title={selectAllLabel}
            enterDelay={TOOLTIP_ENTER_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          >
            <Button
              className="select-all-button"
              onClick={onSelectAll}
              disabled={isAllSelected || totalCount === 0}
              size={size}
              sx={buttonSx}
            >
              {selectAllLabel}
            </Button>
          </Tooltip>
          <Tooltip
            title={clearLabel}
            enterDelay={TOOLTIP_ENTER_DELAY}
            enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
          >
            <Button
              className="clear-button"
              onClick={onClear}
              disabled={!hasSelection}
              size={size}
              startIcon={<ClearIcon sx={{ fontSize: "1rem !important" }} />}
              sx={buttonSx}
            >
              {clearLabel}
            </Button>
          </Tooltip>
        </Box>
      );
    }
  )
);

SelectionControls.displayName = "SelectionControls";
