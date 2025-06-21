import { css } from "@emotion/react";

export const createStyles = (theme: any) => ({
  chatThreadViewRoot: css({
    width: "100%",
    flexGrow: 1,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    marginBottom: "1em"
  }),
  scrollableMessageWrapper: css({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
    overflowY: "auto",
    padding: "0 .5em",
    marginTop: ".2em",
    marginRight: ".1em",
    position: "relative",
    scrollbarWidth: "auto",
    scrollbarColor: "var(--c_gray2) transparent",

    "&::-webkit-scrollbar": {
      width: "12px !important"
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent !important"
    },
    "&::-webkit-scrollbar-thumb": {
      background: "var(--c_gray2) !important",
      borderRadius: "4px"
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: "var(--c_warn) !important"
    }
  }),
  chatMessagesList: css({
    listStyleType: "none",
    maxWidth: "1100px",
    width: "100%",
    padding: "2em 1em",
    margin: "0",
    // backgroundColor: "var(--palette-background-paper)",

    "li.chat-message": {
      width: "100%",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      listStyleType: "none",
      marginBottom: "1em",
      padding: "0.5em 1em",
      borderRadius: "4px",
      position: "relative"
    },

    "li.chat-message .copy-button": {
      position: "absolute",
      top: "8px",
      right: "8px",
      zIndex: 1,
      cursor: "pointer"
    },

    "li.chat-message p": {
      // margin: "0.2em 0"
      // fontSize: theme.fontSizeNormal,
      // lineHeight: "1.5em"
      // fontWeight: "300"
      // color: theme.palette.c_white
    },

    "li.user": {
      width: "60%",
      marginLeft: "auto",
      padding: "0.2em",
      color: theme.palette.c_gray6,
      backgroundColor: theme.palette.c_gray2,
      opacity: 0.9,
      borderRadius: "20px"
    },

    "li .markdown": {
      padding: ".5em 1em"
    },

    "li.assistant": {
      // color: theme.palette.c_white
    },

    "li pre": {
      // fontFamily: theme.fontFamily2,
      // width: "100%",
      // backgroundColor: "rgba(0,0,0, 0.8)",
      // padding: "0.5em"
    },

    "li pre code": {
      // fontFamily: theme.fontFamily2,
      // color: theme.palette.c_white
    },

    "li a": {
      color: theme.palette.c_hl1
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
      justifyContent: "center",
      alignItems: "center"
    },

    ".dot": {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      backgroundColor: theme.palette.c_gray6,
      margin: "0 5px"
    },

    ".node-status": {
      textAlign: "center",
      color: theme.palette.c_gray6,
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
