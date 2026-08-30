import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { MOTION, BORDER_RADIUS } from "../../ui_primitives";

/**
 * Slick media-generation composer styles — a rounded glass surface with a
 * textarea header, footer chip row, and primary Generate button.
 * Matches the reference screenshots.
 */
export const createMediaComposerStyles = (theme: Theme) =>
  css({
    width: "100%",
    display: "flex",
    flexDirection: "column",

    ".media-compose-card": {
      width: "100%",
      // Match the conversation overlay stacked above it in the canvas dock so
      // the two cards read as one system.
      borderRadius: BORDER_RADIUS.xxl,
      padding: `${theme.spacing(2)} ${theme.spacing(2)} ${theme.spacing(1.5)}`,
      background:
        theme.palette.mode === "light"
          ? theme.vars.palette.background.paper
          : theme.vars.palette.grey[900],
      backdropFilter: "blur(16px)",
      border: `1px solid ${
        theme.palette.mode === "light"
          ? theme.vars.palette.grey[600]
          : theme.vars.palette.divider
      }`,
      boxShadow:
        theme.palette.mode === "light"
          ? `0 1px 2px ${theme.vars.palette.c_scrim_soft}, 0 8px 24px ${theme.vars.palette.c_scrim_soft}`
          : `0 10px 40px ${theme.vars.palette.c_scrim}`,
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.5),
      transition: `${MOTION.border}, ${MOTION.shadow}`,
      "&:focus-within": {
        borderColor: `rgb(${theme.vars.palette.primary.mainChannel} / 0.5)`,
        boxShadow:
          theme.palette.mode === "light"
            ? `0 0 0 3px rgb(${theme.vars.palette.primary.mainChannel} / 0.1), 0 8px 24px ${theme.vars.palette.c_scrim_soft}`
            : `0 0 0 3px rgb(${theme.vars.palette.primary.mainChannel} / 0.12), 0 10px 40px ${theme.vars.palette.c_scrim}`
      },
      "&.dragging": {
        borderColor: theme.vars.palette.primary.main
      }
    },

    ".media-compose-card textarea.media-compose-input": {
      width: "100%",
      minHeight: 36,
      maxHeight: 220,
      margin: 0,
      // The prompt shares one text column with the chip row below: a chip's
      // own 12px padding insets its icon, so the textarea carries that inset
      // itself (row padding 4 + chip padding 12 = spacing(4)).
      padding: `${theme.spacing(2)} ${theme.spacing(4)}`,
      resize: "none",
      background: "transparent",
      color: theme.vars.palette.grey[50],
      border: "none",
      outline: "none",
      fontFamily: theme.fontFamily1,
      fontSize: "var(--fontSizeNormal)",
      lineHeight: "24px",
      boxSizing: "border-box",
      display: "block",
      overflowY: "hidden",
      transition: `padding ${MOTION.normal}`,
      "&::placeholder": {
        color: theme.vars.palette.grey[500],
        fontStyle: "normal"
      }
    },

    ".media-chip-row": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      width: "100%",
      // Chips carry their own 12px padding, so the row adds only the
      // remainder of the shared text column inset.
      padding: `0 ${theme.spacing(1)}`,
      boxSizing: "border-box",
      // Trailing run actions stay pinned to the right, so the row itself does
      // not wrap. The chip cluster wraps internally instead.
      flexWrap: "nowrap"
    },

    // The cluster of mode/model chips + primary action. Fills the row
    // horizontally (flex:1) so the trailing actions stay right-aligned, and
    // wraps its own chips when they overflow.
    ".media-chip-main": {
      flex: 1,
      minWidth: 0,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      flexWrap: "wrap"
    },

    // A narrow card keeps every chip on one line: the model chip shrinks and
    // truncates instead of pushing the workspace chip onto a second row.
    ".media-chip-row.narrow .media-chip-main": {
      flexWrap: "nowrap"
    },

    ".media-chip-row .divider-dot": {
      width: 4,
      height: 4,
      borderRadius: BORDER_RADIUS.circle,
      background: theme.vars.palette.grey[700],
      margin: `0 ${theme.spacing(0.5)}`
    },

    ".media-chip-row .tools-button": {
      height: 34,
      minWidth: 34,
      padding: 0,
      borderRadius: BORDER_RADIUS.pill,
      color: `${theme.vars.palette.grey[300]} !important`,
      borderColor: "transparent !important",
      backgroundColor: "transparent !important",
      boxShadow: "none",
      "&:hover": {
        backgroundColor: `${theme.vars.palette.c_overlay} !important`,
        color: `${theme.vars.palette.grey[100]} !important`
      },
      "&.active": {
        color: `${theme.vars.palette.grey[300]} !important`,
        borderColor: "transparent !important"
      },
      ".MuiButton-startIcon": {
        margin: 0,
        "& > *:nth-of-type(1)": {
          fontSize: 18
        }
      },
      "svg": {
        color: "currentColor !important"
      }
    },

    // The primary send/generate action. A row sibling of the chip cluster so
    // it can wrap onto the action-button line on mobile.
    ".media-primary-action": {
      display: "inline-flex",
      alignItems: "center",
      gap: theme.spacing(1),
      flexShrink: 0
    },

    // The list price of the next generation. Quiet enough to ignore, close
    // enough to the button to read before pressing it.
    ".media-cost-estimate": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      whiteSpace: "nowrap",
      cursor: "default",
      transition: `color ${MOTION.normal}`,
      "&:hover": {
        color: theme.vars.palette.text.secondary
      }
    },

    ".media-generate-btn": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height: 36,
      padding: `0 ${theme.spacing(3)}`,
      borderRadius: BORDER_RADIUS.pill,
      background: `linear-gradient(135deg, ${theme.vars.palette.primary.main} 0%, ${theme.vars.palette.primary.light} 100%)`,
      color: theme.vars.palette.primary.contrastText,
      border: "none",
      cursor: "pointer",
      fontFamily: theme.fontFamily1,
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 600,
      letterSpacing: 0.25,
      transition: `${MOTION.transform}, ${MOTION.shadow}, ${MOTION.opacity}`,
      boxShadow: "0 4px 14px rgba(var(--palette-primary-mainChannel) / 0.35)",
      "&:hover:not(:disabled)": {
        transform: "translateY(-1px)",
        boxShadow: "0 6px 18px rgba(var(--palette-primary-mainChannel) / 0.45)"
      },
      "&:disabled": {
        opacity: 0.5,
        cursor: "not-allowed",
        transform: "none",
        boxShadow: "none",
        background: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[500]
      }
    },

    // Attachments and entity mentions sit in the same text column as the
    // prompt, so the card reads as one left edge top to bottom.
    ".media-file-preview-row, .mentioned-entities": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: `0 ${theme.spacing(4)}`,
      boxSizing: "border-box"
    },

    ".file-preview": {
      position: "relative",
      maxWidth: 48,
      maxHeight: 48,
      flexShrink: 0,

      img: {
        width: 48,
        height: 48,
        objectFit: "cover",
        borderRadius: BORDER_RADIUS.sm
      }
    },

    // Mobile: the chip cluster plus the buttons never fit on one phone-width
    // line, so the card sheds padding and the chips scroll sideways instead of
    // wrapping into a block that pushes the composer up under the keyboard.
    [theme.breakpoints.down("sm")]: {
      ".media-compose-card": {
        padding: `${theme.spacing(1.5)} ${theme.spacing(1.5)} ${theme.spacing(1)}`,
        gap: theme.spacing(1)
      },
      ".media-compose-card textarea.media-compose-input": {
        // The chip row loses its padding here, so the column is the chip's
        // own 12px inset.
        padding: `${theme.spacing(1)} ${theme.spacing(3)}`,
        // The keyboard takes most of the screen — cap the growth well below
        // the desktop 220 (matches MOBILE_TEXTAREA_MAX_HEIGHT).
        maxHeight: 140
      },
      ".media-chip-row": {
        flexWrap: "wrap",
        rowGap: theme.spacing(1),
        padding: 0
      },
      ".media-file-preview-row, .mentioned-entities": {
        padding: `0 ${theme.spacing(3)}`
      },
      // One scrolling strip, never a wrapped block: chips keep their touch
      // size and the row keeps its height whatever the mode puts in it.
      ".media-chip-main": {
        flexWrap: "nowrap",
        overflowX: "auto",
        overflowY: "hidden",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
        "&::-webkit-scrollbar": {
          display: "none"
        },
        "> *": {
          flexShrink: 0
        }
      },
      ".media-chip-row .media-control-chip": {
        height: 38
      },
      // Narrower than the desktop pill so the chip strip keeps most of the
      // line, and tall enough to stay a comfortable touch target.
      ".media-generate-btn": {
        height: 40,
        padding: `0 ${theme.spacing(2)}`
      },
      // With host workflow actions (the canvas dock), give the chips their own
      // full line so every button — send plus the workflow actions — lands
      // together on the next line instead of the send button stranding on the
      // chip line. The send button follows the actions and is right-aligned.
      ".media-chip-row.has-trailing .media-chip-main": {
        minWidth: "100%"
      },
      ".media-chip-row.has-trailing .composer-workflow-actions": {
        flex: "0 0 auto",
        order: 1,
        marginLeft: "auto"
      },
      ".media-chip-row.has-trailing .media-primary-action": {
        order: 2
      }
    }
  });
