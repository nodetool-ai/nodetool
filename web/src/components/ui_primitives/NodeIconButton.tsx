/** @jsxImportSource @emotion/react */
/**
 * NodeIconButton
 *
 * An IconButton primitive for editor/node UI that applies consistent styling
 * via sx and maintains nodrag behavior.
 *
 * Accepts semantic props for state-based styling:
 * - `density`: Controls compact vs normal sizing
 * - `changed`: Shows visual indicator when value differs from default
 */

import React, { forwardRef } from "react";
import { IconButton, IconButtonProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../editor_ui/EditorUiContext";
import { editorClassNames, cn } from "../editor_ui/editorUtils";

export interface NodeIconButtonProps extends Omit<IconButtonProps, "size"> {
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
 * A styled IconButton for use in node properties and editor UI.
 * Applies editor tokens for consistent styling and maintains nodrag behavior.
 *
 * @example
 * <NodeIconButton
 *   onClick={handleClick}
 *   density="compact"
 * >
 *   <DeleteIcon />
 * </NodeIconButton>
 *
 * @example
 * // With changed indicator
 * <NodeIconButton
 *   onClick={handleClose}
 *   changed={hasChanged}
 * >
 *   <CloseIcon />
 * </NodeIconButton>
 */
export const NodeIconButton = forwardRef<HTMLButtonElement, NodeIconButtonProps>(
  ({ className, sx, changed, density = "compact", ...props }, ref) => {
    const theme = useTheme();
    const scope = useEditorScope();

    const size = density === "compact" ? 24 : 32;
    const iconFontSize =
      scope === "inspector" ? theme.fontSizeSmall : theme.fontSizeTiny;

    return (
      <IconButton
        ref={ref}
        size="small"
        className={cn(editorClassNames.nodrag, className)}
        sx={{
          width: size,
          height: size,
          padding: density === "compact" ? "4px" : "6px",
          borderRadius: "6px",
          // Icon sizing
          "& .MuiSvgIcon-root": {
            fontSize: iconFontSize
          },
          // Changed indicator - border highlight
          ...(changed && {
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: theme.vars.palette.primary.main
          }),
          // Consistent hover/focus states
          "&:hover": {
            backgroundColor: theme.vars.palette.action.hover
          },
          "&:focus-visible": {
            outline: `2px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: 1
          },
          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeIconButton.displayName = "NodeIconButton";
