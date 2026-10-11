import type { CSSObject } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

import { BORDER_RADIUS, MOTION, reducedMotion } from "./tokens";

// The interaction states every list row and grid tile shares, so a hovered,
// selected or focused item reads the same in every browser, panel and grid.
// Both return plain style objects: spread them into `sx`, `css()` or a class
// rule.

/**
 * The 2px primary keyboard focus outline. Rows draw it inside their box
 * (`offset` -2) because scrolling lists clip anything outside. Tiles sit in a
 * grid gap and draw it outside (`offset` 2).
 */
export const focusRing = (theme: Theme, offset = -2): CSSObject => ({
  outline: `2px solid ${theme.vars.palette.primary.main}`,
  outlineOffset: offset
});

/**
 * A row in a list: transparent at rest, `action.hover` under the pointer,
 * `action.selected` when picked, with an inset focus ring. Pass `selected`
 * for a row that renders its own state, or match a class (`&.selected`) by
 * spreading the result into that rule.
 */
export const selectableRowStyles = (
  theme: Theme,
  { selected = false }: { selected?: boolean } = {}
): CSSObject => ({
  borderRadius: BORDER_RADIUS.md,
  backgroundColor: selected
    ? theme.vars.palette.action.selected
    : "transparent",
  transition: MOTION.background,
  ...reducedMotion({ transition: MOTION.none }),
  "&:hover": {
    backgroundColor: selected
      ? theme.vars.palette.action.selected
      : theme.vars.palette.action.hover
  },
  "&:focus-visible": focusRing(theme)
});

/** The selected state of {@link selectableRowStyles}, for a class rule. */
export const selectedRowStyles = (theme: Theme): CSSObject => ({
  backgroundColor: theme.vars.palette.action.selected,
  "&:hover": { backgroundColor: theme.vars.palette.action.selected }
});

/**
 * A tile in a grid: a 1px divider frame with `BORDER_RADIUS.md`. Picked, the
 * frame turns primary and a 1px ring doubles it, so the choice reads across a
 * grid of identical neighbours. Hover tints the tile; keyboard focus draws the
 * ring outside it.
 */
export const selectableTileStyles = (
  theme: Theme,
  {
    selected = false,
    disabled = false
  }: { selected?: boolean; disabled?: boolean } = {}
): CSSObject => ({
  borderRadius: BORDER_RADIUS.md,
  border: `1px solid ${
    selected ? theme.vars.palette.primary.main : theme.vars.palette.divider
  }`,
  boxShadow: selected ? `0 0 0 1px ${theme.vars.palette.primary.main}` : "none",
  transition: `${MOTION.border}, ${MOTION.background}, ${MOTION.shadow}`,
  ...reducedMotion({ transition: MOTION.none }),
  "&:hover":
    !disabled && !selected
      ? { backgroundColor: theme.vars.palette.action.hover }
      : undefined,
  "&:focus-visible": focusRing(theme, 2)
});

/** The selected state of {@link selectableTileStyles}, for a class rule. */
export const selectedTileStyles = (theme: Theme): CSSObject => ({
  borderColor: theme.vars.palette.primary.main,
  boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}`
});
