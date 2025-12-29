/** @jsxImportSource @emotion/react */
/**
 * NodeTextField
 *
 * A TextField primitive for editor/node UI that applies consistent styling
 * via sx/slotProps and maintains nodrag behavior.
 */

import React, { forwardRef } from "react";
import { TextField, TextFieldProps } from "@mui/material";
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
        className={cn(editorClassNames.nodrag, className)}
        slotProps={{
          ...slotProps,
          input: {
            ...slotProps?.input,
            className: cn(
              editorClassNames.nodrag,
              editorUiClasses.control,
              scopeClass,
              (slotProps?.input as SlotPropsWithClassName | undefined)
                ?.className
            )
          },
          htmlInput: {
            ...slotProps?.htmlInput,
            className: cn(
              editorClassNames.nodrag,
              (slotProps?.htmlInput as SlotPropsWithClassName | undefined)
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

NodeTextField.displayName = "NodeTextField";
