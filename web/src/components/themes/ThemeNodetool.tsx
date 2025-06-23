import { Theme, createTheme, ThemeOptions } from "@mui/material/styles";
import type {} from "@mui/material/themeCssVarsAugmentation";
import { paletteDark } from "./paletteDark";
import { paletteLight } from "./paletteLight";

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

const ThemeNodetool: Theme = createTheme({
  defaultColorScheme: "dark",
  colorSchemes: {
    dark: {
      palette: paletteDark
    },
    light: {
      palette: paletteDark
    }
  },
  cssVariables: {
    colorSchemeSelector: "[data-mui-color-scheme]",
    cssVarPrefix: ""
  },
  fontSizeGiant: "2em",
  fontSizeBigger: "1.25em",
  fontSizeBig: "1.125em",
  fontSizeNormal: "16px",
  fontSizeSmall: "0.875em",
  fontSizeSmaller: "0.75em",
  fontSizeTiny: "0.65em",
  fontSizeTinyer: "0.55em",
  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', 'Inter', Arial, sans-serif",
  typography: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 14
  },
  spacing: 4,
  shape: {
    borderRadius: 4
  },
  components: {
    MuiTypography: {
      styleOverrides: {
        h1: ({ theme }) => ({
          cursor: "default",
          fontSize: "2em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily2,
          wordSpacing: "-3px"
        }),
        h2: ({ theme }) => ({
          cursor: "default",
          fontSize: "1.5em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2)
        }),
        h3: ({ theme }) => ({
          cursor: "default",
          fontSize: "1.1em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          fontFamily: theme.fontFamily1
        }),
        h4: ({ theme }) => ({
          cursor: "default",
          fontSize: "0.8em",
          marginTop: theme.spacing(2),
          marginBottom: theme.spacing(1),
          textTransform: "uppercase",
          fontWeight: 300,
          fontFamily: theme.fontFamily2,
          wordSpacing: "-3px",
          color: theme.palette.c_hl1,
          lineHeight: "1.1em",
          wordBreak: "break-word"
        }),
        h5: ({ theme }) => ({
          cursor: "default",
          fontSize: "0.8em",
          marginTop: theme.spacing(4),
          marginBottom: theme.spacing(2),
          textTransform: "uppercase",
          fontWeight: 600,
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
          color: theme.palette.c_white,
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
          color: theme.palette.c_white,
          "&.Mui-focused": {
            color: theme.palette.primary.main
          }
        })
      }
    },
    MuiFormControl: {
      styleOverrides: {
        root: ({ theme }) => ({
          margin: theme.spacing(0, 0, 5, 0),
          width: "100%"
        })
      }
    },
    MuiPopover: {
      styleOverrides: {
        root: { zIndex: 99999 }
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
          backgroundColor: theme.palette.c_gray1,
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
