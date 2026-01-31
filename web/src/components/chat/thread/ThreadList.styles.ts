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
      padding: `${theme.spacing(0.5)} ${theme.spacing(0.75)}`,
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
      padding: "0.5em 0.75em",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[300],
      textTransform: "uppercase",
      letterSpacing: "0.06em"
    },

    ".thread-item": {
      position: "relative",
      padding: "0.6em 0.75em",
      fontSize: theme.fontSizeSmall,
      width: "calc(100% - 12px)",
      borderLeft: `3px solid transparent`,
      cursor: "pointer",
      transition:
        "background 0.18s ease, opacity 0.25s ease-out, transform 0.25s ease-out, max-height 0.25s ease-out, border-color 0.2s ease",
      borderRadius: 8,
      maxHeight: "86px",
      overflow: "hidden",
      outline: "none",

      "&:hover": {
        ".delete-button, .download-button": { opacity: 1 }
      },

      "&:focus-visible": {
        borderLeftColor: "var(--palette-primary-main)",
        boxShadow: "0 0 0 2px rgba(96,165,250,0.25) inset"
      },

      "&.selected": {
        backgroundColor: theme.vars.palette.grey[800],
        borderLeft: `3px solid ${"var(--palette-primary-main)"}`
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
      ".date": {
        fontSize: theme.fontSizeTiny,
        marginTop: "0.1em",
        textTransform: "uppercase",
        color: theme.vars.palette.grey[300]
      },
      p: {
        fontWeight: 400
      }
    },

    ".thread-title": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      color: theme.vars.palette.grey[0],
      marginBottom: "0.25em",
      display: "-webkit-box",
      WebkitLineClamp: 1,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      textOverflow: "ellipsis",
      paddingRight: "64px"
    },

    ".date": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[300]
    },

    ".delete-button": {
      position: "absolute",
      right: "0.35em",
      top: "50%",
      transform: "translateY(-50%)",
      opacity: 0,
      padding: "4px",
      minWidth: "unset",
      color: theme.vars.palette.grey[200],
      transition: "opacity 0.2s, transform 0.15s ease",

      "&:hover": {
        color: theme.vars.palette.error.main,
        backgroundColor: theme.vars.palette.grey[500],
        transform: "translateY(-50%) scale(1.05)"
      },

      svg: { fontSize: "1.2em" }
    },

    ".download-button": {
      position: "absolute",
      right: "2.2em",
      top: "50%",
      transform: "translateY(-50%)",
      opacity: 0,
      padding: "4px",
      minWidth: "unset",
      color: theme.vars.palette.grey[200],
      transition: "opacity 0.2s, transform 0.15s ease",

      "&:hover": {
        color: theme.vars.palette.primary.main,
        backgroundColor: theme.vars.palette.grey[500],
        transform: "translateY(-50%) scale(1.05)"
      },

      svg: { fontSize: "1.2em" }
    }
  });
