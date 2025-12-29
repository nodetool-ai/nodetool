/** @jsxImportSource @emotion/react */
/**
 * NodeSelect and NodeMenuItem
 *
 * Select primitives for editor/node UI that apply consistent styling
 * via sx/slotProps and maintain nodrag behavior.
 */

import React, { forwardRef } from "react";
import { Select, SelectProps, MenuItem, MenuItemProps } from "@mui/material";
import { useEditorScope } from "./EditorUiContext";
import { editorClassNames, cn, editorUiClasses } from "./editorUtils";

export interface NodeSelectProps extends Omit<SelectProps, "size"> {
  /**
   * Additional class name for the root element.
   */
  className?: string;
}

/**
 * A styled Select for use in node properties and editor UI.
 * Applies editor tokens for consistent styling and maintains nodrag behavior.
 *
 * @example
 * <NodeSelect
 *   value={value}
 *   onChange={(e) => onChange(e.target.value)}
 * >
 *   <NodeMenuItem value="option1">Option 1</NodeMenuItem>
 *   <NodeMenuItem value="option2">Option 2</NodeMenuItem>
 * </NodeSelect>
 */
export const NodeSelect = forwardRef<HTMLDivElement, NodeSelectProps>(
  ({ className, sx, MenuProps, ...props }, ref) => {
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
        sx={sx}
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
