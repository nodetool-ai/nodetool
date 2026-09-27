import type { ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material/styles";

import { FlexRow } from "./FlexRow";
import { Label } from "./Label";
import { SPACING } from "./spacing";

export interface PropertyFieldRowProps {
  label: string;
  children: ReactNode;
  htmlFor?: string;
  spacious?: boolean;
  sx?: SxProps<Theme>;
}

/** Shared label and control alignment for dense editor property panels. */
export function PropertyFieldRow({ label, children, htmlFor, spacious = false, sx }: PropertyFieldRowProps) {
  return (
    <FlexRow
      align="center"
      gap={spacious ? SPACING.md : SPACING.sm}
      fullWidth
      sx={[
        {
          px: SPACING.md,
          py: spacious ? SPACING.xs : SPACING.micro,
          minWidth: 0,
          "& > :last-child": { minWidth: 0 }
        },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    >
      <Label
        component={htmlFor ? "label" : "span"}
        htmlFor={htmlFor}
        sx={{ width: "25%", flexShrink: 0, mb: 0 }}
      >
        {label}
      </Label>
      {children}
    </FlexRow>
  );
}
