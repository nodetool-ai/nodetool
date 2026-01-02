/** @jsxImportSource @emotion/react */
/**
 * NodeButton
 *
 * A Button primitive for editor/node UI that applies consistent styling
 * via sx and maintains nodrag behavior.
 *
 * Accepts semantic props for state-based styling:
 * - `density`: Controls compact vs normal sizing
 * - `changed`: Shows visual indicator when value differs from default
 * - `variant`: Button variant (contained, outlined, text)
 */

import React, { forwardRef } from "react";
import { Button, ButtonProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../editor_ui/EditorUiContext";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface NodeButtonProps extends Omit<ButtonProps, "size"> {
  /**
   * Additional class name for the root element.
   */
  className?: string;
  /**
   * Value differs from default — shows visual indicator
   */
  changed?: boolean;
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
 * <NodeButton
 *   onClick={handleClick}
 *   density="compact"
 *   variant="contained"
 * >
 *   Click me
 * </NodeButton>
 *
 * @example
 * // With changed indicator
 * <NodeButton
 *   onClick={handleReset}
 *   changed={hasChanged}
 * >
 *   Reset
 * </NodeButton>
 */
export const NodeButton = forwardRef<HTMLButtonElement, NodeButtonProps>(
  (
    { className, sx, changed, density = "compact", variant = "text", ...props },
    ref
  ) => {
    const theme = useTheme();
    const scope = useEditorScope();

    const fontSize =
      scope === "inspector" ? theme.fontSizeSmall : theme.fontSizeTiny;
    const height = density === "compact" ? 24 : 28;

    return (
      <Button
        ref={ref}
        size="small"
        variant={variant}
        className={cn(editorClassNames.nodrag, className)}
        sx={{
          fontSize,
          height,
          minWidth: "auto",
          padding: "4px 8px",
          borderRadius: "6px",
          textTransform: "none",
          // Changed indicator - right border highlight
          ...(changed && {
            borderRightWidth: 2,
            borderRightStyle: "solid",
            borderRightColor: theme.vars.palette.primary.main
          }),
          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeButton.displayName = "NodeButton";
