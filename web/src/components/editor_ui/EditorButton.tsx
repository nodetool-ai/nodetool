/** @jsxImportSource @emotion/react */
/**
 * EditorButton
 *
 * A Button primitive for editor/node UI that applies consistent styling
 * via sx and maintains nodrag behavior.
 *
 * Accepts semantic props for state-based styling:
 * - `density`: Controls compact vs normal sizing
 */

import React, { forwardRef, memo } from "react";
import { Button, ButtonProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "./EditorUiContext";
import { editorClassNames, cn } from "./editorUtils";

export interface EditorButtonProps extends Omit<ButtonProps, "size"> {
  /**
   * Density variant
   */
  density?: "compact" | "normal";
}

/**
 * A styled Button for use in node properties and editor UI.
 * Applies editor tokens for consistent styling and maintains nodrag behavior.
 *
 * @example
 * <EditorButton
 *   onClick={handleClick}
 *   density="compact"
 * >
 *   Click me
 * </EditorButton>
 */
export const EditorButton = forwardRef<HTMLButtonElement, EditorButtonProps>(
  ({ density = "compact", sx, className, ...props }, ref) => {
    const theme = useTheme();
    const scope = useEditorScope();

    const fontSize =
      scope === "inspector" ? theme.fontSizeSmall : theme.fontSizeTiny;
    const height = density === "compact" ? 24 : 28;

    return (
      <Button
        ref={ref}
        size="small"
        className={cn(editorClassNames.nodrag, className)}
        sx={{
          fontSize,
          height,
          minWidth: "auto",
          padding: "4px 8px",
          borderRadius: "6px",
          textTransform: "none",
          ...sx
        }}
        {...props}
      />
    );
  }
);

EditorButton.displayName = "EditorButton";

const EditorButtonMemo = memo(EditorButton);
EditorButtonMemo.displayName = "EditorButton";

export default EditorButtonMemo;
