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
      borderRadius: 22,
      padding: `${theme.spacing(1.75)} ${theme.spacing(2)} ${theme.spacing(1.5)}`,
      background: theme.vars.palette.background.paper,
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
      gap: theme.spacing(1.25),
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
      minHeight: 48,
      maxHeight: 220,
      padding: `${theme.spacing(0.5)} ${theme.spacing(0.75)}`,
      margin: 0,
      resize: "none",
      background: "transparent",
      color: theme.vars.palette.grey[50],
      border: "none",
      outline: "none",
      fontFamily: theme.fontFamily1,
      fontSize: 16,
      lineHeight: "24px",
      boxSizing: "border-box",
      overflowY: "hidden",
      "&::placeholder": {
        color: theme.vars.palette.grey[500],
        fontStyle: "normal"
      }
    },

    ".media-chip-row": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      width: "100%",
      flexWrap: "wrap"
    },

    ".media-chip-row .divider-dot": {
      width: 4,
      height: 4,
      borderRadius: BORDER_RADIUS.circle,
      background: theme.vars.palette.grey[700],
      margin: `0 ${theme.spacing(0.25)}`
    },

    ".media-chip-spacer": {
      flex: 1
    },

    ".media-retake-btn": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 32,
      height: 32,
      borderRadius: BORDER_RADIUS.pill,
      background: "transparent",
      border: "none",
      color: theme.vars.palette.grey[300],
      cursor: "pointer",
      transition: MOTION.background,
      "&:hover:not(:disabled)": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:disabled": {
        opacity: 0.4,
        cursor: "not-allowed"
      },
      "& svg": { fontSize: 18 }
    },

    ".media-generate-btn": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height: 36,
      padding: `0 ${theme.spacing(2.5)}`,
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
      background: theme.vars.palette.grey[100],
      color: theme.vars.palette.grey[900],
      boxShadow: "none",
      padding: `0 ${theme.spacing(2)}`,
      "&:hover:not(:disabled)": {
        background: theme.vars.palette.grey[50]
      }
    },

    ".media-file-preview-row": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(0.75)
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
