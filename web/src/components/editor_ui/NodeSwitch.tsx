/** @jsxImportSource @emotion/react */
/**
 * NodeSwitch
 *
 * A Switch primitive for editor/node UI that applies consistent styling
 * via sx and maintains nodrag behavior.
 */

import React, { forwardRef } from "react";
import { Switch, SwitchProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorTokens } from "./EditorUiContext";
import { editorClassNames, cn } from "./editorUtils";

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
    const theme = useTheme();
    const tokens = useEditorTokens();

    // Defensive access to theme properties for tests
    const palette = theme?.vars?.palette ?? theme?.palette;
    const grey = palette?.grey ?? {
      100: "#f5f5f5",
      400: "#bdbdbd",
      600: "#757575"
    };

    return (
      <Switch
        ref={ref}
        size="small"
        className={cn(editorClassNames.nodrag, className)}
        sx={{
          // Root switch styles
          margin: 0,
          padding: 0,
          width: 24,
          height: 12,
          overflow: "visible",

          // Thumb (the moveable part)
          "& .MuiSwitch-thumb": {
            width: 12,
            height: 12,
            borderRadius: "0.25em",
            margin: 0,
            padding: 0,
            boxShadow: "none"
          },

          // Track (the background)
          "& .MuiSwitch-track": {
            borderRadius: "0.25em",
            backgroundColor: grey[600],
            opacity: 1
          },

          // Switch base (the button container)
          "& .MuiSwitch-switchBase": {
            margin: 0,
            padding: 0,
            color: grey[400],
            transition: `transform ${tokens.transition.fast}`,

            "&.Mui-checked": {
              color: grey[100],
              transform: "translateX(12px)",

              "& + .MuiSwitch-track": {
                backgroundColor: grey[100],
                opacity: 1
              }
            },

            "&:hover": {
              backgroundColor: "transparent"
            }
          },

          // Allow custom sx to override
          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeSwitch.displayName = "NodeSwitch";
