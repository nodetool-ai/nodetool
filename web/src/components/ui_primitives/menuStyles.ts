import type { CSSObject } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  CONTROL,
  EYEBROW,
  ICON_SIZE,
  MOTION,
  SHADOW,
  TYPOGRAPHY,
  reducedMotion
} from "./tokens";
import { SPACING, getSpacingPx } from "./spacing";

// One look for every floating menu: context menus, dropdown menus, the list
// under a select, and popover menus. The theme applies these to every MUI
// `Menu` and `MenuItem`, so `ContextMenu`, `EditorMenu`, `SelectField` and
// `MenuItemPrimitive` all render the same surface and rows. Spread them into
// `sx` or `css()` only for a menu that is not built on MUI `Menu`.

/** Default minimum menu width, px. */
export const MENU_MIN_WIDTH = 180;

/** Icon size inside a menu row, px. */
export const MENU_ICON_SIZE = ICON_SIZE.sm;

/**
 * The menu surface: overlay paper, a 1px divider frame, `BORDER_RADIUS.lg`
 * and the `lg` elevation.
 */
export const menuPaperStyles = (theme: Theme): CSSObject => ({
  backgroundColor: theme.vars.palette.Paper.overlay,
  backgroundImage: "none",
  border: `1px solid ${theme.vars.palette.divider}`,
  borderRadius: BORDER_RADIUS.lg,
  boxShadow: SHADOW(theme).lg,
  // A right-click menu focuses its surface or list until a row is reached.
  // The focused row shows the keyboard position, so neither draws a ring.
  "&:focus, &:focus-visible, & .MuiList-root:focus-visible": {
    outline: "none"
  }
});

/** The list inside the surface: 4px above and below the first and last row. */
export const menuListStyles = (theme: Theme): CSSObject => ({
  padding: `${getSpacingPx(SPACING.xs)} 0`,
  "& .MuiDivider-root": {
    margin: `${getSpacingPx(SPACING.xs)} 0`,
    borderColor: theme.vars.palette.divider
  },
  "& .MuiListSubheader-root": menuGroupHeaderStyles(theme)
});

/**
 * A group title inside a menu ("RECENT", "PROVIDERS"): `EYEBROW` in
 * `text.secondary`, on the same left edge as the item labels.
 */
export const menuGroupHeaderStyles = (theme: Theme): CSSObject => ({
  ...EYEBROW,
  color: theme.vars.palette.text.secondary,
  backgroundColor: theme.vars.palette.Paper.overlay,
  lineHeight: `${CONTROL.height.xs}px`,
  padding: `0 ${getSpacingPx(SPACING.lg)}`
});

/**
 * A menu row: 13px label text, 28px tall, inset 4px from the surface edge
 * with `BORDER_RADIUS.sm`. Hover and keyboard focus use `action.hover`, a
 * picked option `action.selected`. Icons sit 8px before the label in
 * `text.secondary`.
 */
export const menuItemStyles = (theme: Theme): CSSObject => ({
  ...TYPOGRAPHY.sans.label,
  color: theme.vars.palette.text.primary,
  minHeight: CONTROL.height.sm,
  margin: `0 ${getSpacingPx(SPACING.xs)}`,
  padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
  gap: getSpacingPx(SPACING.md),
  borderRadius: BORDER_RADIUS.sm,
  transition: MOTION.background,
  ...reducedMotion({ transition: MOTION.none }),
  "&:hover, &.Mui-focusVisible": {
    backgroundColor: theme.vars.palette.action.hover
  },
  "&.Mui-selected, &.Mui-selected:hover, &.Mui-selected.Mui-focusVisible": {
    backgroundColor: theme.vars.palette.action.selected
  },
  "& .MuiListItemIcon-root": {
    minWidth: 0,
    color: theme.vars.palette.text.secondary
  },
  "& .MuiListItemIcon-root .MuiSvgIcon-root": {
    fontSize: MENU_ICON_SIZE
  },
  "& .MuiListItemText-root": {
    margin: 0
  },
  "& .MuiListItemText-primary": {
    ...TYPOGRAPHY.sans.label
  },
  "& .MuiListItemText-secondary": {
    ...TYPOGRAPHY.sans.caption,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    color: theme.vars.palette.text.secondary
  }
});

/** A destructive row (delete, remove): `error.main` text and icon. */
export const menuItemDestructiveStyles = (theme: Theme): CSSObject => ({
  color: theme.vars.palette.error.main,
  "& .MuiListItemIcon-root": {
    color: theme.vars.palette.error.main
  }
});

/** The keyboard shortcut at the end of a row: mono caption, `text.secondary`. */
export const menuShortcutStyles = (theme: Theme): CSSObject => ({
  ...TYPOGRAPHY.mono.caption,
  color: theme.vars.palette.text.secondary,
  marginLeft: "auto",
  paddingLeft: getSpacingPx(SPACING.lg)
});
