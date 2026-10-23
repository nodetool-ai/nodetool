import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  EYEBROW,
  FONT_SIZE_SANS,
  MOTION,
  SPACING,
  TYPOGRAPHY,
  Z_INDEX,
  getSpacingPx,
  reducedMotion,
  focusRing,
  selectableRowStyles,
  selectedRowStyles
} from "../../ui_primitives";

export const createStyles = (theme: Theme) =>
  css({
    width: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "transparent",

    // The caller wraps the list in a ScrollArea, which owns the scrolling.
    ".thread-list": {
      flex: 1,
      padding: `${theme.spacing(1)} ${theme.spacing(1)} ${theme.spacing(1.5)}`,
      margin: 0,
      listStyle: "none"
    },

    ".thread-date-group": {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: theme.spacing(1),
      padding: `${theme.spacing(SPACING.xs)} ${theme.spacing(SPACING.md)}`,
      marginTop: theme.spacing(SPACING.lg),
      ...EYEBROW,
      color: theme.vars.palette.text.secondary,
      "&:first-of-type": {
        marginTop: 0
      },
      ".group-date": {
        color: theme.vars.palette.text.disabled
      }
    },

    ".thread-item": {
      position: "relative",
      margin: theme.spacing(0.5, 0),
      width: "100%",
      overflow: "hidden",
      ...selectableRowStyles(theme),
      transition: `${MOTION.background}, opacity ${MOTION.normal}, transform ${MOTION.normal}, max-height ${MOTION.normal}`,
      ...reducedMotion({ transition: MOTION.none }),

      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        ".delete-button, .rename-button": { opacity: 1 },
        ".thread-time": { opacity: 0 }
      },

      // A keyboard user reaching a row's buttons must be able to see them.
      "&:focus-within": {
        ".delete-button, .rename-button": { opacity: 1 }
      },

      "&.selected": selectedRowStyles(theme),

      "&.deleting": {
        opacity: 0,
        transform: "translateX(-100%)",
        maxHeight: 0,
        marginTop: 0,
        marginBottom: 0,
        ".thread-item-select": {
          paddingTop: 0,
          paddingBottom: 0
        }
      }
    },

    // The whole row is one button, so it carries the row's padding and the
    // focus ring. Reset the UA button styling to keep the row's look.
    ".thread-item-select": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(SPACING.xs),
      width: "100%",
      padding: `${theme.spacing(SPACING.xs)} ${theme.spacing(SPACING.md)}`,
      border: "none",
      background: "transparent",
      font: "inherit",
      color: "inherit",
      textAlign: "left",
      cursor: "pointer",

      borderRadius: "inherit",

      "&:focus-visible": focusRing(theme)
    },

    ".thread-title": {
      flex: 1,
      minWidth: 0,
      ...TYPOGRAPHY.sans.label,
      color: theme.vars.palette.text.primary,
      margin: 0
    },

    ".thread-time": {
      flexShrink: 0,
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
      transition: `opacity ${MOTION.fast}`
    },

    // The row's buttons sit over its right end, where the timestamp hides on
    // hover, so they do not affect the li height.
    ".thread-item-actions": {
      position: "absolute",
      right: getSpacingPx(SPACING.xs),
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: Z_INDEX.raised,
      display: "flex",
      alignItems: "center"
    },

    ".thread-title-input": {
      width: "100%",
      padding: `${theme.spacing(SPACING.xs)} ${theme.spacing(SPACING.md)}`,
      ...TYPOGRAPHY.sans.label
    },

    ".rename-button": {
      opacity: 0,
      padding: getSpacingPx(SPACING.xs),
      minWidth: "unset",
      color: theme.vars.palette.text.secondary,
      transition: `${MOTION.opacity}, ${MOTION.background}`,

      svg: { fontSize: FONT_SIZE_SANS.body }
    },

    ".delete-button": {
      opacity: 0,
      padding: getSpacingPx(SPACING.xs),
      minWidth: "unset",
      color: theme.vars.palette.text.secondary,
      transition: `${MOTION.opacity}, ${MOTION.background}`,

      "&:hover": {
        color: theme.vars.palette.error.main,
        backgroundColor: `rgb(${theme.vars.palette.error.mainChannel} / 0.12)`
      },

      svg: { fontSize: FONT_SIZE_SANS.body }
    },

    // Without hover the delete button never appears, yet it still sits on top
    // of the timestamp and swallows taps near the right edge of a row. Show it
    // and drop the timestamp, matching what hovering does on a mouse.
    "@media (hover: none)": {
      ".delete-button, .rename-button": { opacity: 1 },
      ".thread-time": { opacity: 0 }
    }
  });
