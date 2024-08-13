import { Theme, createTheme } from "@mui/material/styles";

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
    fontSizeBig?: string;
    fontSizeBigger?: string;
    fontSizeNormal?: string;
    fontSizeSmall?: string;
    fontSizeSmaller?: string;
    fontSizeTiny?: string;
    fontSizeTinyer?: string;
    fontFamily1?: string;
    fontFamily2?: string;
  }
  interface Theme {
    fontSizeBig: string;
    fontSizeBigger: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller: string;
    fontSizeTiny: string;
    fontSizeTinyer: string;
    fontFamily1: string;
    fontFamily2: string;
  }
}

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
    c_selection?: string;
    c_input?: string;
    c_output?: string;

    c_success?: string;
    c_attention?: string;
    c_warning?: string;
    c_error?: string;
    c_delete?: string;
    c_node_bg?: string;
    c_node_bg_group?: string;
    c_node_header_bg?: string;
    c_node_header_bg_group?: string;
    c_bg_loop?: string;
  }
}

const ThemeNodes: Theme = createTheme({
  fontSizeBigger: "1.25em", // 15px
  fontSizeBig: "1.125em", // 13.5px
  fontSizeNormal: "12px", // 12px
  fontSizeSmall: "0.875em", // 10.5px
  fontSizeSmaller: "0.75em", // 9px
  fontSizeTiny: "0.65em", // 7.8px
  fontSizeTinyer: "0.55em", // 6.6px
  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', 'Inter', Arial, sans-serif",
  palette: {
    c_black: "#000000",
    c_white: "#ffffff",
    c_gray0: "#0E0E0E",
    c_gray1: "#282828",
    c_gray2: "#444444",
    c_gray3: "#6d6d6d",
    c_gray4: "#959595",
    c_gray5: "#bdbdbd",
    c_gray6: "#d9d9d9",
    c_background: "#424854",
    c_node_menu: "#252525",
    c_hl1: "#76e5b8",
    c_hl1_1: "#bdf0e9",
    c_hl2: "#1ec7c7",
    c_selection: "#8EACA777",
    c_input: "#374f4f",
    c_output: "#493f4d",

    c_success: "#50fa7b",
    c_attention: "#e35bff",
    c_warning: "#ffb86c",
    c_error: "#ff5555",
    c_delete: "#ff2222",
    c_node_bg: "#2b2e31",
    c_node_bg_group: "#3c4044",
    c_node_header_bg: "#202020",
    c_node_header_bg_group: "#333333",
    c_bg_loop: "#5661875e",

    mode: "dark",
    primary: {
      main: "#424242",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#757575",
      contrastText: "#FFFFFF",
    },
    tertiary: {
      light: "#a7d0c3",
      main: "#68a89a",
      dark: "#387c6d",
      contrastText: "#fff",
    },
    background: {
      default: "#202020",
      paper: "#252525",
    },
  } as any,
  typography: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 15,
  },
  spacing: 4,
  shape: {
    borderRadius: 4,
  },
});

