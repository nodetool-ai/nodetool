import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

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
      padding: `${theme.spacing(0.75)} ${theme.spacing(0.75)} ${theme.spacing(1.5)}`,
      margin: 0,
      listStyle: "none",
      scrollbarWidth: "thin",
      scrollbarColor: `${theme.vars.palette.c_scroll_thumb} ${theme.vars.palette.c_scroll_bg}`,
      "&::-webkit-scrollbar": { width: 10 },
      "&::-webkit-scrollbar-track": {
        background: theme.vars.palette.c_scroll_bg
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.c_scroll_thumb,
        borderRadius: 10,
        border: `2px solid ${theme.vars.palette.c_scroll_bg}`
      },
      "&::-webkit-scrollbar-thumb:hover": {
        backgroundColor: theme.vars.palette.c_scroll_hover
      }
    },

    ".thread-date-group": {
      padding: "0.25em 0.75em",
      marginTop: "0.75em",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[300],
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      "&:first-of-type": {
        marginTop: 0
      }
    },

    ".thread-item": {
      position: "relative",
      padding: "0.6em 0.8em",
      fontSize: theme.fontSizeSmall,
      width: "calc(100% - 12px)",
      borderLeft: `2px solid transparent`,
      cursor: "pointer",
      transition:
        "background 0.18s ease, opacity 0.25s ease-out, transform 0.25s ease-out, max-height 0.25s ease-out, border-color 0.2s ease, box-shadow 0.2s ease",
      borderRadius: 10,
      overflow: "hidden",
      outline: "none",
      backgroundColor: "transparent",

      "&:hover": {
        backgroundColor: `rgb(${theme.vars.palette.common.whiteChannel} / 0.04)`,
        transform: "translateY(-1px)",
        boxShadow: "0 6px 14px rgb(0 0 0 / 0.10)",
        ".delete-button": { opacity: 1 }
      },

      "&:focus-visible": {
        borderLeftColor: "var(--palette-primary-main)",
        boxShadow: "0 0 0 2px rgba(96,165,250,0.25) inset"
      },

      "&.selected": {
        background: `linear-gradient(135deg, rgb(${theme.vars.palette.primary.mainChannel} / 0.16), rgb(${theme.vars.palette.common.whiteChannel} / 0.03))`,
        borderLeft: `2px solid ${"var(--palette-primary-main)"}`,
        boxShadow: `0 8px 18px rgb(0 0 0 / 0.14), 0 0 0 1px rgb(${theme.vars.palette.primary.mainChannel} / 0.08) inset`
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
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      lineHeight: 1.35,
      color: theme.vars.palette.grey[0],
      margin: 0,
      display: "-webkit-box",
      WebkitLineClamp: 1,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      textOverflow: "ellipsis",
      paddingRight: "28px"
    },

    ".date": {
      fontSize: theme.fontSizeTiny,
      lineHeight: 1.2,
      color: theme.vars.palette.grey[300],
      margin: "0.25em 0 0"
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
      padding: "4px",
      minWidth: "unset",
      color: theme.vars.palette.grey[200],
      transition: "opacity 0.2s, transform 0.15s ease",

      "&:hover": {
        color: theme.vars.palette.error.main,
        backgroundColor: theme.vars.palette.grey[500],
        transform: "scale(1.05)"
      },

      svg: { fontSize: "1.2em" }
    }
  });
