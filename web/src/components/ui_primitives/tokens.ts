/**
 * Design Tokens
 *
 * Single source of truth for motion timing, z-index layers, border radii,
 * and scrollbar styling. Use these instead of magic numbers or literal strings.
 */

import { Theme } from "@mui/material/styles";

/**
 * Motion / transition timing constants.
 *
 * @example
 * transition: MOTION.all
 * transition: `${MOTION.border}, ${MOTION.shadow}`
 */
export const MOTION = {
  /** 120ms — hover micro-interactions, icon state changes */
  fast: "120ms ease",
  /** 200ms — standard UI transitions (color, border, opacity) */
  normal: "200ms ease",
  /** 350ms — panel open/close, drawer animations */
  slow: "350ms ease",

  // Named property shorthands — compose multiple via template literals
  border: "border-color 200ms ease",
  opacity: "opacity 150ms ease",
  transform: "transform 120ms ease",
  shadow: "box-shadow 200ms ease",
  background: "background-color 150ms ease",
  all: "all 200ms ease",
} as const;

/**
 * Z-index scale.
 * Use these instead of bare numbers to keep stacking order explicit.
 */
export const Z_INDEX = {
  base: 0,
  raised: 1,
  dropdown: 10,
  sticky: 20,
  overlay: 100,
  modal: 200,
  tooltip: 300,
  toast: 400,
} as const;

/**
 * Border radius constants mapping to theme CSS custom properties.
 * Use instead of raw var() strings or magic numbers.
 *
 * @example
 * borderRadius: BORDER_RADIUS.lg
 * borderRadius: BORDER_RADIUS.pill  // tags, chips, compact buttons
 */
export const BORDER_RADIUS = {
  xs: "var(--rounded-xs)",
  sm: "var(--rounded-sm)",
  md: "var(--rounded-md)",
  lg: "var(--rounded-lg)",
  xl: "var(--rounded-xl)",
  xxl: "var(--rounded-xxl)",
  circle: "var(--rounded-circle)",
  /** Full pill shape — for tags, chips, and compact buttons */
  pill: "999px",
} as const;

/**
 * Standard themed scrollbar styles using the palette's custom scroll colors.
 * Spread into Emotion css() blocks wherever you need consistent scrollbars.
 *
 * @example
 * css({ overflowY: "auto", ...scrollbarStyles(theme) })
 */
export const thinScrollbarStyles = (theme: Theme) => ({
  "&::-webkit-scrollbar": { width: "6px" },
  "&::-webkit-scrollbar-track": { background: "transparent" },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: theme.vars.palette.action.disabledBackground,
    borderRadius: BORDER_RADIUS.lg,
  },
  "&::-webkit-scrollbar-thumb:hover": {
    backgroundColor: theme.vars.palette.action.disabled,
  },
});

/**
 * Standard themed scrollbar styles using the palette's custom scroll colors.
 * Spread into Emotion css() blocks wherever you need consistent scrollbars.
 *
 * @example
 * css({ overflowY: "auto", ...scrollbarStyles(theme) })
 */
export const scrollbarStyles = (theme: Theme) => ({
  scrollbarWidth: "thin" as const,
  scrollbarColor: `${theme.vars.palette.c_scroll_thumb ?? theme.vars.palette.grey[600]} ${theme.vars.palette.c_scroll_bg ?? "transparent"}`,
  "&::-webkit-scrollbar": { width: 10 },
  "&::-webkit-scrollbar-track": {
    background: theme.vars.palette.c_scroll_bg ?? "transparent",
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor:
      theme.vars.palette.c_scroll_thumb ?? theme.vars.palette.grey[600],
    borderRadius: 10,
    border: `2px solid ${theme.vars.palette.c_scroll_bg ?? "transparent"}`,
  },
  "&::-webkit-scrollbar-thumb:hover": {
    backgroundColor:
      theme.vars.palette.c_scroll_hover ?? theme.vars.palette.grey[500],
  },
});