ThemeNodes.components = {
  ...ThemeNodes.components,
  MuiButton: {
    styleOverrides: {
      root: {
        minWidth: 36,
      },
      sizeSmall: {
        margin: "2px",
        padding: "2px 6px",
        height: "15px",
        fontSize: ThemeNodes.fontSizeSmall,
        minWidth: "20px",
        backgroundColor: "#333",
        wordSpacing: "-2px",

        "&:hover": {
          backgroundColor: ThemeNodes.palette.c_gray3,
        },
      },
    },
    variants: [
      {
        props: { variant: "medium" },
        style: {
          padding: "0.2em 0.4em",
          lineHeight: "1.1em",
        },
      },
    ],
  },

  MuiTypography: {
    styleOverrides: {
      caption: {
        display: "block",
        fontSize: ".55em",
        fontFamily: ThemeNodes.fontFamily1,
        marginTop: "-0.5em",
      },
      h1: {
        fontSize: "2em",
        marginTop: ThemeNodes.spacing(4),
        marginBottom: ThemeNodes.spacing(2),
        wordSpacing: "-3px",
      },
      h2: {
        fontSize: "1.75em",
        marginTop: ThemeNodes.spacing(4),
        marginBottom: ThemeNodes.spacing(2),
        wordSpacing: "-3px",
      },
      h3: {
        fontSize: "1.5em",
        marginTop: ThemeNodes.spacing(4),
        marginBottom: ThemeNodes.spacing(2),
        wordSpacing: "-3px",
      },
      h4: {
        fontSize: "1.25em",
        marginTop: ThemeNodes.spacing(4),
        marginBottom: ThemeNodes.spacing(2),
        textTransform: "uppercase",
        fontWeight: 300,
        wordSpacing: "-3px",
      },
      h5: {
        fontSize: "0.8em",
        marginTop: ThemeNodes.spacing(4),
        marginBottom: ThemeNodes.spacing(2),
        textTransform: "uppercase",
        fontWeight: 600,
        wordSpacing: "-3px",
      },
      h6: {
        fontSize: "0.8em",
        marginTop: ThemeNodes.spacing(4),
        marginBottom: ThemeNodes.spacing(2),
        textTransform: "uppercase",
        wordSpacing: "-3px",
      },
      body1: {
        fontSize: "0.8em",
        fontFamily: ThemeNodes.fontFamily1,
        fontWeight: 300,
        wordSpacing: "0",
        lineHeight: 1.1,
        marginTop: ThemeNodes.spacing(0),
        marginBottom: ThemeNodes.spacing(0),
      },
      body2: {
        fontSize: "0.8em",
        lineHeight: 1.1,
        wordSpacing: "-2px",
      },
    },
  },

  MuiInputBase: {
    styleOverrides: {
      root: {
        fontSize: ThemeNodes.fontSizeNormal,
        lineHeight: "1.1em",
        margin: 0,
        marginTop: "0 !important",
        marginBottom: "0 !important",
        padding: "0",
        width: "100%",
        maxWidth: "300px",
        "&::placeholder": {
          opacity: 0,
          visibility: "hidden",
        },
        "&.MuiInput-root:hover:not(&.Mui-disabled, &.Mui-error)::before": {
          border: "0",
        },
      },
      inputMultiline: {
        margin: "5px 0",
        padding: "2px 8px 0px 4px !important",
        backgroundColor: "#4b4b4b",
        resize: "vertical",
      },
      input: {
        margin: ThemeNodes.spacing(0.5, 0),
        marginTop: ThemeNodes.spacing(0.5),
        padding: "0px",
        maxHeight: "40em",
        minHeight: "1.22em",
      },
    },
  },
  // TEXT FIELD
  MuiTextField: {
    styleOverrides: {
      root: {
        fontFamily: ThemeNodes.fontFamily1,
        fontSize: ThemeNodes.fontSizeSmall,
        lineHeight: "1.0em",
        backgroundColor: "transparent",
        minHeight: "15px",
        margin: "0",
        padding: ".5em .5em .5em .2em",
        resize: "vertical",

        "& .MuiInput-underline:before": {
          borderBottom: "0",
        },
        "& .MuiInput-underline:after": {
          borderBottom: "0",
        },
        // TEXTAREA
        "& .MuiInputBase-inputMultiline": {
          fontFamily: ThemeNodes.fontFamily1,
          fontSize: ThemeNodes.fontSizeSmaller,
          lineHeight: "1.1em",
          cursor: "auto",
        },
        "& .MuiInputBase-inputMultiline.edit-value": {
          fontFamily: ThemeNodes.fontFamily1,
        },
        // hide legend
        "& .MuiOutlinedInput-notchedOutline legend": {
          display: "none",
        },
      },
    },
  },

  MuiLink: {
    styleOverrides: {
      root: {
        marginLeft: "0.6em !important",
        marginRight: "0.6em !important",
      },
    },
  },

  MuiInputLabel: {
    styleOverrides: {
      root: {
        position: "relative",
        marginBottom: "-3px",
        letterSpacing: "-.02em",
        wordSpacing: "-.05em",
        transform: "translate(0px, 0px) scale(1.0)",
        textTransform: "capitalize",
        transformOrigin: "top left",
        fontFamily: ThemeNodes.fontFamily1,
        fontSize: ThemeNodes.fontSizeSmall,
        lineHeight: "1em",
        minHeight: "1.2em",
        margin: " 0",
        "&.Mui-focused": {
          color: ThemeNodes.palette.c_white,
        },
      },
    },
  },
  MuiFormControl: {
    styleOverrides: {
      root: {
        margin: 0,
        display: "block",
        width: "100%",
        fontSize: ThemeNodes.fontSizeSmall,
      },
    },
  },

  MuiFormControlLabel: {
    styleOverrides: {
      root: {
        width: "100%",
      },
    },
  },

  MuiButtonBase: {
    styleOverrides: {
      root: {
        padding: ThemeNodes.spacing(1),
        marginRight: ThemeNodes.spacing(1),
        marginBottom: ThemeNodes.spacing(1),
      },
    },
  },

  MuiSwitch: {
    styleOverrides: {
      root: {
        margin: "0",
        padding: "0",
        width: "2.4em",
        height: "1em",
        overflow: "visible",
      },
      thumb: {
        width: "1em !important",
        height: "1em !important",
        borderRadius: "0.25em",
        margin: "0",
        padding: "0",
      },
      track: {
        borderRadius: ".25em",
      },
      switchBase: {
        margin: "0",
        padding: "0 !important",
        color: ThemeNodes.palette.c_gray4,
        "&.Mui-checked": {
          color: ThemeNodes.palette.c_hl1,
        },
        "&.Mui-checked + .MuiSwitch-track": {
          backgroundColor: ThemeNodes.palette.c_gray6,
        },
      },
    },
  },
  MuiMenuItem: {
    styleOverrides: {
      root: {
        fontFamily: ThemeNodes.fontFamily1,
        backgroundColor: "#333",
        marginBottom: "0px",
        "&:nth-of-type(odd)": {
          backgroundColor: "#363636",
          "&:hover": {
            backgroundColor: "#444",
          },
          "&:selected": {
            backgroundColor: "#333",
          },
        },
        "&.Mui-hover": {
          color: ThemeNodes.palette.c_hl1_1,
          backgroundColor: "#444",
        },
        "&.Mui-selected": {
          color: ThemeNodes.palette.c_hl1,
          backgroundColor: "#333",
        },
      },
    },
  },
  MuiCheckbox: {
    styleOverrides: {
      root: {
        padding: "0px 4px",
        color: ThemeNodes.palette.text.secondary,
        "&.Mui-checked": {
          color: ThemeNodes.palette.primary.main,
        },
      },
    },
  },
  MuiSelect: {
    styleOverrides: {
      root: { width: "100%" },
      select: {
        width: "100%",
        padding: "0 0 0 .4em",
        fontFamily: ThemeNodes.fontFamily1,
        fontSize: ThemeNodes.fontSizeSmaller,
        backgroundColor: ThemeNodes.palette.c_gray2,
        margin: "0",
      },
      icon: {
        color: ThemeNodes.palette.c_white,
        width: ".5em",
        height: "1em",
        fontSize: "3em",
      },
      filled: {},
      outlined: {},
    },
  },
  MuiRadio: {
    styleOverrides: {
      root: {
        color: ThemeNodes.palette.text.secondary,
        "&.Mui-checked": {
          color: ThemeNodes.palette.primary.main,
        },
      },
    },
  },
  MuiFab: {
    styleOverrides: {
      root: {
        margin: ThemeNodes.spacing(4, 4),
      },
    },
  },
  MuiSnackbar: {
    styleOverrides: {
      root: {
        fontSize: ThemeNodes.fontSizeSmall,
        padding: "4px",
      },
      anchorOriginTopRight: {},
    },
  },

  MuiSnackbarContent: {
    styleOverrides: {
      root: {
        padding: "5px",
        margin: "5px",
        fontSize: ThemeNodes.fontSizeSmaller,
        border: " 1px dashed #333",
        backgroundColor: "#333",
        color: "#eee",
        cursor: "default",
        userSelect: "text",
      },
    },
  },

  MuiToggleButton: {
    styleOverrides: {
      root: {
        fontFamily: ThemeNodes.fontFamily2,
        "&.MuiToggleButton-sizeSmall.Mui-selected": {
          color: ThemeNodes.palette.c_white,
          backgroundColor: ThemeNodes.palette.c_gray1,
        },
        "&.MuiToggleButton-sizeSmall": {
          fontSize: "12px",
          color: ThemeNodes.palette.c_gray4,
          padding: "0 4px",
          margin: 0,
          border: 0,
        },
      },
    },
  },
  MuiBackdrop: {
    styleOverrides: {
      root: {
        backgroundColor: "rgba(25, 25, 25, 0.1)",
      },
    },
  },
  MuiToggleButtonGroup: {
    styleOverrides: {
      root: {
        marginLeft: "10px",
      },
    },
  },
  MuiPopover: {
    styleOverrides: {
      root: { zIndex: 10000 },
    },
  },
  MuiTabs: {
    styleOverrides: {
      flexContainer: {
        alignItems: "flex-start",
      },
    },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        alignItems: "flex-start",
      },
    },
  },
};
export default ThemeNodes;
