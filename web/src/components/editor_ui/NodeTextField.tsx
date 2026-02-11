/** @jsxImportSource @emotion/react */
/**
 * NodeTextField
 *
 * A TextField primitive for editor/node UI that applies consistent styling
 * via sx/slotProps and maintains nodrag behavior.
 *
 * Accepts semantic props for state-based styling:
 * - `changed`: Shows visual indicator when value differs from default
 * - `invalid`: Shows error state styling
 * - `density`: Controls compact vs normal sizing
 */

import React, { forwardRef, memo } from "react";
import { TextField, TextFieldProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "./EditorUiContext";
import { editorUiClasses } from "../../constants/editorUiClasses";
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
 * A styled TextField for use in node properties and editor UI.
 * Applies editor tokens for consistent styling and maintains nodrag behavior.
 *
 * @example
 * <NodeTextField
 *   value={value}
 *   onChange={(e) => onChange(e.target.value)}
 *   changed={hasChanged}
 *   invalid={hasError}
 *   multiline
 *   minRows={1}
 *   maxRows={2}
 * />
 */
export const NodeTextField = forwardRef<HTMLDivElement, NodeTextFieldProps>(
  (
    {
      className,
      slotProps,
      sx,
      changed,
      invalid,
      // Extract legacy props that Autocomplete passes - these contain critical refs
      InputProps,
      inputProps,
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
        className={cn(
          editorClassNames.nodrag,
          editorUiClasses.control,
          scopeClass,
          className
        )}
        slotProps={
          {
            ...slotProps,
            input: {
              // Merge legacy InputProps (from Autocomplete) with slotProps.input
              ...InputProps,
              ...slotProps?.input,
              className: cn(
                editorClassNames.nodrag,
                editorUiClasses.control,
                scopeClass,
                (InputProps as SlotPropsWithClassName | undefined)?.className,
                (slotProps?.input as SlotPropsWithClassName | undefined)
                  ?.className
              )
            },
            htmlInput: {
              // Merge legacy inputProps (from Autocomplete) with slotProps.htmlInput
              ...inputProps,
              ...slotProps?.htmlInput,
              className: cn(
                editorClassNames.nodrag,
                (inputProps as SlotPropsWithClassName | undefined)?.className,
                (slotProps?.htmlInput as SlotPropsWithClassName | undefined)
                  ?.className
              )
            }
          } as any
        }
        sx={{
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

NodeTextField.displayName = "NodeTextField";

const NodeTextFieldMemo = memo(NodeTextField);
NodeTextFieldMemo.displayName = "NodeTextField";

export default NodeTextFieldMemo;
