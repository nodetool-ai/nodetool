import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

export const createStyles = (theme: Theme) => ({
  chatThreadViewRoot: css({
    backgroundColor: theme.vars.palette.background.default,
    flexGrow: 1,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    padding: "2em 0",
    minHeight: 0
  }),
  messageWrapper: css({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
    overflowY: "auto",
    padding: ".5em",
    marginTop: ".2em",
    position: "relative",

    "&::-webkit-scrollbar": {
      width: "12px !important"
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent !important"
    },
    "&::-webkit-scrollbar-thumb": {
      background: `${theme.vars.palette.action.disabled} !important`,
      borderRadius: "4px"
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: `${theme.vars.palette.warning.main} !important`
    }
  }),
  chatMessagesList: css({
    maxWidth: "800px",
    width: "100%",
    minWidth: 0,
    padding: "0",
    margin: "0",

    ".chat-message": {
      width: "100%",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      marginBottom: "1em",
      padding: "0.5em 0",
      borderRadius: "4px",
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "4px",
      border: "1px solid transparent",
      transition: "border-color 0.25s ease"
    },
    ".chat-message.assistant": {
      padding: "1em",
      borderRadius: "1em",
      transition: "border-color 0.25s ease"
    },
    ".chat-message.assistant:hover": {
      border: `1px solid ${theme.vars.palette.divider}`
    },
    // User message container (transparent, just for layout)
    ".user": {
      width: "fit-content",
      maxWidth: "75%",
      minWidth: "2em",
      margin: "4em 0 2em auto",
      padding: "0",
      border: "none",
      background: "transparent",
      alignItems: "flex-end",
      fontWeight: 500,
    },

    // User message content gets the colored background
    ".user .message-content": {
      background: theme.vars.palette.background.paper,
      color: theme.vars.palette.text.primary,
      borderRadius: ".75em",
      padding: "0.2em",
      textAlign: "right",
      border: "1px solid transparent",
      transition: "border-color 0.15s ease"
    },

    ".user:hover .message-content": {
      borderColor: theme.vars.palette.divider
    },

    ".chat-message.user .markdown": {
      padding: ".5em 1em"
    },

    ".assistant": {
      alignItems: "flex-start",
      background: "transparent"
    },

    ".assistant .message-content": {
      borderRadius: ".5em",
      transition: "border-color 0.15s ease"
    },

    // Message actions container (copy button, timestamp) - OUTSIDE the bubble
    ".message-actions": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginTop: "4px",
      opacity: 0,
      pointerEvents: "none",
      transition: "opacity 0.15s ease",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.disabled
    },

    ".chat-message:hover .message-actions": {
      opacity: 1,
      pointerEvents: "auto"
    },

    // User message: actions on the right
    ".user .message-actions": {
      justifyContent: "flex-end"
    },

    // Assistant message: actions on the left
    ".assistant .message-actions": {
      justifyContent: "flex-start"
    },

    ".message-timestamp": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.disabled,
      whiteSpace: "nowrap"
    },

    ".error-message": {
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

    ".code-block-container": {
      marginBottom: "1em"
    },

    ".chat-message a": {
      color: theme.vars.palette.primary.main
    },

    ".chat-message a:hover": {
      color: `${theme.vars.palette.primary.light} !important`,
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
      justifyContent: "flex-start",
      alignItems: "center"
    },

    ".dot": {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.text.secondary,
      margin: "0 5px"
    },

    ".node-status": {
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
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
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: 12,
      background: theme.vars.palette.action.hover,
      padding: "4px 8px",
      marginBottom: 2
    },

    ".chat-message.tool-calls-only": {
      marginBottom: "0.4em",
      padding: "0.25em 0"
    },

    ".chat-message.tool-calls-only .tool-call-card:last-child": {
      marginBottom: 0
    },

    ".tool-call-header": {
      display: "flex",
      alignItems: "center",
      gap: 6
    },

    ".tool-chip": {
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider
    },

    ".tool-message": {
      color: theme.vars.palette.text.secondary
    },

    ".expand-icon": {
      transition: "transform 0.15s ease",
      color: theme.vars.palette.text.disabled
    },

    ".expand-icon.expanded": {
      transform: "rotate(180deg)"
    },

    ".tool-section-title": {
      color: theme.vars.palette.text.disabled
    },

    ".pretty-json": {
      margin: 0,
      padding: "8px 10px",
      background: theme.vars.palette.background.default,
      borderRadius: 6,
      color: theme.vars.palette.text.secondary,
      border: `1px solid ${theme.vars.palette.divider}`,
      overflowX: "auto"
    },

    ".error-icon": {
      color: theme.vars.palette.error.main,
      fontSize: 20,
      marginTop: 4,
      flexShrink: 0
    },

    ".chat-message-list-item": {
      margin: "0",
      padding: "0",
      listStyle: "none"
    },

    // Execution event styles
    ".execution-event": {
      width: "100%",
      marginBottom: "0.5rem"
    },

    ".execution-events-group": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5rem",
      marginBottom: "1.5rem",
      padding: "0.75rem",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`
    },

    ".execution-event-separator": {
      height: "1px",
      backgroundColor: theme.vars.palette.divider,
      margin: "1rem 0",
      opacity: 0.3
    }
  })
});
