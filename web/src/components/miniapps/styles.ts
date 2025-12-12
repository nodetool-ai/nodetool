import { css } from "@emotion/react";
import { Theme } from "@mui/material/styles";

export const createStyles = (theme: Theme) => {
  const doubledRadius =
    typeof theme.shape.borderRadius === "number"
      ? theme.shape.borderRadius * 2
      : 16;

  return css({
    position: "relative",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: theme.spacing(12, 18, 4),
    paddingTop: "60px",
    gap: theme.spacing(3),
    overflow: "hidden",
    width: "100%",

    ".glass-card": {
      position: "relative",
      borderRadius: doubledRadius,
      backdropFilter: "blur(12px)",
      backgroundColor: `color-mix(in srgb, ${theme.vars.palette.background.paper}, transparent 60%)`,
      boxShadow: theme.shadows[4],
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden"
    },

    ".hero": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(3),
      padding: theme.spacing(4),
      isolation: "isolate",

      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(2.5, 2, 2),
        gap: theme.spacing(2)
      }
    },

    ".hero::after": {
      content: "''",
      position: "absolute",
      inset: 0,
      borderRadius: "inherit",
      pointerEvents: "none",
      mixBlendMode: theme.palette.mode === "dark" ? "screen" : "multiply",
      opacity: 0.6
    },

    ".hero-copy": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1),

      [theme.breakpoints.down("sm")]: {
        gap: theme.spacing(0.75)
      }
    },

    ".hero-eyebrow": {
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem"
    },

    ".hero-subtitle": {
      padding: theme.spacing(0, 0, 2),
      color: theme.vars.palette.text.secondary,

      [theme.breakpoints.down("sm")]: {
        paddingBottom: theme.spacing(1.5)
      }
    },

    ".hero-controls": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(2),
      alignItems: "center",

      [theme.breakpoints.down("sm")]: {
        flexDirection: "column",
        alignItems: "stretch",
        gap: theme.spacing(1.5)
      }
    },

    ".hero-controls .MuiFormControl-root": {
      [theme.breakpoints.down("sm")]: {
        width: "100%"
      }
    },

    ".hero-status": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      flexWrap: "wrap",
      color: theme.vars.palette.text.secondary,

      [theme.breakpoints.down("sm")]: {
        alignItems: "stretch",
        flexDirection: "column",
        gap: theme.spacing(1.5)
      }
    },

    ".hero-status .MuiLinearProgress-root": {
      flex: 1,
      minWidth: 220,
      maxWidth: 320,
      height: 6,
      borderRadius: 99,
      [theme.breakpoints.down("sm")]: {
        minWidth: 0,
        width: "100%"
      }
    },

    ".hero-status .MuiLinearProgress-bar": {
      borderRadius: 99
    },

    ".alert-stack": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.5)
    },

    ".notifications": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1)
    },

    ".content-grid": {
      display: "grid",
      gap: theme.spacing(3),
      alignItems: "stretch",
      gridTemplateColumns: "minmax(0, 1fr)",
      minHeight: 0,
      position: "relative",
      zIndex: 1,

      [theme.breakpoints.up("lg")]: {
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2.25fr)"
      },

      [theme.breakpoints.down("sm")]: {
        gap: theme.spacing(2)
      }
    },

    ".results-shell": {
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(3),
      minHeight: 420,
      height: "100%",
      gap: theme.spacing(2),
      overflow: "hidden",

      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(2),
        minHeight: 320
      }
    },

    ".results-heading": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(1),

      [theme.breakpoints.down("sm")]: {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: theme.spacing(0.5)
      }
    },

    ".results-title": {
      fontWeight: 600
    },

    ".results-list": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2),
      overflowY: "auto",
      overflowX: "hidden",
      paddingRight: theme.spacing(0.75),
      paddingBottom: theme.spacing(1.5),
      minHeight: 0
    },

    "@keyframes resultCardEnter": {
      "0%": {
        opacity: 0,
        transform: "translateY(10px) scale(0.98)"
      },
      "100%": {
        opacity: 1,
        transform: "translateY(0) scale(1)"
      }
    },

    ".result-card": {
      borderRadius: doubledRadius,
      backgroundColor: theme.vars.palette.background.paper,
      padding: theme.spacing(2),
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.5),
      animation: "resultCardEnter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      opacity: 0
    },

    ".result-card-header": {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: theme.spacing(1)
    },

    ".result-card-body": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1),
      overflowX: "auto",
      position: "relative",

      // Fix text output styling - override the fixed height from OutputRenderer styles
      ".output.value": {
        height: "auto",
        minHeight: "auto",
        maxHeight: "none"
      },

      // Ensure text wraps properly
      ".no-markdown-text": {
        whiteSpace: "pre-wrap",
        wordBreak: "break-word"
      },

      // Hide copy button by default, show on hover
      ".result-card-copy-button": {
        opacity: 0,
        transition: "opacity 0.2s ease-in-out"
      },

      "&:hover .result-card-copy-button": {
        opacity: 1
      }
    },

    ".result-placeholder": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing(1.5),
      textAlign: "center",
      borderRadius: doubledRadius,
      color: theme.vars.palette.text.secondary,
      padding: theme.spacing(6),
      background: "transparent",

      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(4)
      }
    },

    ".inputs-card": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2.5),
      padding: theme.spacing(3),

      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(2),
        gap: theme.spacing(2)
      }
    },

    ".inputs-shell": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2)
    },

    ".input-field": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1),
      padding: theme.spacing(1.5),
      borderRadius: doubledRadius
    },

    ".input-field-header": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5)
    },

    ".input-field-control": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1)
    },

    ".image-input": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1)
    },

    ".boolean-input": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5)
    },

    ".image-input-actions": {
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(1)
    },

    ".composer-actions": {
      display: "flex",
      justifyContent: "flex-end",
      gap: theme.spacing(2),
      alignItems: "center",

      [theme.breakpoints.down("sm")]: {
        flexDirection: "column",
        alignItems: "stretch",
        gap: theme.spacing(1.5)
      }
    },

    ".generate-button": {
      padding: theme.spacing(1.25, 2.5),
      fontWeight: 600,

      [theme.breakpoints.down("sm")]: {
        width: "100%"
      }
    },

    ".refresh-button": {
      borderColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.main,

      [theme.breakpoints.down("sm")]: {
        alignSelf: "stretch"
      }
    },

    ".refresh-button:hover": {
      borderColor: theme.vars.palette.primary.light
    },

    ".empty-eyebrow": {
      fontWeight: 600,
      letterSpacing: "0.12em",
      textTransform: "uppercase"
    }
  });
};
