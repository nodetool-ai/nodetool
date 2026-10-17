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

import { memo, type ReactNode, type Ref } from "react";
import { Button, ButtonProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "./EditorUiContext";
import { editorClassNames, cn } from "./editorUtils";

import {
  BORDER_RADIUS,
  CONTROL,
  getSpacingPx,
  SPACING,
  Tooltip
} from "../ui_primitives";
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
  /** Saves the href instead of navigating to it; "" keeps the server's name. */
  download?: string;
  ref?: Ref<HTMLButtonElement>;
  /**
   * Explains the button on hover and keyboard focus. Use it instead of a
   * native `title`. It describes the button and leaves its label alone, and
   * it still shows while the button is disabled.
   */
  tooltip?: ReactNode;
  /** Keyboard shortcut shown in the tooltip, e.g. ["Ctrl", "Enter"] */
  shortcut?: string[];
  /**
   * Why the button is disabled. Replaces the tooltip while `disabled` is set,
   * so the user learns what to do instead of seeing nothing.
   */
  disabledReason?: ReactNode;
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
export function EditorButton({
  density = "compact",
  size,
  href,
  target,
  rel,
  sx,
  className,
  ref,
  tooltip: tooltipProp,
  shortcut,
  disabledReason,
  ...props
}: EditorButtonProps) {
  const showReason = Boolean(props.disabled && disabledReason);
  const tooltip = showReason ? disabledReason : tooltipProp;
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

  const button = (
    <Button
      ref={ref}
      size={size ?? "small"}
      className={cn(editorClassNames.nodrag, className)}
      {...(href ? { href, target, rel, component: "a" as const } : {})}
      sx={[
        {
          fontSize,
          height,
          minWidth: "auto",
          padding: `${getSpacingPx(SPACING.xs)} ${paddingX}px`,
          borderRadius: BORDER_RADIUS.md,
          textTransform: "none"
        },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
      {...props}
    />
  );

  if (!tooltip) {
    return button;
  }
  // The wrapper stays mounted whether or not the button is disabled: a
  // disabled button fires no hover events, and swapping the wrapper in and
  // out would remount the button and drop its focus.
  return (
    <Tooltip title={tooltip} shortcut={showReason ? undefined : shortcut} describeChild>
      <span
        style={
          props.fullWidth
            ? { display: "flex", width: "100%" }
            : { display: "inline-flex" }
        }
      >
        {button}
      </span>
    </Tooltip>
  );
}

export default memo(EditorButton);
