import type { ReactNode } from "react";

import { Box } from "./Box";
import { FlexRow } from "./FlexRow";
import { Label } from "./Label";
import { SPACING } from "./spacing";
import { CONTROL } from "./tokens";

interface InspectorFieldRowProps {
  label: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  layout?: "grid" | "inline";
}

const INLINE_CONTROL_MIN_WIDTH = 112;

/** Aligned label and control row for document inspectors. */
export function InspectorFieldRow({ label, children, htmlFor, layout = "grid" }: InspectorFieldRowProps) {
  const inline = layout === "inline";
  return <Box sx={{
    display: inline ? "flex" : "grid",
    gridTemplateColumns: inline ? undefined : "minmax(0, 42%) minmax(0, 1fr)",
    alignItems: "center",
    columnGap: inline ? undefined : SPACING.md,
    gap: inline ? SPACING.sm : undefined,
    minHeight: inline ? CONTROL.height.xs : CONTROL.height.sm,
    px: inline ? SPACING.xs : undefined,
    width: "100%",
    minWidth: 0
  }}>
    <Label component={htmlFor ? "label" : "span"} htmlFor={htmlFor}
      sx={{ mb: 0, minWidth: 0, flex: inline ? "1 1 auto" : undefined }}>{label}</Label>
    <FlexRow gap={inline ? SPACING.xs : SPACING.sm} justify={inline ? "flex-end" : "flex-start"}
      sx={{ minWidth: inline ? INLINE_CONTROL_MIN_WIDTH : 0,
        width: inline ? undefined : "100%", flex: inline ? "0 0 auto" : undefined }}>{children}</FlexRow>
  </Box>;
}
