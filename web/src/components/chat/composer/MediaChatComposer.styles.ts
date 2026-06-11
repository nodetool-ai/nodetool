import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { MOTION, BORDER_RADIUS } from "../../ui_primitives/tokens";

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
      borderRadius: 28,
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
          ? "0 1px 2px rgba(26,23,21,0.04), 0 8px 24px rgba(26,23,21,0.08)"
          : "0 10px 40px rgba(0,0,0,0.45)",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2),
      transition: `${MOTION.border}, ${MOTION.shadow}`,
      "&:focus-within": {
        borderColor:
          theme.palette.mode === "light"
            ? theme.vars.palette.grey[400]
            : theme.vars.palette.action.focus,
        boxShadow:
          theme.palette.mode === "light"
            ? "0 1px 2px rgba(26,23,21,0.05), 0 8px 24px rgba(26,23,21,0.10)"
            : "0 10px 40px rgba(0,0,0,0.45)"
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
      padding: theme.spacing(3),
      resize: "none",
      background: "transparent",
      color: theme.vars.palette.grey[50],
      border: "none",
      outline: "none",
      fontFamily: theme.fontFamily1,
      fontSize: 16,
      lineHeight: "24px",
      boxSizing: "border-box",
      display: "block",
      overflowY: "hidden",
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
      flexWrap: "wrap"
    },

    // Idle state: dim the border and footer controls while the composer is
    // unfocused, brightening them back on focus. The textarea stays full
    // opacity so the placeholder/prompt remains readable.
    ".media-compose-card.dimmed": {
      borderColor:
        theme.palette.mode === "light"
          ? theme.vars.palette.grey[800]
          : theme.vars.palette.grey[900]
    },
    ".media-compose-card.dimmed .media-chip-row": {
      opacity: 0.55
    },
    ".media-compose-card .media-chip-row": {
      transition: `opacity ${MOTION.normal}`
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
        backgroundColor: "rgba(255,255,255,0.10) !important",
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
      fontSize: 14,
      fontWeight: 600,
      letterSpacing: 0.25,
      transition: `${MOTION.transform}, ${MOTION.shadow}, ${MOTION.opacity}`,
      boxShadow: "0 4px 14px rgba(74, 123, 255, 0.35)",
      "&:hover:not(:disabled)": {
        transform: "translateY(-1px)",
        boxShadow: "0 6px 18px rgba(74, 123, 255, 0.45)"
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

    ".media-generate-btn.chat-send": {
      width: 44,
      height: 44,
      padding: 0,
      borderRadius: BORDER_RADIUS.circle,
      background: theme.vars.palette.grey[700],
      color: theme.vars.palette.grey[50],
      boxShadow: "none",
      "& svg": {
        fontSize: 26
      },
      "&:hover:not(:disabled)": {
        background: theme.vars.palette.grey[600]
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
        borderRadius: 4
      }
    }
  });
