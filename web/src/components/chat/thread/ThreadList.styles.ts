import { css } from "@emotion/react";

export const createStyles = (theme: any) =>
  css({
    width: "260px",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "var(--palette-background-paper)",

    ".new-chat-section": { padding: theme.spacing(2) },

    ".new-chat-button": {
      width: "100%",
      padding: "0.5em 1em",
      borderRadius: "8px",
      backgroundColor: "var(--c_gray1)",
      color: theme.palette.c_white,
      textTransform: "none",
      justifyContent: "flex-start",
      transition: "background 0.2s",
      "&:hover": { backgroundColor: theme.palette.c_gray3 }
    },

    ".thread-list": {
      flex: 1,
      overflow: "auto",
      padding: 0,
      margin: 0,
      listStyle: "none"
    },

    ".thread-item": {
      position: "relative",
      padding: "0.75em 1em",
      borderLeft: `2px solid transparent`,
      cursor: "pointer",
      transition: "all 0.2s",

      "&:hover": {
        backgroundColor: theme.palette.c_gray2,
        ".delete-button": { opacity: 1 }
      },

      "&.selected": {
        backgroundColor: theme.palette.c_gray0,
        borderLeft: `2px solid ${theme.palette.c_hl1}`
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
      color: theme.palette.c_gray5
    },

    ".delete-button": {
      position: "absolute",
      right: "0.5em",
      top: "50%",
      transform: "translateY(-50%)",
      opacity: 0,
      padding: "4px",
      minWidth: "unset",
      color: theme.palette.c_gray5,
      transition: "opacity 0.2s",

      "&:hover": {
        color: theme.palette.c_error,
        backgroundColor: theme.palette.c_gray3
      },

      svg: { fontSize: "1.2em" }
    }
  });
