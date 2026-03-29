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
    width: "100%",
    overflowY: "auto",
    overflowX: "hidden",

    ".layout-container": {
      width: "100%",
      maxWidth: "1600px",
      margin: "0 auto",
      padding: theme.spacing(3, 4),
      paddingTop: "70px",
      paddingBottom: theme.spacing(6),
      paddingRight: theme.spacing(8), // Make room for the side panel toggle
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2.5),
      flex: 1,

      [theme.breakpoints.down("md")]: {
        padding: theme.spacing(2, 2.5),
        paddingTop: "65px",
        paddingBottom: theme.spacing(4),
        paddingRight: theme.spacing(2.5) // Reset right padding on smaller screens
      }
    },

    ".application-card": {
      position: "relative",
      borderRadius: doubledRadius,
      backgroundColor: theme.vars.palette.background.paper,
      overflow: "hidden"
    },

    // Header section
    ".page-header": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      paddingRight: theme.spacing(5),
      marginBottom: theme.spacing(1)
    },

    ".workflow-description": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary,
      maxWidth: "800px"
    },

    // Status bar
    ".status-bar": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      padding: theme.spacing(1.5, 2),
      borderRadius: doubledRadius,
      backgroundColor: `color-mix(in srgb, ${theme.vars.palette.primary.main}, transparent 92%)`,
      border: `1px solid ${theme.vars.palette.primary.main}25`,

      [theme.breakpoints.down("sm")]: {
        flexDirection: "column",
        alignItems: "stretch",
        gap: theme.spacing(1)
      }
    },

    ".status-bar-text": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      flex: 1
    },

    ".status-bar-progress": {
      flex: 1,
      maxWidth: "400px",

      [theme.breakpoints.down("sm")]: {
        maxWidth: "none"
      }
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
      gap: theme.spacing(2.5),
      alignItems: "stretch",
      gridTemplateColumns: "minmax(0, 1fr)",
      minHeight: 0,
      position: "relative",
      zIndex: 1,
      flex: 1,

      [theme.breakpoints.up("md")]: {
        gridTemplateColumns: "minmax(280px, 320px) minmax(0, 1fr)"
      },

      [theme.breakpoints.up("lg")]: {
        gridTemplateColumns: "minmax(300px, 360px) minmax(0, 1fr)"
      },

      [theme.breakpoints.down("sm")]: {
        gap: theme.spacing(2)
      }
    },

    ".results-shell": {
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(2),
      paddingBottom: theme.spacing(4),
      minHeight: "400px",
      height: "90%",
      gap: theme.spacing(1.5),
      overflow: "hidden",

      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(1.5),
        paddingBottom: theme.spacing(3),
        minHeight: "300px"
      }
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
      gap: theme.spacing(2),
      textAlign: "center",
      borderRadius: doubledRadius,
      color: theme.vars.palette.text.secondary,
      padding: theme.spacing(6),
      background: `linear-gradient(135deg, 
        ${theme.vars.palette.background.paper}00 0%, 
        ${theme.vars.palette.primary.main}08 50%,
        ${theme.vars.palette.background.paper}00 100%)`,
      minHeight: "300px",

      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(4),
        minHeight: "200px"
      }
    },

    ".result-placeholder-icon": {
      fontSize: "4rem",
      opacity: 0.4,
      marginBottom: theme.spacing(1)
    },

    ".result-placeholder-title": {
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },

    ".result-placeholder-subtitle": {
      maxWidth: "320px",
      lineHeight: 1.5
    },

    ".inputs-column": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2),
      position: "sticky",
      top: theme.spacing(2),
      maxHeight: "calc(100vh - 200px)",
      marginBottom: theme.spacing(4),
      alignSelf: "start",

      [theme.breakpoints.down("md")]: {
        position: "static",
        maxHeight: "none"
      }
    },

    ".inputs-card": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2),
      padding: theme.spacing(2.5),
      flex: "1 1 auto",
      minHeight: 0,
      overflow: "auto",

      [theme.breakpoints.down("sm")]: {
        padding: theme.spacing(2),
        gap: theme.spacing(1.5)
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
      flexDirection: "column",
      alignItems: "stretch",
      gap: theme.spacing(1)
    },

    ".generate-button": {
      padding: theme.spacing(1.25, 2.5),
      fontWeight: 500,

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
