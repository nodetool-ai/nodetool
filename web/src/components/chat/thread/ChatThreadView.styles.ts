import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { MOTION, BORDER_RADIUS, TYPOGRAPHY, SPACING } from "../../ui_primitives";

/** Glyph column width and single-line row height for the tool-call timeline. */
const TOOL_RAIL_WIDTH = 20;
const TOOL_ROW_HEIGHT = 22;

export const createStyles = (theme: Theme) => ({
  chatThreadViewRoot: css({
    backgroundColor: theme.vars.palette.background.default,
    flexGrow: 1,
    position: "relative",
    display: "flex",
    flexDirection: "column",
    padding: theme.spacing(6, 0, 3),
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
    padding: theme.spacing(2),
    marginTop: 0,
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
      gap: theme.spacing(1)
    },
    ".chat-message.assistant": {
      padding: theme.spacing(3, 4),
      borderRadius: BORDER_RADIUS.xl
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
      textAlign: "left"
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
      borderRadius: ".5em"
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

    // Status chrome ("Thinking…", elapsed time) shares the assistant
    // message's left edge and the label type style (13px / 500).
    ".chat-status-row": {
      padding: theme.spacing(1, 4),
      minHeight: theme.spacing(6)
    },

    ".chat-status-label": {
      ...TYPOGRAPHY.sans.label,
      color: theme.vars.palette.text.secondary,
      margin: 0
    },

    ".chat-status-elapsed": {
      ...TYPOGRAPHY.sans.caption,
      marginLeft: "auto",
      fontVariantNumeric: "tabular-nums"
    },

    ".thought-section-container": {
      margin: theme.spacing(1, 0)
    },

    ".thought-section-container .labeled-toggle": {
      paddingLeft: 0,
      paddingRight: 0
    },

    ".thought-section-container .labeled-toggle-label": {
      ...TYPOGRAPHY.sans.label
    },

    // ── Tool call timeline ──────────────────────────────────────────────────
    // A message's tool calls read as a sequence of steps, not a stack of
    // cards: a glyph column, a hairline tying each row to the next, the verb
    // phrase for what happened, and the thing it happened to in mono. A
    // sequence of two or more ends in a footer that folds the rows away.
    ".tool-timeline": {
      width: "100%",
      margin: theme.spacing(SPACING.xs, 0)
    },

    ".tool-row": {
      display: "grid",
      gridTemplateColumns: `${TOOL_RAIL_WIDTH}px 1fr`,
      columnGap: theme.spacing(SPACING.md),
      minWidth: 0
    },

    ".tool-row-rail": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      minHeight: TOOL_ROW_HEIGHT
    },

    ".tool-row-glyph": {
      width: TOOL_RAIL_WIDTH,
      height: TOOL_ROW_HEIGHT,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      color: theme.vars.palette.text.disabled,
      "& svg": { fontSize: 16 }
    },

    ".tool-row-connector": {
      flex: 1,
      width: 1,
      minHeight: theme.spacing(SPACING.sm),
      background: theme.vars.palette.divider
    },

    ".tool-row-main": {
      minWidth: 0,
      paddingBottom: theme.spacing(SPACING.xs)
    },

    // A run of same-tool calls sits flush, so the cluster reads as one step.
    ".tool-row.tight .tool-row-main": {
      paddingBottom: 0
    },

    ".tool-row-header": {
      minHeight: TOOL_ROW_HEIGHT,
      lineHeight: 1.3,
      borderRadius: BORDER_RADIUS.sm,
      padding: theme.spacing(SPACING.none, SPACING.sm),
      marginLeft: theme.spacing(-SPACING.sm)
    },

    ".tool-row-header.expandable": {
      cursor: "pointer",
      userSelect: "none",
      transition: MOTION.background,
      "&:hover": {
        background: theme.vars.palette.action.hover
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      }
    },

    ".tool-row-label": {
      color: theme.vars.palette.text.secondary,
      minWidth: 0
    },

    ".tool-row.running .tool-row-label": {
      color: theme.vars.palette.text.primary
    },

    ".tool-row.subtask .tool-row-label": {
      // Subtask titles are a phrase, not an identifier — let them wrap.
      whiteSpace: "normal",
      color: theme.vars.palette.text.primary
    },

    // The thing the row acted on: a URL, a path, a query. Mono so it reads
    // apart from the prose that names the action.
    ".tool-row-detail": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: 0
    },

    ".tool-row-gap": {
      flex: 1,
      minWidth: theme.spacing(SPACING.md)
    },

    ".tool-row-duration": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
      flexShrink: 0
    },

    // The chevron is an affordance, not decoration: it shows on approach.
    ".tool-row-chevron": {
      transition: MOTION.all,
      color: theme.vars.palette.text.disabled,
      fontSize: 15,
      flexShrink: 0,
      opacity: 0
    },

    ".tool-row-header:hover .tool-row-chevron, .tool-row-header:focus-visible .tool-row-chevron, .tool-row-chevron.expanded":
      {
        opacity: 1
      },

    ".tool-row-chevron.expanded": {
      transform: "rotate(180deg)"
    },

    ".tool-row-details": {
      padding: theme.spacing(SPACING.xs, 0, SPACING.md),
      minWidth: 0,
      ".code-block-container": {
        marginBottom: 0
      }
    },

    ".tool-row-children": {
      paddingBottom: theme.spacing(SPACING.xs)
    },

    ".subtask-instructions": {
      whiteSpace: "pre-wrap",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.45
    },

    ".tool-timeline-footer": {
      cursor: "pointer",
      userSelect: "none",
      marginTop: theme.spacing(SPACING.xs),
      borderRadius: BORDER_RADIUS.sm,
      padding: theme.spacing(SPACING.none, SPACING.sm),
      marginLeft: theme.spacing(-SPACING.sm),
      minHeight: TOOL_ROW_HEIGHT,
      transition: MOTION.background,
      "&:hover": {
        background: theme.vars.palette.action.hover
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      }
    },

    ".tool-timeline-summary": {
      color: theme.vars.palette.text.disabled
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

    ".tool-section-header": {
      minHeight: theme.spacing(SPACING.xxl)
    },

    ".tool-section-title": {
      color: theme.vars.palette.text.disabled,
      display: "block",
      marginBottom: theme.spacing(SPACING.xs)
    },

    ".tool-section-header .tool-section-title": {
      marginBottom: 0
    },

    ".media-prediction-inline": {
      padding: theme.spacing(SPACING.none, SPACING.none, SPACING.xs)
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
