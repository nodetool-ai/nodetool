/**
 * FormGrid Component
 *
 * A responsive CSS grid for form layouts: content column(s) plus a fixed
 * settings rail by default, stacking to one column on narrow viewports.
 * Replaces hand-rolled `.header-grid` CSS (see StoryboardBoard).
 */

import React, { forwardRef } from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import {
  SPACING,
  SPACING_STEPS,
  resolveSpacing,
  snapSpacing,
  type SpacingValue
} from "./spacing";

export interface FormGridProps {
  /** CSS grid-template-columns, default "minmax(0, 1fr) 260px" */
  columns?: string;
  /** Gap (SPACING units), default SPACING.xl (16px) */
  gap?: SpacingValue;
  /** Viewport width (px) below which the grid stacks to one column, default 860. 0 disables. */
  stackBelow?: number;
  children: React.ReactNode;
  className?: string;
  sx?: SxProps<Theme>;
}

/** One canonical step below the given spacing (xl → lg); floors at the smallest step. */
const stepDownSpacing = (units: number): number => {
  const snapped = snapSpacing(units) as (typeof SPACING_STEPS)[number];
  const index = SPACING_STEPS.indexOf(snapped);
  return SPACING_STEPS[Math.max(index - 1, 0)];
};

/**
 * FormGrid - A responsive form grid
 *
 * @example
 * // Content on the left, 260px settings rail on the right; stacks under 860px
 * <FormGrid>
 *   <FlexColumn gap={3}>...fields...</FlexColumn>
 *   <FormSection label="Run settings">...fields...</FormSection>
 * </FormGrid>
 *
 * @example
 * // Equal two-column grid, no stacking
 * <FormGrid columns="1fr 1fr" stackBelow={0}>...</FormGrid>
 */
export const FormGrid = forwardRef<HTMLDivElement, FormGridProps>(
  (
    {
      columns = "minmax(0, 1fr) 260px",
      gap = SPACING.xl,
      stackBelow = 860,
      children,
      className,
      sx
    },
    ref
  ) => {
    const theme = useTheme();
    const gapUnits = resolveSpacing(gap);

    return (
      <Box
        ref={ref}
        className={className}
        sx={[
          {
            display: "grid",
            gridTemplateColumns: columns,
            gap: theme.spacing(gapUnits),
            alignItems: "start",
            ...(stackBelow > 0 && {
              [`@media (max-width: ${stackBelow}px)`]: {
                gridTemplateColumns: "minmax(0, 1fr)",
                gap: theme.spacing(stepDownSpacing(gapUnits))
              }
            })
          },
          // Compose caller sx as an array entry so the function form `(theme) =>
          // ({...})` is honored — spreading `...sx` silently drops callbacks.
          ...(Array.isArray(sx) ? sx : [sx])
        ]}
      >
        {children}
      </Box>
    );
  }
);

FormGrid.displayName = "FormGrid";
