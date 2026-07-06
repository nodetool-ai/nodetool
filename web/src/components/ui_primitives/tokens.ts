/**
 * Design Tokens
 *
 * Single source of truth for motion timing, z-index layers, border radii,
 * and scrollbar styling. Use these instead of magic numbers or literal strings.
 */

import { Theme } from "@mui/material/styles";

/**
 * Typography System — Single Source of Truth
 *
 * STRICT RULE: Each font class (sans, mono) exposes EXACTLY FOUR
 * size+weight combinations. No other combination may appear anywhere in the
 * app. Pick the role whose intent matches; never invent a new size or weight.
 *
 * Every size resolves to a theme CSS variable (`--fontSize*`, defined once in
 * ThemeNodetool). Never hardcode a px font size — drive it off these vars.
 *
 * Allowed sizes:  --fontSizeBig 18 · --fontSizeNormal 15 · --fontSizeSmall 13 · --fontSizeSmaller 11
 * Allowed weights: 400 (normal) · 500 (medium) · 600 (semibold)
 *
 * SANS (Inter — `fontFamily1`)            MONO (JetBrains Mono — `fontFamily2`)
 *   title   18px / 600  headings, titles    code     13px / 400  code, values
 *   body    15px / 400  default body text    strong   13px / 600  emphasized mono
 *   label   13px / 500  labels, buttons      label    13px / 500  mono keys/labels
 *   caption 11px / 400  hints, metadata      caption  11px / 400  small mono / hints
 *
 * Headings collapse onto these roles (h1–h3 → title, h4–h6 → label). Anything
 * larger than `title` or smaller than `caption` must snap to those bounds.
 */
export const FONT_WEIGHT = {
  normal: 400,
  medium: 500,
  semibold: 600
} as const;

/** The four sanctioned sans (Inter) sizes, as theme CSS variables. */
export const FONT_SIZE_SANS = {
  title: "var(--fontSizeBig)", // 18px
  body: "var(--fontSizeNormal)", // 15px
  label: "var(--fontSizeSmall)", // 13px
  caption: "var(--fontSizeSmaller)" // 11px
} as const;

/** The mono (JetBrains Mono) sizes, as theme CSS variables. */
export const FONT_SIZE_MONO = {
  code: "var(--fontSizeSmall)", // 13px
  strong: "var(--fontSizeSmall)", // 13px
  label: "var(--fontSizeSmall)", // 13px
  caption: "var(--fontSizeSmaller)" // 11px
} as const;

type TypeStyle = {
  fontSize: string;
  fontWeight: number;
  fontFamily: string;
  lineHeight: number;
};

/**
 * The eight — and only eight — text styles. Spread one of these into an `sx`
 * prop or `css()` block instead of writing raw `fontSize` / `fontWeight`.
 *
 * @example
 * <Box sx={{ ...TYPOGRAPHY.sans.label }}>Channels</Box>
 */
export const TYPOGRAPHY = {
  sans: {
    title: {
      fontSize: FONT_SIZE_SANS.title,
      fontWeight: FONT_WEIGHT.semibold,
      fontFamily: "var(--fontFamily1)",
      lineHeight: 1.3
    },
    body: {
      fontSize: FONT_SIZE_SANS.body,
      fontWeight: FONT_WEIGHT.normal,
      fontFamily: "var(--fontFamily1)",
      lineHeight: 1.45
    },
    label: {
      fontSize: FONT_SIZE_SANS.label,
      fontWeight: FONT_WEIGHT.medium,
      fontFamily: "var(--fontFamily1)",
      lineHeight: 1.35
    },
    caption: {
      fontSize: FONT_SIZE_SANS.caption,
      fontWeight: FONT_WEIGHT.normal,
      fontFamily: "var(--fontFamily1)",
      lineHeight: 1.4
    }
  },
  mono: {
    code: {
      fontSize: FONT_SIZE_MONO.code,
      fontWeight: FONT_WEIGHT.normal,
      fontFamily: "var(--fontFamily2)",
      lineHeight: 1.5
    },
    strong: {
      fontSize: FONT_SIZE_MONO.strong,
      fontWeight: FONT_WEIGHT.semibold,
      fontFamily: "var(--fontFamily2)",
      lineHeight: 1.5
    },
    label: {
      fontSize: FONT_SIZE_MONO.label,
      fontWeight: FONT_WEIGHT.medium,
      fontFamily: "var(--fontFamily2)",
      lineHeight: 1.35
    },
    caption: {
      fontSize: FONT_SIZE_MONO.caption,
      fontWeight: FONT_WEIGHT.normal,
      fontFamily: "var(--fontFamily2)",
      lineHeight: 1.4
    }
  }
} satisfies Record<"sans" | "mono", Record<string, TypeStyle>>;

/**
 * Motion / transition timing constants.
 *
 * Always pair transitions with a `prefers-reduced-motion` override.
 * Use the `reducedMotion()` helper to add the override in one step:
 *
 * @example
 * transition: MOTION.all
 * transition: `${MOTION.border}, ${MOTION.shadow}`
 *
 * // With accessibility override:
 * css({ transition: MOTION.all, ...reducedMotion({ transition: MOTION.none }) })
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

  // Keyframe loop tiers — duration + easing for infinite @keyframes animations.
  // Compose with the keyframe name and iteration:
  //   animation: `${spin} ${MOTION.spin} infinite`
  //   animation: `${pulse} ${MOTION.pulse} infinite`
  // The fast/normal/slow tiers cover one-shot transitions; looping spinners and
  // breathing/pulsing indicators run on their own timing and never on those
  // sub-second tiers (DESIGN.md §11.5).
  /** 1s linear — continuous rotation (loading spinners) */
  spin: "1s linear",
  /** 2s ease-in-out — breathing / pulsing status indicators */
  pulse: "2s ease-in-out",

  /** Disables a transition entirely. Use in prefers-reduced-motion overrides. */
  none: "none",
} as const;

/**
 * Returns an Emotion-compatible `@media (prefers-reduced-motion: reduce)`
 * block with the given style overrides. Spread into any css() or sx block
 * that uses MOTION tokens.
 *
 * WCAG 2.3.3 requires nonessential animations to be suppressible.
 * Any component that transitions layout, opacity, or transform must call this.
 *
 * @example
 * css({
 *   transition: MOTION.all,
 *   ...reducedMotion({ transition: MOTION.none }),
 * })
 *
 * // Suppress a keyframe animation entirely:
 * css({
 *   animation: `${spin} 1s linear infinite`,
 *   ...reducedMotion({ animation: "none", opacity: 0.6 }),
 * })
 */
export const reducedMotion = (
  overrides: Record<string, unknown>
): Record<string, unknown> => ({
  "@media (prefers-reduced-motion: reduce)": overrides,
});

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
  pill: "var(--rounded-pill)",
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
