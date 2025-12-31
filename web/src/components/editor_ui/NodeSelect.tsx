/** @jsxImportSource @emotion/react */
/**
 * NodeSelect and NodeMenuItem
 *
 * Select primitives for editor/node UI that apply consistent styling
 * via sx/slotProps and maintain nodrag behavior.
 *
 * Accepts semantic props for state-based styling:
 * - `changed`: Shows visual indicator when value differs from default
 * - `invalid`: Shows error state styling
 */

import React, { forwardRef } from "react";
import { Select, SelectProps, MenuItem, MenuItemProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "./EditorUiContext";
import { editorUiClasses } from "../../constants/editorUiClasses";
import { editorClassNames, cn } from "./editorUtils";

export interface NodeSelectProps extends Omit<SelectProps, "size"> {
  /**
   * Additional class name for the root element.
   */
  className?: string;
  /**
   * Value differs from default — shows visual indicator (right border)
   */
  changed?: boolean;
  /**
   * Validation failed — shows error state
   */
  invalid?: boolean;
}

/**
 * A styled Select for use in node properties and editor UI.
 * Applies editor tokens for consistent styling and maintains nodrag behavior.
 *
 * @example
 * <NodeSelect
 *   value={value}
 *   onChange={(e) => onChange(e.target.value)}
 *   changed={hasChanged}
 *   invalid={hasError}
 * >
 *   <NodeMenuItem value="option1">Option 1</NodeMenuItem>
 *   <NodeMenuItem value="option2">Option 2</NodeMenuItem>
 * </NodeSelect>
 */
export const NodeSelect = forwardRef<HTMLDivElement, NodeSelectProps>(
  ({ className, sx, MenuProps, changed, invalid, ...props }, ref) => {
    const theme = useTheme();
    const scope = useEditorScope();
    const scopeClass =
      scope === "inspector"
        ? editorUiClasses.scopeInspector
        : editorUiClasses.scopeNode;

    return (
      <Select
        ref={ref}
        variant="standard"
        disableUnderline
        className={cn(
          editorClassNames.nodrag,
          editorUiClasses.control,
          scopeClass,
          className
        )}
        MenuProps={{
          anchorOrigin: {
            vertical: "bottom",
            horizontal: "left"
          },
          transformOrigin: {
            vertical: "top",
            horizontal: "left"
          },
          ...MenuProps,
          PaperProps: {
            ...MenuProps?.PaperProps,
            className: cn(
              editorUiClasses.menuPaper,
              (MenuProps?.PaperProps as { className?: string } | undefined)
                ?.className
            )
          }
        }}
        sx={{
          // Semantic: changed state - shows right border indicator
          ...(changed && {
            borderRight: `2px solid ${theme.vars.palette.primary.main}`
          }),
          // Semantic: invalid state - shows error border
          ...(invalid && {
            borderColor: theme.vars.palette.error.main
          }),
          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeSelect.displayName = "NodeSelect";

export interface NodeMenuItemProps extends MenuItemProps {
  /**
   * Additional class name for the root element.
   */
  className?: string;
}

/**
 * A styled MenuItem for use with NodeSelect.
 * Applies editor tokens for consistent styling.
 *
 * @example
 * <NodeSelect value={value} onChange={handleChange}>
 *   <NodeMenuItem value="option1">Option 1</NodeMenuItem>
 * </NodeSelect>
 */
export const NodeMenuItem = forwardRef<HTMLLIElement, NodeMenuItemProps>(
  ({ className, sx, ...props }, ref) => {
    return (
      <MenuItem
        ref={ref}
        className={cn(editorUiClasses.menuItem, className)}
        sx={sx}
        {...props}
      />
    );
  }
);

NodeMenuItem.displayName = "NodeMenuItem";
