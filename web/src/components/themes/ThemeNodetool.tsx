import { createTheme } from "@mui/material/styles";
import type {} from "@mui/material/themeCssVarsAugmentation";
import { paletteDark } from "./paletteDark";
import { paletteLight } from "./paletteLight";
import { paletteOcean } from "./paletteOcean";
import { paletteForest } from "./paletteForest";
import { paletteSunset } from "./paletteSunset";
import { paletteMidnight } from "./paletteMidnight";
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
    },
    ocean: {
      palette: paletteOcean
    },
    forest: {
      palette: paletteForest
    },
    sunset: {
      palette: paletteSunset
    },
    midnight: {
      palette: paletteMidnight
    }
  },
  fontSizeGiant: "2rem",
  fontSizeBigger: "1.25rem",
  fontSizeBig: "1.125rem",
  fontSizeNormal: "15px",
  fontSizeSmall: "0.875rem",
  fontSizeSmaller: "0.75rem",
  fontSizeTiny: "0.65rem",
  fontSizeTinyer: "0.55rem",
  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', 'Inter', Arial, sans-serif",
  rounded: {
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
  typography: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 15
  },
  spacing: 4,
  shape: {
    borderRadius: 4
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
    MuiTypography: {
      styleOverrides: {
        // root: {
        //   color: "var(--palette-text-primary)"
        // },
        h1: ({ theme }) => ({
          cursor: "default",
          fontSize: "2em",
          fontWeight: 400,
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily2,
          wordSpacing: "-3px"
        }),
        h2: ({ theme }) => ({
          cursor: "default",
          fontSize: "1.5em",
          fontWeight: 400,
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2)
        }),
        h3: ({ theme }) => ({
          cursor: "default",
          fontSize: "1.1em",
          fontWeight: 400,
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily1
        }),
        h4: ({ theme }) => ({
          cursor: "default",
          fontSize: "0.8em",
          fontWeight: 300,
          marginTop: theme.spacing(2),
          marginBottom: theme.spacing(1),
          textTransform: "uppercase",
          fontFamily: theme.fontFamily2,
          wordSpacing: "-3px",
          color: "var(--palette-primary-main)",
          lineHeight: "1.1em",
          wordBreak: "break-word"
        }),
        h5: ({ theme }) => ({
          cursor: "default",
          fontSize: "0.8em",
          fontWeight: 600,
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          textTransform: "uppercase",
          fontFamily: theme.fontFamily2,
          wordSpacing: "-3px"
        }),
        h6: ({ theme }) => ({
          cursor: "default",
          fontSize: "0.8em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          textTransform: "uppercase"
        }),
        body1: ({ theme }) => ({
          fontSize: "1em",
          fontFamily: theme.fontFamily1,
          fontWeight: 300,
          wordSpacing: "0",
          lineHeight: 1.2,
          marginTop: theme.spacing(0),
          marginBottom: theme.spacing(0)
        }),
        body2: ({ theme }) => ({
          fontSize: "1em",
          lineHeight: 1.2,
          color: theme.vars.palette.grey[0],
          fontFamily: theme.fontFamily1
        })
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minWidth: 36
        }
      }
    },
    MuiFormLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: "capitalize",
          fontSize: theme.fontSizeNormal,
          fontWeight: "lighter",
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
          backgroundColor: theme.vars.palette.grey[800],
          height: "100%",
          display: "flex",
          justifyContent: "space-between"
        })
      }
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontFamily: theme.fontFamily2,
          fontSize: theme.fontSizeBig
        })
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: ({ theme }) => ({
          backgroundColor: "rgba(10, 12, 16, 0.95)", // Very dark, slight transparency
          backdropFilter: "blur(8px)",
          border: `1px solid ${theme.vars.palette.grey[800]}`,
          color: theme.vars.palette.grey[50],
          maxWidth: 300,
          fontSize: theme.fontSizeSmall,
          borderRadius: "8px",
          padding: "8px 12px",
          boxShadow:
            "0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)"
        }),
        arrow: () => ({
          color: "rgba(10, 12, 16, 0.95)"
        })
      }
    },
    ...editorControlsComponents
  }
});

export default ThemeNodetool;
