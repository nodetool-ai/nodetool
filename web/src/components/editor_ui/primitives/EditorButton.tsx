import React, { forwardRef } from "react";
import { Button, ButtonProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../EditorUiContext";

export interface EditorButtonProps extends Omit<ButtonProps, "size"> {
  /** Density variant for spacing */
  density?: "compact" | "normal";
}

/**
 * EditorButton is a themed button component for the editor UI.
 * It automatically adapts its size based on the editor scope (node vs inspector).
 */
export const EditorButton = forwardRef<HTMLButtonElement, EditorButtonProps>(
  ({ density = "compact", sx, ...props }, ref) => {
    const theme = useTheme();
    const scope = useEditorScope();

    const fontSize =
      scope === "inspector" ? theme.fontSizeSmall : theme.fontSizeTiny;
    const height = density === "compact" ? 24 : 28;

    return (
      <Button
        ref={ref}
        size="small"
        className="nodrag"
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
