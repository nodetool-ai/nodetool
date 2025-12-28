/** @jsxImportSource @emotion/react */
/**
 * NodeTextField
 *
 * A TextField primitive for editor/node UI that applies consistent styling
 * via sx/slotProps and maintains nodrag behavior.
 */

import React, { forwardRef } from "react";
import { TextField, TextFieldProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorTokens } from "./EditorUiContext";
import { editorClassNames, cn } from "./editorUtils";

/** Helper type for slotProps with className */
interface SlotPropsWithClassName {
  className?: string;
  [key: string]: unknown;
}

export interface NodeTextFieldProps
  extends Omit<TextFieldProps, "variant" | "size"> {
  /**
   * Additional class name for the root element.
   */
  className?: string;
}

/**
 * A styled TextField for use in node properties and editor UI.
 * Applies editor tokens for consistent styling and maintains nodrag behavior.
 *
 * @example
 * <NodeTextField
 *   value={value}
 *   onChange={(e) => onChange(e.target.value)}
 *   multiline
 *   minRows={1}
 *   maxRows={2}
 * />
 */
export const NodeTextField = forwardRef<HTMLDivElement, NodeTextFieldProps>(
  ({ className, slotProps, sx, ...props }, ref) => {
    const theme = useTheme();
    const tokens = useEditorTokens();

    return (
      <TextField
        ref={ref}
        variant="outlined"
        size="small"
        fullWidth
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cn(editorClassNames.nodrag, className)}
        slotProps={{
          ...slotProps,
          input: {
            ...slotProps?.input,
            className: cn(
              editorClassNames.nodrag,
              (slotProps?.input as SlotPropsWithClassName | undefined)?.className
            )
          },
          htmlInput: {
            ...slotProps?.htmlInput,
            className: cn(
              editorClassNames.nodrag,
              (slotProps?.htmlInput as SlotPropsWithClassName | undefined)?.className
            )
          }
        }}
        sx={{
          // Base text field styles
          "& .MuiOutlinedInput-root": {
            minHeight: "unset",
            padding: 0,
            fontSize: tokens.text.controlSize,
            lineHeight: "1.2em",
            color: tokens.text.color,
            backgroundColor: tokens.surface.controlBg,
            borderRadius: tokens.radii.control,
            transition: `border-color ${tokens.transition.normal}, background-color ${tokens.transition.normal}`,

            "& fieldset": {
              borderColor: tokens.border.color,
              borderWidth: tokens.border.width,
              transition: `border-color ${tokens.transition.normal}`
            },

            "&:hover": {
              backgroundColor: tokens.surface.controlBgHover,
              "& fieldset": {
                borderColor: tokens.border.colorHover
              }
            },

            "&.Mui-focused": {
              backgroundColor: tokens.surface.controlBgFocus,
              "& fieldset": {
                borderColor: tokens.border.colorFocus,
                borderWidth: tokens.border.width
              }
            },

            // Notched outline legend (hide it)
            "& .MuiOutlinedInput-notchedOutline legend": {
              display: "none"
            }
          },

          // Input element styles
          "& .MuiOutlinedInput-input": {
            padding: `${tokens.control.padY} ${tokens.control.padX}`,
            minHeight: "18px",
            lineHeight: "18px"
          },

          // Multiline textarea styles
          "& .MuiInputBase-inputMultiline": {
            padding: `${tokens.control.padY} ${tokens.control.padX}`,
            minHeight: "18px !important",
            maxHeight: "200px",
            overflowY: "auto !important",
            fontFamily: theme.fontFamily1,
            fontSize: tokens.text.controlSize,
            lineHeight: "1.2em",
            resize: "none"
          },

          // Allow custom sx to override
          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeTextField.displayName = "NodeTextField";
