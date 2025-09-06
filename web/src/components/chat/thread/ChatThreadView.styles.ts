import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

export const createStyles = (theme: Theme) => ({
  chatThreadViewRoot: css({
    flexGrow: 1,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    padding: "2em 0",
    marginRight: "20px",
    minHeight: 0
  }),
  scrollableMessageWrapper: css({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
    overflowY: "auto",
    overflowX: "hidden",
    padding: "0 .5em",
    marginTop: ".2em",
    // marginRight: "10px",
    position: "relative",
    scrollbarWidth: "auto",
    scrollbarColor: "var(--palette-grey-600) transparent",

    "&::-webkit-scrollbar": {
      width: "12px !important"
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent !important"
    },
    "&::-webkit-scrollbar-thumb": {
      background: "var(--palette-grey-600) !important",
      borderRadius: "4px"
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: "var(--palette-warning-main) !important"
    }
  }),
  chatMessagesList: css({
    listStyleType: "none",
    maxWidth: "1100px",
    width: "100%",
    minWidth: 0,
    padding: "0",
    margin: "0",
    // backgroundColor: "var(--palette-background-paper)",

    "li.chat-message": {
      width: "100%",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      listStyleType: "none",
      marginBottom: "1em",
      padding: "0.5em 0",
      borderRadius: "4px",
      position: "relative",
      display: "flex",
      alignItems: "flex-start",
      gap: "8px"
    },

    "li.user": {
      width: "60%",
      margin: "4em 0 2em auto",
      padding: "0.2em",
      color: theme.vars.palette.grey[100],
      backgroundColor: theme.vars.palette.grey[800],
      opacity: 0.9,
      borderRadius: "20px"
    },

    ".chat-message.user .markdown": {
      padding: ".5em 1em"
    },

    "li.assistant": {
      // color: theme.vars.palette.grey[0]
    },

    "li.chat-message .copy-button": {
      position: "absolute",
      top: "8px",
      right: "8px",
      zIndex: 1,
      cursor: "pointer",
      opacity: 0,
      pointerEvents: "none",
      transition: "opacity 0.2s ease"
    },
    "li.chat-message:hover .copy-button": {
      opacity: 0.7,
      pointerEvents: "auto"
    },
    "li.chat-message .copy-button:hover": {
      opacity: 1
    },

    "li.chat-message p": {
      // margin: "0.2em 0"
      // fontSize: theme.fontSizeNormal,
      // lineHeight: "1.5em"
      // fontWeight: "300"
      // color: theme.vars.palette.grey[0]
    },

    "li.error-message": {
      backgroundColor: theme.vars.palette.error.dark,
      border: `1px solid ${theme.vars.palette.error.main}`,
      borderRadius: "8px",
      padding: "1em",
      color: theme.vars.palette.error.contrastText,
      "& .markdown": {
        color: theme.vars.palette.error.contrastText
      },
      "& code": {
        backgroundColor: "rgba(0,0,0,0.3)",
        color: theme.vars.palette.error.contrastText
      }
    },

    "li pre": {
      // fontFamily: theme.fontFamily2,
      // width: "100%",
      // backgroundColor: "rgba(0,0,0, 0.8)",
      // padding: "0.5em"
    },

    "li pre code": {
      // fontFamily: theme.fontFamily2,
      // color: theme.vars.palette.grey[0]
    },

    ".code-block-container": {
      marginBottom: "1em"
    },

    "li a": {
      color: "var(--palette-primary-main)"
    },

    "li a:hover": {
      color: "var(--palette-primary-light) !important",
      textDecoration: "none"
    },

    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "20px 0"
    },

    ".loading-dots": {
      display: "flex",
      justifyContent: "left",
      alignItems: "center"
    },

    ".dot": {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.grey[100],
      margin: "0 5px"
    },

    ".node-status": {
      textAlign: "center",
      color: theme.vars.palette.grey[100],
      fontSize: theme.fontSizeSmall,
      margin: "0.5em 0"
    },

    ".node-progress": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      margin: "2em 0"
    },

    ".progress-bar": {
      width: "80%",
      marginBottom: "0.5em"
    },

    ".message-content": {
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      wordBreak: "break-word",
      overflowWrap: "anywhere"
    },

    ".tool-call-card": {
      border: "1px solid var(--palette-grey-900)",
      borderRadius: 8,
      background: "transparent",
      padding: "6px 10px",
      marginBottom: 6
    },

    ".tool-call-header": {
      display: "flex",
      alignItems: "center",
      gap: 6
    },

    ".tool-chip": {
      fontWeight: 600,
      color: "var(--palette-grey-200)",
      borderColor: "var(--palette-grey-900)"
    },

    ".tool-message": {
      color: "var(--palette-grey-400)"
    },

    ".expand-icon": {
      transition: "transform 0.15s ease",
      color: "var(--palette-grey-500)"
    },

    ".expand-icon.expanded": {
      transform: "rotate(180deg)"
    },

    ".tool-section-title": {
      color: "var(--palette-grey-500)"
    },

    ".pretty-json": {
      margin: 0,
      padding: "8px 10px",
      background: "var(--palette-grey-1100, #0f0f0f)",
      borderRadius: 6,
      color: "var(--palette-grey-300)",
      border: "1px solid var(--palette-grey-900)",
      overflowX: "auto"
    },

    ".error-icon": {
      color: theme.vars.palette.error.main,
      fontSize: 20,
      marginTop: 4,
      flexShrink: 0
    },

    "li.chat-message-list-item": {
      listStyleType: "none",
      listStyle: "none",
      margin: "0",
      padding: "0",

      "&::before": {
        display: "none"
      },

      "&::marker": {
        display: "none"
      }
    }
  })
});
