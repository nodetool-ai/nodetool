/**
 * Spacing System — Single Source of Truth
 *
 * STRICT RULE: All spacing (padding, margin, gap) — on BOTH axes (vertical and
 * horizontal) — must use one of the canonical steps below. There are no other
 * allowed values. Outliers must be snapped to the nearest canonical step.
 *
 * The scale is a 4px base grid (theme.spacing(1) === 4px) with a single 2px
 * micro-step for dense controls. Vertical spacing is treated with exactly the
 * same importance and the same scale as horizontal spacing.
 *
 *   token      units   px     role
 *   none       0       0      flush
 *   micro      0.5     2      icon/label gaps inside dense controls
 *   xs         1       4      tight stacking
 *   sm         1.5     6      compact control padding
 *   md         2       8      default gap / padding
 *   lg         3       12     grouped sections
 *   xl         4       16     panel padding
 *   xxl        6       24     large section separation
 *   xxxl       8       32     page-level rhythm
 *
 * Do NOT introduce 0.25, 0.75, 1.25, 1.75, 2.5, 5, etc. — snap to the nearest
 * canonical step. Legacy alias keys (xxs, ml, comfortable, …) are kept so old
 * call sites keep compiling, but they resolve to a canonical step.
 */

import { Theme } from "@mui/material/styles";

/**
 * Canonical spacing scale in theme units (1 unit = 4px).
 * These nine steps are the ONLY allowed spacing values.
 */
export const SPACING = {
  /** 0px — flush */
  none: 0,
  /** 2px — micro gaps in dense controls */
  micro: 0.5,
  /** 4px — tight stacking */
  xs: 1,
  /** 6px — compact control padding */
  sm: 1.5,
  /** 8px — default gap / padding */
  md: 2,
  /** 12px — grouped sections */
  lg: 3,
  /** 16px — panel padding */
  xl: 4,
  /** 24px — large section separation */
  xxl: 6,
  /** 32px — page-level rhythm */
  xxxl: 8,

  // --- Legacy aliases (snapped to a canonical step) ---
  /** @deprecated use `micro` */
  xxs: 0.5,
  /** @deprecated use `lg` (10px → 12px) */
  ml: 3,
  /** @deprecated use `xxl` */
  huge: 6
} as const;

/** Pixel value of each canonical step (matches theme.spacing(units)). */
export const SPACING_PX = {
  none: 0,
  micro: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  xxxl: 32
} as const;

/**
 * Gap values for flex/grid layouts. Same scale, same axes.
 */
export const GAP = {
  none: SPACING.none,
  micro: SPACING.micro, // 2px
  tight: SPACING.xs, // 4px
  compact: SPACING.sm, // 6px
  normal: SPACING.md, // 8px
  comfortable: SPACING.lg, // 12px
  spacious: SPACING.xl // 16px
} as const;

/**
 * Padding values for containers. Same scale, same axes.
 */
export const PADDING = {
  none: SPACING.none,
  micro: SPACING.micro, // 2px
  compact: SPACING.sm, // 6px
  normal: SPACING.md, // 8px
  comfortable: SPACING.lg, // 12px
  spacious: SPACING.xl, // 16px
  section: SPACING.xxl // 24px
} as const;

/**
 * Margin values. Same scale, same axes.
 */
export const MARGIN = {
  none: SPACING.none,
  micro: SPACING.micro, // 2px
  tight: SPACING.xs, // 4px
  compact: SPACING.sm, // 6px
  normal: SPACING.md, // 8px
  comfortable: SPACING.lg, // 12px
  spacious: SPACING.xl, // 16px
  section: SPACING.xxl // 24px
} as const;

/**
 * The canonical steps as raw theme-unit numbers, for runtime snapping/validation.
 */
export const SPACING_STEPS = [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8] as const;

/**
 * Snap an arbitrary theme-unit value to the nearest canonical step.
 * Use when migrating a legacy literal you cannot hand-classify.
 */
export const snapSpacing = (units: number): number => {
  return SPACING_STEPS.reduce((best, step) => {
    const d = Math.abs(step - units);
    const bd = Math.abs(best - units);
    // Nearest step; ties round up toward the larger step.
    return d < bd || (d === bd && step > best) ? step : best;
  }, SPACING_STEPS[0] as number);
};

/**
 * Helper function to get spacing value in pixels
 * @param units - Spacing units (1 = 4px)
 * @returns Spacing value in pixels
 */
export const getSpacingPx = (units: number): string => {
  return `${units * 4}px`;
};

/**
 * Helper function to create consistent padding strings
 * @param theme - MUI theme
 * @param values - Spacing values (top, right, bottom, left) or single value
 * @returns CSS padding string
 */
export const createPadding = (theme: Theme, ...values: number[]): string => {
  return values.map((v) => theme.spacing(v)).join(" ");
};

/**
 * Helper function to create consistent margin strings
 * @param theme - MUI theme
 * @param values - Spacing values (top, right, bottom, left) or single value
 * @returns CSS margin string
 */
export const createMargin = (theme: Theme, ...values: number[]): string => {
  return values.map((v) => theme.spacing(v)).join(" ");
};

/**
 * Type-safe spacing value type
 */
export type SpacingValue = number | keyof typeof SPACING;

/**
 * Helper to resolve spacing value to number
 */
export const resolveSpacing = (value: SpacingValue): number => {
  if (typeof value === "number") {
    return value;
  }
  return SPACING[value];
};

// Re-export for convenience
export type { Theme };
