/** @jsxImportSource @emotion/react */
/**
 * NodeNumberInput
 *
 * A number input primitive for editor/node UI that applies consistent styling
 * via sx and maintains nodrag behavior. Supports drag interactions and optional slider.
 *
 * Accepts semantic props for state-based styling:
 * - `changed`: Shows visual indicator when value differs from default
 * - `invalid`: Shows error state
 * - `density`: Controls compact vs normal sizing
 */

import React, { forwardRef } from "react";
import { TextField, TextFieldProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "./EditorUiContext";
import { editorUiClasses } from "../../constants/editorUiClasses";
import { editorClassNames, cn } from "./editorUtils";

export interface NodeNumberInputProps
  extends Omit<TextFieldProps, "variant" | "size" | "type"> {
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
  /**
   * Minimum value
   */
  min?: number;
  /**
   * Maximum value
   */
  max?: number;
  /**
   * Step increment
   */
  step?: number;
}

/**
 * A styled number input for use in node properties and editor UI.
 * Applies editor tokens for consistent styling and maintains nodrag behavior.
 *
 * @example
 * <NodeNumberInput
 *   value={value}
 *   onChange={(e) => onChange(Number(e.target.value))}
 *   min={0}
 *   max={100}
 *   changed={hasChanged}
 * />
 */
export const NodeNumberInput = forwardRef<
  HTMLDivElement,
  NodeNumberInputProps
>(
  (
    {
      className,
      slotProps,
      sx,
      changed,
      invalid,
      density = "compact",
      min,
      max,
      step = 1,
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
      <TextField
        ref={ref}
        type="number"
        variant="outlined"
        size="small"
        fullWidth
        autoComplete="off"
        className={cn(
          editorClassNames.nodrag,
          editorUiClasses.control,
          scopeClass,
          className
        )}
        slotProps={{
          ...slotProps,
          input: {
            ...slotProps?.input,
            className: cn(
              editorClassNames.nodrag,
              editorUiClasses.control,
              scopeClass,
              (slotProps?.input as any)?.className
            )
          },
          htmlInput: {
            ...slotProps?.htmlInput,
            className: cn(
              editorClassNames.nodrag,
              (slotProps?.htmlInput as any)?.className
            ),
            min,
            max,
            step
          }
        }}
        sx={{
          fontSize,
          "& .MuiInputBase-root": {
            height
          },
          // Semantic: changed state - shows right border indicator
          ...(changed && {
            "& .MuiOutlinedInput-root": {
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
            }
          }),
          // Semantic: invalid state - shows error border (preserves changed right border)
          ...(invalid && {
            "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": {
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

NodeNumberInput.displayName = "NodeNumberInput";
