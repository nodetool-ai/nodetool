import { forwardRef } from "react";
import { Box, type BoxProps } from "@mui/material";
import { BORDER_RADIUS, TYPOGRAPHY } from "./tokens";
import { SPACING } from "./spacing";

export interface TreeRowProps extends Omit<BoxProps, "color"> {
  /** Nesting level within the editor's tree. */
  depth?: number;
  /** Padding before the first level, in theme spacing units. */
  baseIndent?: number;
  /** Additional padding per level, in theme spacing units. */
  indentStep?: number;
  selected?: boolean;
  interactive?: boolean;
  /** Native button type when rendered with component="button". */
  type?: "button" | "submit" | "reset";
}

/** Shared row surface for editor trees. Editors own selection and drag behavior. */
export const TreeRow = forwardRef<HTMLDivElement, TreeRowProps>(function TreeRow(
  {
    depth = 0,
    baseIndent = SPACING.md,
    indentStep = SPACING.md,
    selected = false,
    interactive = false,
    sx,
    children,
    ...props
  },
  ref
) {
  return (
    <Box
      ref={ref}
      sx={[
        {
          display: "flex",
          alignItems: "center",
          gap: SPACING.xs,
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          pl: baseIndent + depth * indentStep,
          pr: SPACING.md,
          py: SPACING.micro,
          borderRadius: BORDER_RADIUS.sm,
          border: 0,
          ...TYPOGRAPHY.sans.label,
          textAlign: "left",
          color: selected ? "text.primary" : "text.secondary",
          bgcolor: selected ? "action.selected" : "transparent",
          cursor: interactive ? "pointer" : undefined,
          userSelect: interactive ? "none" : undefined,
          "&:hover": interactive
            ? { bgcolor: selected ? "action.selected" : "action.hover" }
            : undefined,
          "&:focus-visible": interactive
            ? { outline: "2px solid", outlineColor: "primary.main" }
            : undefined
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
      ]}
      {...props}
    >
      {children}
    </Box>
  );
});

TreeRow.displayName = "TreeRow";
