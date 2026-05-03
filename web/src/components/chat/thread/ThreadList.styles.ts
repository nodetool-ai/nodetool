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
      padding: "0.4em 0.75em 0.3em",
      marginTop: "1em",
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontWeight: 500,
      "&:first-of-type": {
        marginTop: 0
      }
    },

    ".thread-item": {
      position: "relative",
      padding: "0.35em 0.6em",
      margin: "1px 0",
      fontSize: theme.fontSizeSmall,
      width: "100%",
      cursor: "pointer",
      transition:
        "background-color 0.12s ease, opacity 0.25s ease-out, transform 0.25s ease-out, max-height 0.25s ease-out",
      borderRadius: 5,
      overflow: "hidden",
      outline: "none",
      backgroundColor: "transparent",

      "&:hover": {
        backgroundColor: `rgb(${theme.vars.palette.common.whiteChannel} / 0.04)`,
        ".delete-button": { opacity: 1 }
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
      fontSize: theme.fontSizeSmall,
      fontWeight: 400,
      lineHeight: 1.35,
      color: theme.vars.palette.grey[100],
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
