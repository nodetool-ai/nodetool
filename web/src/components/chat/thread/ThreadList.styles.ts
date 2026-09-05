import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  scrollbarStyles,
  MOTION,
  BORDER_RADIUS,
  FONT_SIZE_SANS
} from "../../ui_primitives";
import { SPACING, getSpacingPx, Z_INDEX } from "../../ui_primitives";

export const createStyles = (theme: Theme) =>
  css({
    width: "100%",
    maxHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "transparent",

    ".thread-list": {
      minHeight: "100px",
      flex: 1,
      overflow: "auto",
      padding: `${theme.spacing(1)} ${theme.spacing(1)} ${theme.spacing(1.5)}`,
      margin: 0,
      listStyle: "none",
      ...scrollbarStyles(theme),
    },

    ".thread-date-group": {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: theme.spacing(1),
      padding: `${theme.spacing(SPACING.xs)} ${theme.spacing(SPACING.md)}`,
      marginTop: theme.spacing(SPACING.lg),
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontWeight: 500,
      "&:first-of-type": {
        marginTop: 0
      },
      ".group-date": {
        color: theme.vars.palette.grey[600],
        letterSpacing: "0.04em"
      }
    },

    ".thread-item": {
      position: "relative",
      margin: theme.spacing(0.5, 0),
      fontSize: theme.fontSizeSmall,
      width: "100%",
      transition: `${MOTION.background}, opacity ${MOTION.normal}, transform ${MOTION.normal}, max-height ${MOTION.normal}`,
      borderRadius: BORDER_RADIUS.sm,
      overflow: "hidden",
      backgroundColor: "transparent",

      "&:hover": {
        backgroundColor: `rgb(${theme.vars.palette.common.whiteChannel} / 0.04)`,
        ".delete-button": { opacity: 1 },
        ".thread-time": { opacity: 0 }
      },

      // A keyboard user reaching the delete button must be able to see it.
      "&:focus-within": {
        ".delete-button": { opacity: 1 }
      },

      "&.selected": {
        backgroundColor: `rgb(${theme.vars.palette.common.whiteChannel} / 0.08)`
      },

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

      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      }
    },

    ".thread-title": {
      flex: 1,
      minWidth: 0,
      fontSize: theme.fontSizeSmall,
      fontWeight: 400,
      lineHeight: 1.35,
      color: theme.vars.palette.grey[100],
      margin: 0,
      display: "-webkit-box",
      WebkitLineClamp: 1,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },

    ".thread-time": {
      flexShrink: 0,
      fontSize: theme.fontSizeSmaller,
      lineHeight: 1.2,
      color: theme.vars.palette.grey[500],
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
      transition: `opacity ${MOTION.fast}`
    },

    // DeleteButton renders: Tooltip > span > IconButton.delete-button
    // Position the span wrapper absolutely so it doesn't affect li height.
    "span:has(> .delete-button)": {
      position: "absolute",
      right: getSpacingPx(SPACING.xs),
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: Z_INDEX.raised
    },

    ".delete-button": {
      opacity: 0,
      padding: getSpacingPx(SPACING.xs),
      minWidth: "unset",
      color: theme.vars.palette.grey[200],
      transition: `${MOTION.opacity}, ${MOTION.transform}`,

      "&:hover": {
        color: theme.vars.palette.error.main,
        backgroundColor: theme.vars.palette.grey[500],
        transform: "scale(1.05)"
      },

      svg: { fontSize: FONT_SIZE_SANS.body }
    },

    // Without hover the delete button never appears, yet it still sits on top
    // of the timestamp and swallows taps near the right edge of a row. Show it
    // and drop the timestamp, matching what hovering does on a mouse.
    "@media (hover: none)": {
      ".delete-button": { opacity: 1 },
      ".thread-time": { opacity: 0 }
    }
  });
