import { createTheme, Theme } from "@mui/material/styles";

import "@fontsource/inter";
import "@fontsource/inter/200.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";

import "@fontsource/jetbrains-mono/200.css";
import "@fontsource/jetbrains-mono/300.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";

declare module "@mui/material/styles" {
  interface Palette {
    c_black?: string;
    c_white?: string;
    c_gray0?: string;
    c_gray1?: string;
    c_gray2?: string;
    c_gray3?: string;
    c_gray4?: string;
    c_gray5?: string;
    c_gray6?: string;
    c_background?: string;
    c_node_menu?: string;
    c_hl1?: string;
    c_hl1_1?: string;
    c_hl2?: string;
    c_success?: string;
    c_attention?: string;
    c_warning?: string;
    c_error?: string;
  }
}

const ThemeBasic: Theme = createTheme({
  fontSizeSmall: "12px",
  fontSizeSmaller: "10px",
  fontFamily1: "'Inter', sans-serif",
  fontFamily2: "'JetBrains Mono', sans-serif",
  palette: {
    c_black: "#000000",
    c_white: "#ffffff",
    c_gray0: "#0E0E0E",
    c_gray1: "242424",
    c_gray2: "#444444",
    c_gray3: "#6d6d6d",
    c_gray4: "#959595",
    c_gray5: "#bdbdbd",
    c_gray6: "#d9d9d9",
    c_background: "#424854",
    c_node_menu: "#252525",
    c_hl1: "#76e5b8",
    c_hl1_1: "#325954",
    c_hl2: "#5c6753",
    c_success: "#50fa7b",
    c_attention: "#e35bff",
    c_warning: "#ffb86c",
    c_error: "#ff5555",

    mode: "dark",
    primary: {
      //main: "#424242",
      main: "#76e5b8",
      contrastText: "#FFFFFF"
    },
    secondary: {
      main: "#757575",
      contrastText: "#FFFFFF"
    },
    tertiary: {
      light: "#a7d0c3",
      main: "#68a89a",
      dark: "#387c6d",
      contrastText: "#fff"
    },
    background: {
      default: "#202020",
      paper: "#252525"
    }
  } as any,
  typography: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 15
  },
  spacing: 4,
  shape: {
    borderRadius: 4
  }
});

ThemeBasic.components = {
  ...ThemeBasic.components,
  MuiButton: {
    styleOverrides: {
      root: {
        minWidth: 36
        //display: "block",
      },
      sizeSmall: {
        margin: "2px",
        padding: "2px 6px",
        height: "15px",
        fontSize: ThemeBasic.fontSizeSmall,
        minWidth: "20px",
        backgroundColor: "#333"
      }
    }
  },
  MuiTypography: {
    styleOverrides: {
      h1: {
        fontSize: "2em",
        marginTop: ThemeBasic.spacing(8),
        marginBottom: ThemeBasic.spacing(2)
      },
      h2: {
        fontSize: "1.75em",
        marginTop: ThemeBasic.spacing(8),
        marginBottom: ThemeBasic.spacing(2)
      },
      h3: {
        fontSize: "1.5em",
        marginTop: ThemeBasic.spacing(8),
        marginBottom: ThemeBasic.spacing(2)
      },
      h4: {
        fontSize: "1.25em",
        marginTop: ThemeBasic.spacing(8),
        marginBottom: ThemeBasic.spacing(2),
        textTransform: "uppercase",
        fontWeight: 300,
        fontFamily: ThemeBasic.fontFamily2,
        wordSpacing: "-4px"
      },
      h5: {
        fontSize: "0.8em",
        marginTop: ThemeBasic.spacing(8),
        marginBottom: ThemeBasic.spacing(2),
        textTransform: "uppercase",
        fontWeight: 600,
        fontFamily: ThemeBasic.fontFamily2,
        wordSpacing: "-2px"
      },
      h6: {
        fontSize: "0.8em",
        marginTop: ThemeBasic.spacing(8),
        marginBottom: ThemeBasic.spacing(2),
        textTransform: "uppercase",
        fontFamily: ThemeBasic.fontFamily2,
        wordSpacing: "-2px"
      },
      body1: {
        fontSize: "1em",
        lineHeight: 1.3,
        marginTop: ThemeBasic.spacing(0),
        marginBottom: ThemeBasic.spacing(0)
      },
      body2: {
        fontSize: "0.8em",
        lineHeight: 1.1
      }
    }
  },
  MuiSlider: {
    styleOverrides: {
      root: {
        marginTop: "3px"
      },
      rail: {
        backgroundColor: ThemeBasic.palette.c_gray3,
        borderRadius: "0px",
        height: "5px"
      },
      track: {
        height: "15px",
        opacity: "1",
        left: "0",
        borderRadius: "0px"
      },
      thumb: {
        backgroundColor: ThemeBasic.palette.c_hl1,
        boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)",
        borderRadius: 0,
        width: 8,
        height: 8,
        "&:hover, &:focus, &:active": {
          boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)",
          backgroundColor: "#666"
        },
        "&.Mui-focusVisible": {
          boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)"
        },
        "&.Mui-active": {
          boxShadow: "0px 0px 5px 1px rgba(0, 0, 0, 0.25)"
        },
        "::before": {
          width: "12px",
          height: "12px"
        },
        "::after": {
          width: "12px",
          height: "12px"
        }
      }
    }
  }
};

export default ThemeBasic;
