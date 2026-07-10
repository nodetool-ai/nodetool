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
      // Align the text with the chip row below (card padding + row padding)
      // instead of floating it in its own 24px inset.
      padding: `${theme.spacing(1)} ${theme.spacing(2)}`,
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
      padding: `0 ${theme.spacing(2)}`,
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

    ".media-chip-spacer": {
      flex: 1
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

    // Send is the composer's primary action — give it the accent color when
    // enabled (the shared `:disabled` rule keeps it grey until there's input).
    ".media-generate-btn.chat-send": {
      width: 40,
      height: 40,
      padding: 0,
      borderRadius: BORDER_RADIUS.circle,
      background: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      boxShadow: "none",
      "& svg": {
        fontSize: 24
      },
      "&:hover:not(:disabled)": {
        background: theme.vars.palette.primary.light,
        transform: "none",
        boxShadow: "none"
      }
    },

    ".media-file-preview-row": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: `0 ${theme.spacing(2)}`,
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

    // Mobile: the chip cluster plus the trailing workflow actions never fit on
    // one phone-width line, so the row wraps (actions become their own line)
    // and the card sheds padding to keep the textarea full-width.
    [theme.breakpoints.down("sm")]: {
      ".media-compose-card": {
        padding: `${theme.spacing(1.5)} ${theme.spacing(1.5)} ${theme.spacing(1)}`,
        gap: theme.spacing(1)
      },
      ".media-compose-card textarea.media-compose-input": {
        padding: `${theme.spacing(1)} ${theme.spacing(1)}`
      },
      ".media-chip-row": {
        flexWrap: "wrap",
        rowGap: theme.spacing(1),
        padding: 0
      },
      // Full line for the chip cluster: without this it shrinks (min-width: 0)
      // to sit beside the action cluster instead of wrapping above it, leaving
      // the send button stranded mid-row.
      ".media-chip-main": {
        minWidth: "100%"
      },
      // The zero-basis spacer can land on the previous wrapped line, leaving
      // the send button left-aligned; margin-left keeps it pinned right on
      // whichever line it ends up on.
      ".media-chip-main .media-generate-btn": {
        marginLeft: "auto"
      }
    }
  });
