import React, { forwardRef } from "react";
import { TextField, TextFieldProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../EditorUiContext";

/**
 * Semantic props for editor primitives.
 * These props express state that affects the visual appearance of controls.
 */
export interface EditorPrimitiveProps {
  /** Value differs from default — shows visual indicator */
  changed?: boolean;
  /** Validation failed — shows error state */
  invalid?: boolean;
  /** Density variant for spacing */
  density?: "compact" | "normal";
}

export interface NodeTextFieldProps
  extends Omit<TextFieldProps, "variant" | "size">,
    EditorPrimitiveProps {}

/**
 * NodeTextField is a themed text input component for the editor UI.
 * It automatically adapts its size based on the editor scope (node vs inspector)
 * and supports semantic props for changed/invalid states.
 */
export const NodeTextField = forwardRef<HTMLDivElement, NodeTextFieldProps>(
  ({ changed, invalid, density = "compact", sx, ...props }, ref) => {
    const theme = useTheme();
    const scope = useEditorScope();

    // Scope-specific values
    const fontSize =
      scope === "inspector" ? theme.fontSizeNormal : theme.fontSizeSmall;
    const height = scope === "inspector" ? 28 : 24;

    return (
      <TextField
        ref={ref}
        variant="outlined"
        size="small"
        fullWidth
        autoComplete="off"
        className="nodrag"
        slotProps={{
          input: { className: "nodrag" },
          htmlInput: { className: "nodrag" }
        }}
        sx={{
          // Base styles
          fontSize,
          "& .MuiOutlinedInput-root": {
            height: density === "compact" ? height : height + 4,
            backgroundColor: theme.vars.palette.grey[900],
            borderRadius: "6px",
            "& fieldset": {
              borderColor: theme.vars.palette.divider,
              transition: "border-color 0.2s ease"
            },
            "&:hover fieldset": {
              borderColor: theme.vars.palette.grey[500]
            },
            "&.Mui-focused fieldset": {
              borderColor: theme.vars.palette.primary.main,
              borderWidth: 1
            }
          },

          // Semantic: changed state
          ...(changed && {
            "& .MuiOutlinedInput-root fieldset": {
              borderRightWidth: 2,
              borderRightColor: theme.vars.palette.primary.main
            }
          }),

          // Semantic: invalid state
          ...(invalid && {
            "& .MuiOutlinedInput-root fieldset": {
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

NodeTextField.displayName = "NodeTextField";
