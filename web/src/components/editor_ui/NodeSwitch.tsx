/** @jsxImportSource @emotion/react */
/**
 * NodeSwitch
 *
 * A Switch primitive for editor/node UI that applies consistent styling
 * via sx and maintains nodrag behavior.
 *
 * Accepts semantic props for state-based styling:
 * - `changed`: Shows visual indicator when value differs from default
 */

import React, { forwardRef } from "react";
import { Switch, SwitchProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "./EditorUiContext";
import { editorUiClasses } from "../../constants/editorUiClasses";
import { editorClassNames, cn } from "./editorUtils";

export interface NodeSwitchProps extends Omit<SwitchProps, "size"> {
  /**
   * Additional class name for the root element.
   */
  className?: string;
  /**
   * Value differs from default — shows visual indicator
   */
  changed?: boolean;
}

/**
 * A styled Switch for use in node properties and editor UI.
 * Applies editor tokens for consistent styling and maintains nodrag behavior.
 *
 * The switch is styled to be compact (24x12px) with squared-off corners
 * to match the editor aesthetic.
 *
 * @example
 * <NodeSwitch
 *   checked={value}
 *   onChange={(e) => onChange(e.target.checked)}
 *   changed={hasChanged}
 *   name="enabled"
 * />
 */
export const NodeSwitch = forwardRef<HTMLButtonElement, NodeSwitchProps>(
  ({ className, sx, changed, ...props }, ref) => {
    const _theme = useTheme();
    const scope = useEditorScope();
    const scopeClass =
      scope === "inspector"
        ? editorUiClasses.scopeInspector
        : editorUiClasses.scopeNode;

    return (
      <Switch
        ref={ref}
        size="small"
        className={cn(
          editorClassNames.nodrag,
          editorUiClasses.switchRoot,
          scopeClass,
          className
        )}
        sx={{
          // Semantic: changed state - shows visual indicator
          // ...(changed && {
          //   outline: `2px solid ${theme.vars.palette.primary.main}`,
          //   outlineOffset: 2,
          //   borderRadius: "6px"
          // }),
          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeSwitch.displayName = "NodeSwitch";
