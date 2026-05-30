import { createTheme } from "@mui/material/styles";
import type {} from "@mui/material/themeCssVarsAugmentation";
import { paletteDark } from "./paletteDark";
import { paletteLight } from "./paletteLight";
import { editorControlsComponents } from "./components/editorControls";

import "@fontsource/inter";
import "@fontsource/inter/200.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";

import "@fontsource/jetbrains-mono/200.css";
import "@fontsource/jetbrains-mono/300.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";

// Theme augmentation moved to a single global file `theme.d.ts` to avoid duplication

const ThemeNodetool = createTheme({
  cssVariables: {
    cssVarPrefix: "",
    colorSchemeSelector: "class"
  },
  colorSchemes: {
    light: {
      palette: paletteLight
    },
    dark: {
      palette: paletteDark
    }
  },
  // Canonical sans type scale — only four sizes exist (18 / 15 / 13 / 11px).
  // Legacy token names are kept so existing references keep working, but they
  // now snap onto one of the four sanctioned sizes. See ui_primitives/tokens.ts
  // (TYPOGRAPHY) for the size+weight combinations.
  fontSizeGiant: "18px", // → title
  fontSizeBigger: "18px", // → title
  fontSizeBig: "18px", // → title
  fontSizeNormal: "15px", // → body
  fontSizeSmall: "13px", // → label
  fontSizeSmaller: "11px", // → caption
  fontSizeTiny: "11px", // → caption
  fontSizeTinyer: "11px", // → caption
  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', 'Inter', Arial, sans-serif",
  // Canonical border-radius tokens. Prefer these over hardcoded values.
  // Size scale (xs…xxl) for generic surfaces; semantic aliases below map to
  // concrete product concepts. Also exposed as `--rounded-<key>` CSS vars via
  // MuiCssBaseline so plain CSS files can reference them.
  rounded: {
    xs: "2px",
    sm: "4px",
    md: "6px",
    lg: "8px",
    xl: "12px",
    xxl: "16px",
    pill: "9999px",
    circle: "50%",
    dialog: "20px",
    node: "8px",
    buttonSmall: "4px",
    buttonLarge: "6px"
  },
  // Minimal editor-specific values. Keep this small; expand only when needed.
  // Applied only behind editor marker classes to avoid cross-screen leakage.
  editor: {
    heightNode: "28px",
    heightInspector: "32px",
    padXNode: "8px",
    padYNode: "4px",
    padXInspector: "10px",
    padYInspector: "6px",
    controlRadius: "6px",
    menuRadius: "8px",
    menuShadow: "0 10px 30px rgba(0, 0, 0, 0.5)"
  },
  // TanStack Virtual overscan — extra item/row count rendered outside the viewport.
  virtualScroll: {
    overscan: {
      small: 10,
      normal: 25,
      large: 50,
      gridRow: 4
    }
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 15
  },
  spacing: 4,
  shape: {
    borderRadius: 6
  },
  zIndex: {
    // MUI
    mobileStepper: 1000,
    fab: 1050,
    speedDial: 1050,
    appBar: 1100,
    drawer: 1200,
    modal: 1300,
    snackbar: 1400,
    tooltip: 1500,

    // Nodetool
    behind: -1,
    base: 0,
    commandMenu: 9999,
    popover: 10001,
    popover2: 99990,
    autocomplete: 10002,
    floating: 10003,
    highest: 100000
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        // Expose `theme.rounded.*` as `--rounded-*` CSS custom properties on
        // :root so plain CSS files (and raw style props) can reference them.
        ":root": {
          "--rounded-xs": theme.rounded.xs,
          "--rounded-sm": theme.rounded.sm,
          "--rounded-md": theme.rounded.md,
          "--rounded-lg": theme.rounded.lg,
          "--rounded-xl": theme.rounded.xl,
          "--rounded-xxl": theme.rounded.xxl,
          "--rounded-pill": theme.rounded.pill,
          "--rounded-circle": theme.rounded.circle,
          "--rounded-dialog": theme.rounded.dialog,
          "--rounded-node": theme.rounded.node,
          "--rounded-buttonSmall": theme.rounded.buttonSmall,
          "--rounded-buttonLarge": theme.rounded.buttonLarge
        }
      })
    },
    MuiTypography: {
      styleOverrides: {
        // Headings collapse onto two sanctioned sans combos: h1–h3 use the
        // `title` style (18px/600); h4–h6 use the `label` style (13px/500).
        // Hierarchy is conveyed by margin, letter-spacing, color and case —
        // not by introducing extra font sizes.
        h1: ({ theme }) => ({
          cursor: "default",
          fontSize: theme.fontSizeBig, // 18px — title
          fontWeight: 600,
          letterSpacing: "-0.02em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily1,
          lineHeight: 1.3
        }),
        h2: ({ theme }) => ({
          cursor: "default",
          fontSize: theme.fontSizeBig, // 18px — title
          fontWeight: 600,
          letterSpacing: "-0.015em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily1,
          lineHeight: 1.3
        }),
        h3: ({ theme }) => ({
          cursor: "default",
          fontSize: theme.fontSizeBig, // 18px — title
          fontWeight: 600,
          letterSpacing: "-0.01em",
          marginTop: theme.spacing(3),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily1,
          lineHeight: 1.3
        }),
        h4: ({ theme }) => ({
          cursor: "default",
          fontSize: theme.fontSizeSmall, // 13px — label
          fontWeight: 500,
          marginTop: theme.spacing(3),
          marginBottom: theme.spacing(1),
          fontFamily: theme.fontFamily1,
          color: theme.vars.palette.text.primary,
          lineHeight: 1.35,
          wordBreak: "break-word"
        }),
        h5: ({ theme }) => ({
          cursor: "default",
          fontSize: theme.fontSizeSmall, // 13px — label
          fontWeight: 500,
          letterSpacing: "0.02em",
          marginTop: theme.spacing(3),
          marginBottom: theme.spacing(1.5),
          fontFamily: theme.fontFamily1,
          color: theme.vars.palette.text.secondary,
          lineHeight: 1.35
        }),
        h6: ({ theme }) => ({
          cursor: "default",
          fontSize: theme.fontSizeSmall, // 13px — label
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          marginTop: theme.spacing(3),
          marginBottom: theme.spacing(1),
          fontFamily: theme.fontFamily1,
          color: theme.vars.palette.text.secondary
        }),
        body1: ({ theme }) => ({
          fontSize: theme.fontSizeNormal, // 15px — body
          fontFamily: theme.fontFamily1,
          fontWeight: 400,
          wordSpacing: "0",
          lineHeight: 1.45,
          marginTop: theme.spacing(0),
          marginBottom: theme.spacing(0)
        }),
        body2: ({ theme }) => ({
          fontSize: theme.fontSizeSmall, // 13px — label combo
          lineHeight: 1.4,
          fontWeight: 500,
          color: theme.vars.palette.text.secondary,
          fontFamily: theme.fontFamily1
        })
      }
    },
    MuiButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          minWidth: 36,
          textTransform: "none",
          fontWeight: 500,
          letterSpacing: "0.005em",
          borderRadius: theme.rounded.buttonLarge,
          boxShadow: "none",
          "&:hover": {
            boxShadow: "none"
          }
        })
      }
    },
    MuiFormLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: "capitalize",
          fontSize: theme.fontSizeSmall, // 13px — label
          fontWeight: 500,
          lineHeight: "1em",
          padding: theme.spacing(0, 0, 2, 0),
          color: theme.vars.palette.grey[0],
          "&.Mui-focused": {
            color: theme.vars.palette.primary.main
          }
        })
      }
    },
    MuiFormControl: {
      styleOverrides: {
        root: () => ({
          width: "100%"
        })
      }
    },
    MuiPopover: {
      styleOverrides: {
        root: ({ theme }) => ({ zIndex: theme.zIndex.popover2 })
      }
    },
    MuiModal: {
      styleOverrides: {
        root: ({ theme }) => ({ zIndex: theme.zIndex.modal })
      }
    },
    MuiToolbar: {
      styleOverrides: {
        dense: ({ theme }) => ({
          backgroundColor: theme.vars.palette.background.paper,
          height: "100%",
          display: "flex",
          justifyContent: "space-between"
        })
      }
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontFamily: theme.fontFamily1,
          fontSize: theme.fontSizeBig, // 18px — title
          fontWeight: 600,
          letterSpacing: "-0.01em"
        })
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: ({ theme }) => ({
          backgroundColor: "rgba(12, 13, 16, 0.96)",
          backdropFilter: "blur(8px)",
          border: `1px solid ${theme.vars.palette.divider}`,
          color: theme.vars.palette.text.primary,
          maxWidth: 300,
          fontSize: theme.fontSizeSmall, // 13px — label
          fontWeight: 500,
          borderRadius: theme.rounded.md,
          padding: theme.spacing(1.5, 2), // 6px / 8px
          boxShadow:
            "0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)"
        }),
        arrow: () => ({
          color: "rgba(12, 13, 16, 0.96)"
        })
      }
    },
    MuiDivider: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderColor: theme.vars.palette.divider
        })
      }
    },
    ...editorControlsComponents
  }
});

export default ThemeNodetool;
