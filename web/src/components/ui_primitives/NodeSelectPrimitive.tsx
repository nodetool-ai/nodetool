/** @jsxImportSource @emotion/react */
/**
 * NodeSelect
 *
 * A Select primitive for editor/node UI that applies consistent styling
 * via sx and maintains nodrag behavior. This is a simplified, theme-driven
 * select component that uses MUI's native Select.
 *
 * Accepts semantic props for state-based styling:
 * - `changed`: Shows visual indicator when value differs from default
 * - `invalid`: Shows error state
 * - `density`: Controls compact vs normal sizing
 */

import React, { forwardRef } from "react";
import {
  Select,
  SelectProps,
  MenuItem,
  MenuItemProps,
  FormControl
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../editor_ui/EditorUiContext";
import { editorUiClasses } from "../../constants/editorUiClasses";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface NodeSelectProps
  extends Omit<SelectProps, "variant" | "size"> {
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
  /**
   * Density variant
   */
  density?: "compact" | "normal";
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
 * >
 *   <NodeMenuItem value="option1">Option 1</NodeMenuItem>
 *   <NodeMenuItem value="option2">Option 2</NodeMenuItem>
 * </NodeSelect>
 */
export const NodeSelectPrimitive = forwardRef<HTMLDivElement, NodeSelectProps>(
  (
    {
      className,
      sx,
      changed,
      invalid,
      density = "compact",
      children,
      ...props
    },
    ref
  ) => {
    const theme = useTheme();
    const scope = useEditorScope();
    const scopeClass =
      scope === "inspector"
        ? editorUiClasses.scopeInspector
        : editorUiClasses.scopeNode;

    const fontSize =
      scope === "inspector" ? theme.fontSizeSmall : theme.fontSizeTiny;
    const height = density === "compact" ? 24 : 28;

    return (
      <FormControl
        fullWidth
        size="small"
        ref={ref}
        className={cn(editorClassNames.nodrag, className)}
      >
        <Select
          className={cn(
            editorClassNames.nodrag,
            editorUiClasses.control,
            scopeClass
          )}
          variant="outlined"
          size="small"
          sx={{
            fontSize,
            height,
            // Semantic: changed state - shows right border indicator
            ...(changed && {
              "& .MuiOutlinedInput-notchedOutline": {
                borderRightWidth: 2,
                borderRightColor: theme.vars.palette.primary.main
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderRightWidth: 2,
                borderRightColor: theme.vars.palette.primary.main
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderRightWidth: 2,
                borderRightColor: theme.vars.palette.primary.main
              }
            }),
            // Semantic: invalid state - shows error border (preserves changed right border)
            ...(invalid && {
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: theme.vars.palette.error.main
              }
            }),
            ...sx
          }}
          MenuProps={{
            classes: {
              paper: editorUiClasses.menuPaper,
              list: editorUiClasses.menuList
            }
          }}
          {...props}
        >
          {children}
        </Select>
      </FormControl>
    );
  }
);

NodeSelectPrimitive.displayName = "NodeSelect";

/**
 * A styled MenuItem for use with NodeSelect.
 * Applies consistent editor styling.
 *
 * @example
 * <NodeMenuItem value="option1">Option 1</NodeMenuItem>
 */
export const NodeMenuItem = forwardRef<HTMLLIElement, MenuItemProps>(
  ({ className, ...props }, ref) => {
    return (
      <MenuItem
        ref={ref}
        className={cn(editorUiClasses.menuItem, className)}
        {...props}
      />
    );
  }
);

NodeMenuItem.displayName = "NodeMenuItem";
