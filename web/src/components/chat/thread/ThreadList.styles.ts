import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { scrollbarStyles, MOTION } from "../../ui_primitives/tokens";
import { SPACING, getSpacingPx } from "../../ui_primitives/spacing";

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
      padding: "0.4em 0.75em 0.3em",
      marginTop: "1em",
      fontSize: theme.fontSizeTiny,
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
      padding: "0.35em 0.6em",
      margin: theme.spacing(0.5, 0),
      fontSize: theme.fontSizeSmall,
      width: "100%",
      cursor: "pointer",
      transition: `${MOTION.background}, opacity ${MOTION.normal}, transform ${MOTION.normal}, max-height ${MOTION.normal}`,
      borderRadius: 5,
      overflow: "hidden",
      outline: "none",
      backgroundColor: "transparent",

      "&:hover": {
        backgroundColor: `rgb(${theme.vars.palette.common.whiteChannel} / 0.04)`,
        ".delete-button": { opacity: 1 },
        ".thread-time": { opacity: 0 }
      },

      "&:focus-visible": {
        backgroundColor: `rgb(${theme.vars.palette.common.whiteChannel} / 0.06)`
      },

      "&.selected": {
        backgroundColor: `rgb(${theme.vars.palette.common.whiteChannel} / 0.08)`
      },

      "&.deleting": {
        opacity: 0,
        transform: "translateX(-100%)",
        maxHeight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        marginTop: 0,
        marginBottom: 0
      },
      p: {
        fontWeight: 400,
        margin: 0
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
      fontSize: theme.fontSizeTiny,
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
      right: "0.35em",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: 1
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

      svg: { fontSize: "1.2em" }
    }
  });
