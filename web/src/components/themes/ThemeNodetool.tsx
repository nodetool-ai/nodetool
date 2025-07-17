import { createTheme } from "@mui/material/styles";
import type {} from "@mui/material/themeCssVarsAugmentation";
import { paletteDark } from "./paletteDark";

import "@fontsource/inter";
import "@fontsource/inter/200.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";

import "@fontsource/jetbrains-mono/200.css";
import "@fontsource/jetbrains-mono/300.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";

declare module "@mui/system/createTheme" {
  interface ThemeOptions {
    fontSizeGiant?: string;
    fontSizeBigger?: string;
    fontSizeBig?: string;
    fontSizeNormal?: string;
    fontSizeSmall?: string;
    fontSizeSmaller?: string;
    fontSizeTiny?: string;
    fontSizeTinyer?: string;
    fontFamily1?: string;
    fontFamily2?: string;
  }
  interface Theme {
    fontSizeGiant: string;
    fontSizeBigger: string;
    fontSizeBig: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller?: string;
    fontSizeTiny?: string;
    fontSizeTinyer?: string;
    fontFamily1: string;
    fontFamily2: string;
  }
}

const ThemeNodetool = createTheme({
  defaultColorScheme: "dark",
  colorSchemes: {
    dark: {
      palette: paletteDark
    },
    light: {
      // ⚠️ dark mode does not get the correct css vars if this is set to paletteLigt
      palette: paletteDark
    }
  },
  cssVariables: {
    colorSchemeSelector: "[data-mui-color-scheme]",
    cssVarPrefix: ""
  },
  fontSizeGiant: "2rem",
  fontSizeBigger: "1.25rem",
  fontSizeBig: "1.125rem",
  fontSizeNormal: "15px",
  fontSizeSmall: "0.875rem",
  fontSizeSmaller: "0.75rem",
  fontSizeTiny: "0.675rem",
  fontSizeTinyer: "0.625rem",
  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', 'Inter', Arial, sans-serif",
  typography: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 15
  },
  spacing: 4,
  shape: {
    borderRadius: 4
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
          color: theme.palette.grey[0],
          fontFamily: theme.fontFamily1
        })
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minWidth: 24,
          lineHeight: "1.2em"
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
          color: theme.palette.grey[0],
          "&.Mui-focused": {
            color: theme.palette.primary.main
          }
        })
      }
    },
    MuiFormControl: {
      styleOverrides: {
        root: ({ theme }) => ({
          width: "100%"
        })
      }
    },
    MuiPopover: {
      styleOverrides: {
        root: { zIndex: 99990 }
      }
    },
    MuiModal: {
      styleOverrides: {
        root: { zIndex: 10000 }
      }
    },
    MuiToolbar: {
      styleOverrides: {
        dense: ({ theme }) => ({
          backgroundColor: theme.palette.grey[800],
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
    }
  }
});

export default ThemeNodetool;
