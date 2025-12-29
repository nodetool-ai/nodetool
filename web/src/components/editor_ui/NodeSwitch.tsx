/** @jsxImportSource @emotion/react */
/**
 * NodeSwitch
 *
 * A Switch primitive for editor/node UI that applies consistent styling
 * via sx and maintains nodrag behavior.
 */

import React, { forwardRef } from "react";
import { Switch, SwitchProps } from "@mui/material";
import { useEditorScope } from "./EditorUiContext";
import { editorClassNames, cn, editorUiClasses } from "./editorUtils";

export interface NodeSwitchProps extends Omit<SwitchProps, "size"> {
  /**
   * Additional class name for the root element.
   */
  className?: string;
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
 *   name="enabled"
 * />
 */
export const NodeSwitch = forwardRef<HTMLButtonElement, NodeSwitchProps>(
  ({ className, sx, ...props }, ref) => {
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
        sx={sx}
        {...props}
      />
    );
  }
);

NodeSwitch.displayName = "NodeSwitch";
