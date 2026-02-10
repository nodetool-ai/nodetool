/**
 * Spacing Utilities
 * 
 * Centralized spacing constants and helper functions for consistent spacing
 * across the application. These utilities work with the theme's spacing function
 * where 1 unit = 4px by default.
 */

import { Theme } from "@mui/material/styles";

/**
 * Spacing constants following a consistent scale
 * Values are in theme spacing units (1 = 4px, 2 = 8px, etc.)
 */
export const SPACING = {
  /** Extra extra small - 2px */
  xxs: 0.5,
  /** Extra small - 4px */
  xs: 1,
  /** Small - 6px */
  sm: 1.5,
  /** Medium - 8px */
  md: 2,
  /** Medium-large - 10px */
  ml: 2.5,
  /** Large - 12px */
  lg: 3,
  /** Extra large - 16px */
  xl: 4,
  /** Extra extra large - 20px */
  xxl: 5,
  /** Huge - 24px */
  huge: 6
} as const;

/**
 * Common gap values for flex/grid layouts
 */
export const GAP = {
  none: 0,
  tight: SPACING.xs,     // 4px
  compact: SPACING.sm,   // 6px
  normal: SPACING.md,    // 8px
  comfortable: SPACING.ml, // 10px
  spacious: SPACING.lg   // 12px
} as const;

/**
 * Common padding values for containers
 */
export const PADDING = {
  none: 0,
  compact: SPACING.sm,      // 6px
  normal: SPACING.md,       // 8px
  comfortable: SPACING.lg,  // 12px
  spacious: SPACING.xl      // 16px
} as const;

/**
 * Common margin values
 */
export const MARGIN = {
  none: 0,
  tight: SPACING.xs,        // 4px
  compact: SPACING.sm,      // 6px
  normal: SPACING.md,       // 8px
  comfortable: SPACING.lg,  // 12px
  spacious: SPACING.xl      // 16px
} as const;

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
export const createPadding = (
  theme: Theme,
  ...values: number[]
): string => {
  return values.map(v => theme.spacing(v)).join(" ");
};

/**
 * Helper function to create consistent margin strings
 * @param theme - MUI theme
 * @param values - Spacing values (top, right, bottom, left) or single value
 * @returns CSS margin string
 */
export const createMargin = (
  theme: Theme,
  ...values: number[]
): string => {
  return values.map(v => theme.spacing(v)).join(" ");
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
