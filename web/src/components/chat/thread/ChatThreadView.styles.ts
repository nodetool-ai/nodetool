import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import {
  MOTION,
  BORDER_RADIUS,
  TYPOGRAPHY,
  SPACING,
  SPACING_PX,
  FONT_SIZE_SANS,
  Z_INDEX
} from "../../ui_primitives";
import { CHAT_COLUMN_MAX_WIDTH } from "../types/chat.types";

/** Glyph column width and single-line row height for the tool-call timeline. */
const TOOL_RAIL_WIDTH = 20;
const TOOL_ROW_HEIGHT = 22;

/** Glyph geometry for the log-update rail: hairline width and dot diameter. */
const LOG_RAIL_WIDTH = 2;
const LOG_DOT_SIZE = 10;

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
    // Without this the axis computes to `auto` alongside `overflowY`, and a
    // single wide turn lets a phone pan the whole conversation sideways.
    // Content that genuinely needs the width (code blocks, tables, JSON
    // dumps) scrolls inside its own box.
    overflowX: "hidden",
    overflowAnchor: "none",
    padding: theme.spacing(2, 0),
    marginTop: 0,
    position: "relative",

    // `!important` only on width: the global `::-webkit-scrollbar` rule in
    // styles/index.css sets `width: 10px !important`, which no amount of
    // specificity beats without one. The track/thumb rules below carry no
    // `!important` globally, so specificity alone wins there.
    "&::-webkit-scrollbar": {
      width: "12px !important"
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent"
    },
    "&::-webkit-scrollbar-thumb": {
      background: theme.vars.palette.action.disabled,
      borderRadius: BORDER_RADIUS.sm
    },
    "&::-webkit-scrollbar-thumb:hover": {
      background: theme.vars.palette.warning.main
    },
  }),
  chatMessagesList: css({
    maxWidth: `${CHAT_COLUMN_MAX_WIDTH}px`,
    width: "100%",
    minWidth: 0,
    padding: "0",
    margin: "0",

    ".chat-message": {
      width: "100%",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      marginBottom: theme.spacing(SPACING.md),
      padding: theme.spacing(SPACING.md, SPACING.none),
      borderRadius: BORDER_RADIUS.sm,
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: theme.spacing(1)
    },
    // The turn's body. `.chat-message` aligns its children to the start, so
    // without a width this box takes its content's min-content size — an
    // unbreakable URL or a wide table then makes the turn wider than the
    // column instead of wrapping or scrolling inside it.
    ".message-body": {
      width: "100%",
      minWidth: 0,
      maxWidth: "100%"
    },
    ".chat-message.assistant": {
      padding: theme.spacing(3, 4),
      borderRadius: BORDER_RADIUS.xl
    },
    // User message container (transparent, just for layout)
    ".user": {
      width: "fit-content",
      maxWidth: "75%",
      minWidth: theme.spacing(SPACING.xxxl),
      margin: `${theme.spacing(SPACING.xl)} 0 ${theme.spacing(SPACING.md)} auto`,
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
      padding: theme.spacing(SPACING.xs),
      textAlign: "left"
    },

    ".chat-message.user .markdown": {
      padding: theme.spacing(SPACING.md, SPACING.xl)
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
      borderRadius: BORDER_RADIUS.lg
    },

    // Keep user->assistant transitions compact.
    ".chat-message.user + .chat-message.assistant": {
      marginTop: theme.spacing(SPACING.none),
      paddingTop: theme.spacing(SPACING.micro)
    },

    // Denser stacking for consecutive assistant messages only.
    // Keep user bubble spacing unchanged. The negative top margin is what
    // pulls a follow-up assistant turn up against the one before it — a
    // positive value would reinstate the gap this rule exists to remove.
    ".chat-message.assistant + .chat-message.assistant": {
      marginTop: theme.spacing(-SPACING.xs),
      marginBottom: theme.spacing(SPACING.xs),
      paddingTop: theme.spacing(SPACING.xs),
      paddingBottom: theme.spacing(SPACING.xs)
    },

    // Same reason for the negative margin: a tool-only turn sits tighter still.
    ".chat-message.assistant + .chat-message.assistant.tool-calls-only": {
      marginTop: theme.spacing(-SPACING.sm),
      marginBottom: theme.spacing(SPACING.micro),
      paddingTop: theme.spacing(SPACING.none),
      paddingBottom: theme.spacing(SPACING.none)
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

    ".error-message": {
      backgroundColor: theme.vars.palette.error.dark,
      border: `1px solid ${theme.vars.palette.error.main}`,
      borderRadius: BORDER_RADIUS.lg,
      padding: theme.spacing(SPACING.xl),
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
      marginBottom: theme.spacing(SPACING.xl)
    },

    ".chat-message a": {
      color: theme.vars.palette.primary.main
    },

    // No `!important` needed: the competing rules (`a` in styles/index.css,
    // `.markdown-body a`/`a:hover` in the github-markdown sheet) are all
    // plain declarations this selector already outranks.
    ".chat-message a:hover": {
      color: theme.vars.palette.primary.light,
      textDecoration: "none"
    },

    ".node-status": {
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall,
      margin: theme.spacing(SPACING.md, SPACING.none)
    },

    ".node-progress": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      margin: theme.spacing(SPACING.xxxl, SPACING.none)
    },

    ".progress-bar": {
      width: "80%",
      marginBottom: theme.spacing(SPACING.md)
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

    // ── Live log update ─────────────────────────────────────────────────────
    // One log line from the running turn, hung off a gradient rail with a
    // marker dot so it reads as a moment in the run rather than a message.
    ".log-update": {
      position: "relative",
      paddingLeft: theme.spacing(SPACING.xxl)
    },

    ".log-update-rail": {
      position: "absolute",
      left: SPACING_PX.xs,
      top: SPACING_PX.lg,
      bottom: SPACING_PX.lg,
      width: LOG_RAIL_WIDTH,
      background: `linear-gradient(to bottom, ${theme.vars.palette.primary.main}, ${theme.vars.palette.secondary.main}44)`,
      borderRadius: BORDER_RADIUS.xs
    },

    ".log-update-dot": {
      position: "absolute",
      left: -SPACING_PX.xxl,
      top: SPACING_PX.lg,
      width: LOG_DOT_SIZE,
      height: LOG_DOT_SIZE,
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.primary.main,
      border: `${LOG_RAIL_WIDTH}px solid ${theme.vars.palette.background.default}`,
      boxShadow: `0 0 ${LOG_DOT_SIZE}px ${theme.vars.palette.primary.main}aa`,
      zIndex: Z_INDEX.raised
    },

    ".log-entry": {
      fontSize: FONT_SIZE_SANS.label,
      padding: theme.spacing(SPACING.md, SPACING.lg),
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: theme.vars.palette.c_scrim,
      border: `1px solid ${theme.vars.palette.action.disabledBackground}`
    },

    ".log-severity-info": {
      color: theme.vars.palette.grey[300]
    },

    ".log-severity-warning": {
      color: theme.vars.palette.warning.light
    },

    ".log-severity-error": {
      color: theme.vars.palette.error.light
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
      "& svg": { fontSize: FONT_SIZE_SANS.body }
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

    ".tool-row.plan .tool-row-label": {
      color: theme.vars.palette.text.primary
    },

    ".tool-row-plan": {
      padding: theme.spacing(SPACING.xs, 0, SPACING.md),
      minWidth: 0
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
      fontSize: FONT_SIZE_SANS.body,
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

    // The objective stays compact: enough to recognize the job, not a wall of
    // prompt. The transcript below it is what the user unfolds the card for.
    ".subtask-instructions": {
      whiteSpace: "pre-wrap",
      color: theme.vars.palette.text.secondary,
      lineHeight: 1.45,
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: 3,
      overflow: "hidden"
    },

    // A delegated child's own thread, one level in. The rule on the left is
    // what marks its messages as the sub-agent's rather than the main reply's.
    ".subagent-transcript": {
      minWidth: 0,
      paddingLeft: theme.spacing(SPACING.md),
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      ".chat-message": {
        padding: 0,
        margin: 0,
        background: "transparent",
        maxWidth: "100%"
      },
      ".message-actions": {
        display: "none"
      }
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

    // Keeps the assistant's horizontal padding so a tool-only turn lines up
    // with the prose turns above and below it.
    ".chat-message.tool-calls-only": {
      marginBottom: theme.spacing(SPACING.micro),
      padding: theme.spacing(SPACING.micro, SPACING.xl)
    },

    ".chat-message.has-tool-calls:not(.tool-calls-only)": {
      marginBottom: theme.spacing(SPACING.sm),
      paddingTop: theme.spacing(SPACING.xs),
      paddingBottom: theme.spacing(SPACING.xs)
    },

    // The message column aligns its children to the start, which would size
    // the tool rows to their own text. They are rows, not chips: stretch.
    ".chat-message.has-tool-calls .message-content": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(SPACING.micro),
      alignSelf: "stretch",
      width: "100%"
    },

    ".chat-message.has-tool-calls .markdown": {
      marginTop: theme.spacing(SPACING.micro)
    },

    ".chat-message.has-tool-calls .markdown-body p": {
      margin: theme.spacing(SPACING.xs, SPACING.none)
    },

    ".chat-message.has-tool-calls .markdown-body p:first-of-type": {
      marginTop: theme.spacing(SPACING.none)
    },

    ".chat-message.has-tool-calls .markdown-body p:last-child": {
      marginBottom: 0
    },

    ".chat-message.has-tool-calls .markdown-body ul, .chat-message.has-tool-calls .markdown-body ol":
      {
        marginTop: theme.spacing(SPACING.xs),
        marginBottom: theme.spacing(SPACING.xs)
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
      fontSize: FONT_SIZE_SANS.title,
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
      marginBottom: theme.spacing(SPACING.md)
    },

    ".execution-events-group": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(SPACING.md),
      marginBottom: theme.spacing(SPACING.xxl),
      padding: theme.spacing(SPACING.lg),
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: theme.vars.palette.action.hover,
      border: `1px solid ${theme.vars.palette.divider}`
    },

    ".execution-event-separator": {
      height: "1px",
      backgroundColor: theme.vars.palette.divider,
      margin: theme.spacing(SPACING.xl, SPACING.none),
      opacity: 0.3
    }
  })
});
