import { css } from "@emotion/react";

export const createStyles = (theme: any) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--palette-background-paper)",

    ".new-chat-section": { padding: theme.spacing(2) },

    ".new-chat-button": {
      width: "100%",
      textAlign: "center",
      padding: "0.5em 1em",
      borderRadius: "8px",
      backgroundColor: "var(--palette-grey-800)",
      color: theme.palette.c_white,
      textTransform: "none",
      justifyContent: "center",
      transition: "background 0.2s",
      "&:hover": { backgroundColor: theme.palette.grey[600] }
    },

    ".thread-list": {
      flex: 1,
      overflow: "auto",
      padding: 0,
      margin: 0,
      listStyle: "none"
    },

    ".thread-date-group": {
      padding: "0.5em 1em",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.grey[200],
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },

    ".thread-item": {
      position: "relative",
      padding: "0.1em 1em",
      fontSize: theme.fontSizeBig,
      borderLeft: `2px solid transparent`,
      cursor: "pointer",
      transition: "all 0.2s",

      "&:hover": {
        backgroundColor: theme.palette.grey[600],
        ".delete-button": { opacity: 1 }
      },

      "&.selected": {
        backgroundColor: theme.palette.grey[600],
        borderLeft: `2px solid ${"var(--palette-primary-main)"}`
      },
      ".date": {
        fontSize: theme.fontSizeTiny,
        marginTop: "-0.25em",
        textTransform: "uppercase",
        color: theme.palette.grey[200]
      },
      p: {
        fontWeight: "300"
      }
    },

    ".thread-title": {
      fontSize: theme.fontSizeSmall,
      fontWeight: "normal",
      color: theme.palette.c_white,
      marginBottom: "0.25em",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      paddingRight: "30px"
    },

    ".date": {
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.grey[200]
    },

    ".delete-button": {
      position: "absolute",
      right: "0.5em",
      top: "50%",
      transform: "translateY(-50%)",
      opacity: 0,
      padding: "4px",
      minWidth: "unset",
      color: theme.palette.grey[200],
      transition: "opacity 0.2s",

      "&:hover": {
        color: theme.palette.c_error,
        backgroundColor: theme.palette.grey[500]
      },

      svg: { fontSize: "1.2em" }
    }
  });
