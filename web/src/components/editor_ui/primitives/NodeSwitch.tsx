import React, { forwardRef } from "react";
import { Switch, SwitchProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../EditorUiContext";

export interface NodeSwitchProps extends Omit<SwitchProps, "size"> {
  /** Value differs from default — shows visual indicator */
  changed?: boolean;
}

/**
 * NodeSwitch is a themed toggle switch component for the editor UI.
 * It automatically adapts its size based on the editor scope (node vs inspector)
 * and supports the changed semantic prop.
 */
export const NodeSwitch = forwardRef<HTMLButtonElement, NodeSwitchProps>(
  ({ changed, sx, ...props }, ref) => {
    const theme = useTheme();
    const scope = useEditorScope();

    const size = scope === "inspector" ? 28 : 24;

    return (
      <Switch
        ref={ref}
        size="small"
        className="nodrag"
        sx={{
          width: size + 12,
          height: size - 8,
          padding: 0,
          margin: 0,
          overflow: "visible",

          "& .MuiSwitch-switchBase": {
            padding: 0,
            margin: 0,
            color: theme.vars.palette.grey[400],
            "&.Mui-checked": {
              color: theme.vars.palette.grey[100],
              transform: "translateX(12px)",
              "& + .MuiSwitch-track": {
                backgroundColor: theme.vars.palette.grey[100],
                opacity: 1
              }
            }
          },
          "& .MuiSwitch-track": {
            borderRadius: "0.25em",
            backgroundColor: theme.vars.palette.grey[600]
          },
          "& .MuiSwitch-thumb": {
            width: 12,
            height: 12,
            borderRadius: "0.25em",
            margin: 0,
            padding: 0
          },

          // Semantic: changed state - indicator line on the right
          ...(changed && {
            "&::after": {
              content: '""',
              position: "absolute",
              right: -4,
              top: 0,
              bottom: 0,
              width: 2,
              backgroundColor: theme.vars.palette.primary.main,
              borderRadius: 1
            }
          }),

          ...sx
        }}
        {...props}
      />
    );
  }
);

NodeSwitch.displayName = "NodeSwitch";
