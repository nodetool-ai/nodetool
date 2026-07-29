import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { MOTION, BORDER_RADIUS } from "../../ui_primitives";

export const createStyles = (theme: Theme) => ({
  chatThreadViewRoot: css({
    backgroundColor: theme.vars.palette.background.default,
    flexGrow: 1,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    padding: "1.5em 0 0.75em",
    minHeight: 0,
  }),
  messageWrapper: css({
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
    overflowY: "auto",
    overflowAnchor: "none",
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
      borderRadius: BORDER_RADIUS.sm
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: `${theme.vars.palette.warning.main} !important`
    },
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
      marginBottom: "0.5em",
      padding: "0.5em 0",
      borderRadius: BORDER_RADIUS.sm,
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: theme.spacing(1),
      border: "1px solid transparent",
      transition: MOTION.border
    },
    ".chat-message.assistant": {
      padding: "0.75em 1em",
      borderRadius: "1em",
      transition: MOTION.border
    },
    ".chat-message.assistant:hover": {
      border: `1px solid ${theme.vars.palette.divider}`
    },
    // User message container (transparent, just for layout)
    ".user": {
      width: "fit-content",
      maxWidth: "75%",
      minWidth: "2em",
      margin: "1em 0 0.5em auto",
      padding: "0",
      border: "none",
      background: "transparent",
      alignItems: "flex-end",
      fontWeight: 500
    },

    // User message content gets the colored background. A soft primary tint
    // separates the user's voice from the surface — `background.paper` was
    // nearly invisible against the default background.
    ".user .message-content": {
      background: `rgb(${theme.vars.palette.primary.mainChannel} / 0.14)`,
      color: theme.vars.palette.text.primary,
      borderRadius: BORDER_RADIUS.xl,
      padding: "0.2em",
      textAlign: "left",
      border: "1px solid transparent",
      transition: `border-color ${MOTION.fast}`
    },

    ".user:hover .message-content": {
      borderColor: `rgb(${theme.vars.palette.primary.mainChannel} / 0.35)`
    },

    ".chat-message.user .markdown": {
      padding: ".5em 1em"
    },

    // A user's own referenced/attached image renders as a thumbnail, not a
    // full-width preview. ImageView fills its container (width: 100%), so a
    // max cap on the `.image-output` root is what constrains it — the inline
    // width leaves maxWidth/maxHeight free for the stylesheet to set.
    ".chat-message.user .message-content .image-output": {
      maxWidth: "220px",
      maxHeight: "220px"
    },

    ".assistant": {
      alignItems: "flex-start",
      background: "transparent"
    },

    ".assistant .message-content": {
      borderRadius: ".5em",
      transition: `border-color ${MOTION.fast}`
    },

    // Keep user->assistant transitions compact.
    ".chat-message.user + .chat-message.assistant": {
      marginTop: "0.05em",
      paddingTop: "0.15em"
    },

    // Denser stacking for consecutive assistant messages only.
    // Keep user bubble spacing unchanged.
    ".chat-message.assistant + .chat-message.assistant": {
      marginTop: "-0.3em",
      marginBottom: "0.3em",
      paddingTop: "0.2em",
      paddingBottom: "0.2em"
    },

    ".chat-message.assistant + .chat-message.assistant.tool-calls-only": {
      marginTop: "-0.4em",
      marginBottom: "0.08em",
      paddingTop: "0.04em",
      paddingBottom: "0.04em"
    },

    // Message actions container (copy button, timestamp) - OUTSIDE the bubble
    ".message-actions": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      marginTop: theme.spacing(1),
      opacity: 0,
      pointerEvents: "none",
      transition: MOTION.opacity,
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

    ".message-model": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.disabled,
      whiteSpace: "nowrap",
      fontFamily: theme.fontFamily2
    },

    // ── Per-message meta layout (full-page chat: avatar + header) ──────────
    // The body wrapper is layout-neutral by default so the compact (non-meta)
    // layout is unchanged; it only becomes a column under `--meta`.
    ".message-body": {
      display: "contents"
    },

    ".chat-message--meta": {
      flexDirection: "column",
      alignItems: "stretch",
      gap: 0
    },

    // Normalize horizontal padding for both roles so the message bodies line up
    // on a single left edge. The base `.assistant` rule sets
    // `padding: 0.75em 1em`, which would otherwise indent assistant rows.
    ".chat-message.assistant.chat-message--meta, .chat-message.user.chat-message--meta": {
      padding: "0.6em 0"
    },

    ".chat-message.assistant.chat-message--meta:hover": {
      border: "1px solid transparent"
    },

    ".chat-message--meta .message-body": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      width: "100%",
      minWidth: 0
    },

    ".message-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      fontSize: theme.fontSizeSmaller,
      lineHeight: 1
    },

    ".message-role-icon": {
      fontSize: 15,
      flexShrink: 0
    },

    // Quiet identity for the two voices: the user's own icon recedes, the
    // assistant gets a soft brand tint so the eye lands on its turns.
    ".chat-message.user .message-role-icon": {
      color: theme.vars.palette.grey[500]
    },

    ".chat-message.assistant .message-role-icon": {
      color: theme.vars.palette.primary.main,
      opacity: 0.85
    },

    ".message-header .message-time, .message-header .message-model": {
      color: theme.vars.palette.text.disabled,
      fontVariantNumeric: "tabular-nums"
    },

    // Under the meta layout, user messages drop the right-aligned bubble and
    // read left-aligned like the assistant.
    ".chat-message.user.chat-message--meta": {
      width: "100%",
      maxWidth: "100%",
      margin: "0.5em 0 0",
      alignItems: "flex-start",
      fontWeight: 400
    },

    ".chat-message.user.chat-message--meta .message-content": {
      background: "transparent",
      color: theme.vars.palette.text.primary,
      textAlign: "left",
      padding: 0,
      border: "none"
    },

    ".chat-message.user.chat-message--meta:hover .message-content": {
      borderColor: "transparent"
    },

    ".chat-message.user.chat-message--meta .markdown": {
      padding: 0
    },

    ".error-message": {
      backgroundColor: theme.vars.palette.error.dark,
      border: `1px solid ${theme.vars.palette.error.main}`,
      borderRadius: BORDER_RADIUS.lg,
      padding: "1em",
      color: theme.vars.palette.error.contrastText,
      "& .markdown": {
        color: theme.vars.palette.error.contrastText
      },
      "& code": {
        backgroundColor: theme.vars.palette.c_scrim_soft,
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
      padding: theme.spacing(6, 0)
    },

    ".loading-dots": {
      display: "flex",
      justifyContent: "flex-start",
      alignItems: "center"
    },

    ".dot": {
      width: "10px",
      height: "10px",
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.text.secondary,
      margin: theme.spacing(0, 1.5)
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
      maxWidth: "100%",
      overflow: "hidden",
      wordBreak: "break-word",
      overflowWrap: "anywhere"
    },

    // ── Tool execution chain ────────────────────────────────────────────────
    // A message's tool calls render as a chain: tiny uppercase section label
    // with a hairline rule, one bordered card per call, and a summary bar.
    ".tool-call-group": {
      width: "100%",
      margin: theme.spacing(0.5, 0)
    },

    ".tool-call-group-header": {
      cursor: "pointer",
      userSelect: "none",
      borderRadius: BORDER_RADIUS.sm,
      padding: theme.spacing(0.25, 0),
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: 1
      }
    },

    ".tool-call-group-label": {
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      whiteSpace: "nowrap"
    },

    ".tool-call-group-rule": {
      height: 1,
      flex: 1,
      background: theme.vars.palette.divider
    },

    ".tool-call-chain": {
      marginTop: theme.spacing(1)
    },

    ".tool-call-summary": {
      background: theme.vars.palette.action.hover,
      borderRadius: BORDER_RADIUS.sm,
      padding: theme.spacing(0.5, 1.5),
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmaller)"
    },

    ".tool-call-summary-divider": {
      opacity: 0.3
    },

    ".tool-call-summary-duration": {
      fontFamily: theme.fontFamily2,
      fontVariantNumeric: "tabular-nums"
    },

    ".tool-call-card": {
      width: "100%",
      borderRadius: BORDER_RADIUS.md,
      background: theme.vars.palette.action.hover,
      overflow: "hidden",
      marginBottom: 0
    },

    ".tool-icon-tile": {
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.sm,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      background: theme.vars.palette.action.hover,
      "& svg": { fontSize: 15 }
    },

    ".tool-icon-tile.accent-info": {
      color: theme.vars.palette.info.main,
      background: `rgb(${theme.vars.palette.info.mainChannel} / 0.12)`
    },
    ".tool-icon-tile.accent-warning": {
      color: theme.vars.palette.warning.main,
      background: `rgb(${theme.vars.palette.warning.mainChannel} / 0.12)`
    },
    ".tool-icon-tile.accent-success": {
      color: theme.vars.palette.success.main,
      background: `rgb(${theme.vars.palette.success.mainChannel} / 0.12)`
    },
    ".tool-icon-tile.accent-primary": {
      color: theme.vars.palette.primary.main,
      background: `rgb(${theme.vars.palette.primary.mainChannel} / 0.12)`
    },
    ".tool-icon-tile.accent-secondary": {
      color: theme.vars.palette.secondary.main,
      background: `rgb(${theme.vars.palette.secondary.mainChannel} / 0.12)`
    },

    ".tool-call-id": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },

    ".tool-call-duration": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap"
    },

    ".tool-call-details": {
      padding: theme.spacing(1, 1.5, 1.25),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },

    ".tool-call-card.running .tool-call-name": {
      color: theme.vars.palette.info.main
    },

    // `run_subtask` cards stand apart from generic tool calls — a light
    // accent border + soft background marks them as a deeper sub-execution.
    ".tool-call-card.run-subtask": {
      borderLeft: `2px solid ${theme.vars.palette.primary.main}`,
      background: `rgb(${theme.vars.palette.primary.mainChannel} / 0.04)`,
      marginBottom: theme.spacing(0.5)
    },

    ".tool-call-card.run-subtask .tool-call-badge": {
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: theme.vars.palette.primary.main,
      lineHeight: 1,
      padding: theme.spacing(0.5, 1.5),
      border: `1px solid ${theme.vars.palette.primary.main}55`,
      borderRadius: BORDER_RADIUS.sm,
      background: "transparent",
      flexShrink: 0
    },

    ".tool-call-card.run-subtask .tool-call-name": {
      // Subtask titles tend to be a phrase, not a snake_case identifier — let
      // them wrap rather than truncate so the user can read the whole thing.
      whiteSpace: "normal",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      fontSize: "var(--fontSizeSmall)"
    },

    ".tool-call-card.run-subtask .subtask-instructions": {
      whiteSpace: "pre-wrap",
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.45
    },

    ".chat-message.tool-calls-only": {
      marginBottom: "0.15em",
      padding: "0.1em 0"
    },

    ".chat-message.has-tool-calls:not(.tool-calls-only)": {
      marginBottom: "0.35em",
      paddingTop: "0.2em",
      paddingBottom: "0.2em"
    },

    ".chat-message.has-tool-calls .message-content": {
      display: "flex",
      flexDirection: "column",
      gap: "0.1em"
    },

    ".chat-message.has-tool-calls .tool-call-card + .tool-call-card": {
      marginTop: theme.spacing(1)
    },

    ".chat-message.has-tool-calls .markdown": {
      marginTop: "0.1em"
    },

    ".chat-message.has-tool-calls .markdown-body p": {
      margin: "0.2em 0"
    },

    ".chat-message.has-tool-calls .markdown-body p:first-of-type": {
      marginTop: "0.05em"
    },

    ".chat-message.has-tool-calls .markdown-body p:last-child": {
      marginBottom: 0
    },

    ".chat-message.has-tool-calls .markdown-body ul, .chat-message.has-tool-calls .markdown-body ol":
      {
        marginTop: "0.2em",
        marginBottom: "0.2em"
      },

    ".chat-message.tool-calls-only .tool-call-card:last-child": {
      marginBottom: 0
    },

    ".tool-call-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      lineHeight: 1.25,
      padding: theme.spacing(1, 1.5)
    },

    ".tool-call-header.expandable": {
      cursor: "pointer",
      userSelect: "none",
      transition: MOTION.background,
      "&:hover": {
        background: theme.vars.palette.action.selected
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      }
    },

    ".tool-call-name": {
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap"
    },

    ".tool-message": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary
    },

    ".expand-icon": {
      transition: MOTION.transform,
      color: theme.vars.palette.text.disabled,
      fontSize: 16
    },

    ".expand-icon.expanded": {
      transform: "rotate(180deg)"
    },

    ".tool-section-title": {
      color: theme.vars.palette.text.disabled,
      display: "block",
      marginBottom: theme.spacing(0.5)
    },

    ".pretty-json": {
      margin: 0,
      padding: theme.spacing(1, 1.5),
      background: theme.vars.palette.background.default,
      borderRadius: BORDER_RADIUS.md,
      color: theme.vars.palette.text.secondary,
      border: `1px solid ${theme.vars.palette.divider}`,
      overflowX: "auto"
    },

    ".error-icon": {
      color: theme.vars.palette.error.main,
      fontSize: 20,
      marginTop: theme.spacing(1),
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
      borderRadius: BORDER_RADIUS.lg,
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
