import React, { forwardRef } from "react";
import { Select, SelectProps, MenuItem, MenuItemProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../EditorUiContext";

export interface NodeSelectProps extends Omit<SelectProps, "variant" | "size"> {
  /** Value differs from default — shows visual indicator */
  changed?: boolean;
  /** Validation failed — shows error state */
  invalid?: boolean;
}

/**
 * NodeSelect is a themed dropdown select component for the editor UI.
 * It automatically adapts its size based on the editor scope (node vs inspector)
 * and supports semantic props for changed/invalid states.
 */
export const NodeSelect = forwardRef<HTMLDivElement, NodeSelectProps>(
  ({ changed, invalid, sx, MenuProps, ...props }, ref) => {
    const theme = useTheme();
    const scope = useEditorScope();

    const fontSize =
      scope === "inspector" ? theme.fontSizeNormal : theme.fontSizeSmall;
    const height = scope === "inspector" ? 28 : 24;

    return (
      <Select
        ref={ref}
        variant="outlined"
        size="small"
        className="nodrag"
        MenuProps={{
          ...MenuProps,
          PaperProps: {
            ...MenuProps?.PaperProps,
            sx: {
              backgroundColor: theme.vars.palette.grey[800],
              border: `1px solid ${theme.vars.palette.divider}`,
              borderRadius: "8px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
              ...MenuProps?.PaperProps?.sx
            }
          }
        }}
        sx={{
          fontSize,
          height,
          backgroundColor: theme.vars.palette.grey[900],
          borderRadius: "6px",

          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.vars.palette.divider,
            transition: "border-color 0.2s ease"
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.vars.palette.grey[500]
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.vars.palette.primary.main,
            borderWidth: 1
          },

          // Semantic: changed state
          ...(changed && {
            "& .MuiOutlinedInput-notchedOutline": {
              borderRightWidth: 2,
              borderRightColor: theme.vars.palette.primary.main
            }
          }),

          // Semantic: invalid state
          ...(invalid && {
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: theme.vars.palette.error.main
            }
          }),

          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeSelect.displayName = "NodeSelect";

export interface NodeMenuItemProps extends MenuItemProps {}

/**
 * NodeMenuItem is a themed menu item for use within NodeSelect dropdowns.
 */
export const NodeMenuItem = forwardRef<HTMLLIElement, NodeMenuItemProps>(
  ({ sx, ...props }, ref) => {
    const theme = useTheme();

    return (
      <MenuItem
        ref={ref}
        dense
        sx={{
          fontSize: theme.fontSizeSmall,
          borderRadius: "4px",
          margin: "2px 4px",
          "&:hover": {
            backgroundColor: theme.vars.palette.action.hover
          },
          "&.Mui-selected": {
            backgroundColor: theme.vars.palette.action.selected,
            color: theme.vars.palette.primary.main
          },
          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeMenuItem.displayName = "NodeMenuItem";
