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

import { forwardRef, memo } from "react";
import { Button, ButtonProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "./EditorUiContext";
import { editorClassNames, cn } from "./editorUtils";

import { BORDER_RADIUS, CONTROL } from "../ui_primitives";
export interface EditorButtonProps extends Omit<ButtonProps, "size"> {
  /**
   * Density variant
   */
  density?: "compact" | "normal";
  /**
   * MUI button size. When provided, overrides the density-based height.
   */
  size?: "small" | "medium" | "large";
  /**
   * Link target (for use as an anchor element)
   */
  href?: string;
  target?: string;
  rel?: string;
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
  ({ density = "compact", size, href, target, rel, sx, className, ...props }, ref) => {
    const theme = useTheme();
    const scope = useEditorScope();

    const fontSize =
      scope === "inspector" ? theme.fontSizeSmall : theme.fontSizeSmaller;
    const densityHeight =
      density === "compact" ? CONTROL.height.xs : CONTROL.height.sm;
    const sizeHeights = {
      small: CONTROL.height.sm,
      medium: CONTROL.height.md,
      large: CONTROL.height.lg
    } as const;
    const height = size ? sizeHeights[size] : densityHeight;
    const paddingX =
      density === "compact" ? CONTROL.paddingX.compact : CONTROL.paddingX.normal;

    return (
      <Button
        ref={ref}
        size={size ?? "small"}
        className={cn(editorClassNames.nodrag, className)}
        {...(href ? { href, target, rel, component: "a" as const } : {})}
        sx={{
          fontSize,
          height,
          minWidth: "auto",
          padding: `4px ${paddingX}px`,
          borderRadius: BORDER_RADIUS.md,
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
