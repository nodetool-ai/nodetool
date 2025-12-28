/** @jsxImportSource @emotion/react */
/**
 * NodeSelect and NodeMenuItem
 *
 * Select primitives for editor/node UI that apply consistent styling
 * via sx/slotProps and maintain nodrag behavior.
 */

import React, { forwardRef } from "react";
import { Select, SelectProps, MenuItem, MenuItemProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorTokens } from "./EditorUiContext";
import { editorClassNames, cn } from "./editorUtils";

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
    const theme = useTheme();
    const tokens = useEditorTokens();

    return (
      <Select
        ref={ref}
        variant="standard"
        disableUnderline
        className={cn(editorClassNames.nodrag, className)}
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
            sx: {
              backgroundColor: tokens.surface.menuBg,
              border: `${tokens.border.width} solid ${tokens.border.color}`,
              borderRadius: tokens.radii.panel,
              boxShadow: tokens.shadow.menu,
              ...MenuProps?.PaperProps?.sx
            }
          }
        }}
        sx={{
          // Root select styles
          width: "100%",

          // The select button/display
          "& .MuiSelect-select": {
            width: "100%",
            padding: `${tokens.control.padY} ${tokens.control.padX}`,
            paddingRight: "24px !important",
            fontSize: tokens.text.controlSize,
            backgroundColor: tokens.surface.controlBg,
            borderRadius: tokens.radii.control,
            border: `${tokens.border.width} solid ${tokens.border.color}`,
            margin: 0,
            minHeight: tokens.control.heightSm,
            display: "flex",
            alignItems: "center",
            transition: `border-color ${tokens.transition.normal}, background-color ${tokens.transition.normal}`,

            "&:hover": {
              backgroundColor: tokens.surface.controlBgHover,
              borderColor: tokens.border.colorHover
            },

            "&:focus": {
              backgroundColor: tokens.surface.controlBgFocus,
              borderColor: tokens.border.colorFocus
            }
          },

          // Dropdown icon
          "& .MuiSelect-icon": {
            color: theme.vars.palette.grey[400],
            right: tokens.control.padX
          },

          // Allow custom sx to override
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
    const theme = useTheme();
    const tokens = useEditorTokens();

    return (
      <MenuItem
        ref={ref}
        className={className}
        sx={{
          fontSize: tokens.text.controlSize,
          padding: `${tokens.control.padY} ${tokens.control.padX}`,
          fontWeight: 300,
          backgroundColor: theme.vars.palette.grey[600],
          transition: `background-color ${tokens.transition.fast}`,

          "&:nth-of-type(even)": {
            backgroundColor: theme.vars.palette.grey[700]
          },

          "&:hover": {
            backgroundColor: theme.vars.palette.grey[500]
          },

          "&.Mui-selected": {
            backgroundColor: theme.vars.palette.grey[600],
            color: theme.vars.palette.primary.main,

            "&:hover": {
              backgroundColor: theme.vars.palette.grey[500]
            }
          },

          // Allow custom sx to override
          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeMenuItem.displayName = "NodeMenuItem";
