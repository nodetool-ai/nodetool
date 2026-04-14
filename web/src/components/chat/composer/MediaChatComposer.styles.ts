import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";

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
      padding: "14px 16px 12px",
      background: "rgba(20, 20, 20, 0.88)",
      backdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 10px 40px rgba(0,0,0,0.45)",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      transition: "border-color 180ms ease, box-shadow 180ms ease",
      "&:focus-within": {
        borderColor: "rgba(255,255,255,0.16)"
      },
      "&.dragging": {
        borderColor: theme.vars.palette.primary.main
      }
    },

    ".media-compose-card textarea.media-compose-input": {
      width: "100%",
      minHeight: 48,
      maxHeight: 220,
      padding: "4px 6px",
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
      gap: 4,
      width: "100%",
      flexWrap: "wrap"
    },

    ".media-chip-row .divider-dot": {
      width: 4,
      height: 4,
      borderRadius: "50%",
      background: theme.vars.palette.grey[700],
      margin: "0 2px"
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
      borderRadius: 999,
      background: "transparent",
      border: "none",
      color: theme.vars.palette.grey[300],
      cursor: "pointer",
      transition: "background-color 140ms ease",
      "&:hover:not(:disabled)": {
        backgroundColor: "rgba(255,255,255,0.08)"
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
      padding: "0 20px",
      borderRadius: 999,
      background: "linear-gradient(135deg, #4a7bff 0%, #6e64ff 100%)",
      color: "#ffffff",
      border: "none",
      cursor: "pointer",
      fontFamily: theme.fontFamily1,
      fontSize: 14,
      fontWeight: 600,
      letterSpacing: 0.25,
      transition: "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
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
      padding: "0 16px",
      "&:hover:not(:disabled)": {
        background: theme.vars.palette.grey[50]
      }
    },

    ".media-file-preview-row": {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  });
