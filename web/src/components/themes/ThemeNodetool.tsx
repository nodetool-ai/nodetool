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
    fontSizeBigger: string;
    fontSizeBig: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller: string;
    fontSizeTiny: string;
    fontSizeTinyer: string;
    fontFamily1: string;
    fontFamily2: string;
  }
  interface Palette {
    [key: string]: string;
  }
}

declare module "@mui/material/styles" {
  interface Palette {
    /* General */
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
    /* Highlights */
    c_hl1?: string;
    c_hl1_1?: string;
    c_hl2?: string;
    c_selection?: string;
    c_input?: string;
    c_output?: string;
    /* Status */
    c_attention?: string;
    c_delete?: string;
    c_debug?: string;
    c_error?: string;
    c_info?: string;
    c_job?: string;
    c_node?: string;
    c_progress?: string;
    c_success?: string;
    c_warn?: string;
    c_warning?: string;
    /* Scrollbar*/
    c_scroll_bg?: string;
    c_scroll_hover?: string;
    c_scroll_thumb?: string;
  }
}

const ThemeNodetool: Theme = createTheme({
  fontSizeBigger: "1.25em", // 20px
  fontSizeBig: "1.125em", // 18px
  fontSizeNormal: "16px",
  fontSizeSmall: "0.875em", // 14px
  fontSizeSmaller: "0.75em", // 12px
  fontSizeTiny: "0.65em", // 10.4px
  fontSizeTinyer: "0.55em", // 8.8px

  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', 'Inter', Arial, sans-serif",

  palette: {
    /* General */
    c_black: "#020202",
    c_white: "#FCFCFC",
    c_gray0: "#0E0E0E",
    c_gray1: "#242424",
    c_gray2: "#444444",
    c_gray3: "#6D6D6D",
    c_gray4: "#959595",
    c_gray5: "#BDBDBD",
    c_gray6: "#D9D9D9",
    c_background: "#424854",
    c_node_menu: "#252525",
    /* Highlights */
    c_hl1: "#76e5b8",
    c_hl1_1: "#325954",
    c_hl2: "#128B6E",
    c_selection: "#8EACA777",
    c_input: "#374f4f",
    c_output: "#493f4d",

    /* Statuses */
    c_attention: "#E35BFF",
    c_delete: "#FF2222",
    c_debug: "#FF3355",
    c_error: "#FF5555",
    c_info: "#FFFFFF",
    c_job: "#223399",
    c_node: "#029486",
    c_progress: "#556611",
    c_success: "#50FA7B",
    c_warn: "#FFB86C",
    c_warning: "#FFB86C",
    /* Scrollbar*/
    c_scroll_bg: "#484848",
    c_scroll_hover: "#383838",
    c_scroll_thumb: "#2A2A2A",

    mode: "dark",
    primary: {
      main: "#76e5b8",
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

ThemeNodetool.components = {
  ...ThemeNodetool.components,
  MuiTypography: {
    styleOverrides: {
      h1: {
        cursor: "default",
        fontSize: "2em",
        marginTop: ThemeNodetool.spacing(4),
        marginBottom: ThemeNodetool.spacing(2),
        fontFamily: ThemeNodetool.fontFamily2,
        wordSpacing: "-3px",
      },
      h2: {
        cursor: "default",
        fontSize: "1.3em",
        marginTop: ThemeNodetool.spacing(4),
        marginBottom: ThemeNodetool.spacing(2),
      },
      h3: {
        cursor: "default",
        fontSize: "1.1em",
        marginTop: ThemeNodetool.spacing(4),
        marginBottom: ThemeNodetool.spacing(2),
        fontFamily: ThemeNodetool.fontFamily1,
      },
      h4: {
        cursor: "default",
        fontSize: "0.8em",
        marginTop: ThemeNodetool.spacing(2),
        marginBottom: ThemeNodetool.spacing(1),
        textTransform: "uppercase",
        fontWeight: 300,
        fontFamily: ThemeNodetool.fontFamily2,
        wordSpacing: "-3px",
        color: ThemeNodetool.palette.c_hl1,
        lineHeight: "1.1em",
        wordBreak: "break-word",
      },
      h5: {
        cursor: "default",
        fontSize: "0.8em",
        marginTop: ThemeNodetool.spacing(4),
        marginBottom: ThemeNodetool.spacing(2),
        textTransform: "uppercase",
        fontWeight: 600,
        fontFamily: ThemeNodetool.fontFamily2,
        wordSpacing: "-3px",
      },
      h6: {
        cursor: "default",
        fontSize: "0.8em",
        marginTop: ThemeNodetool.spacing(4),
        marginBottom: ThemeNodetool.spacing(2),
        textTransform: "uppercase",
        wordSpacing: "-.2em",
      },
      body1: {
        fontSize: "0.9em",
        fontFamily: ThemeNodetool.fontFamily1,
        fontWeight: 300,
        wordSpacing: "0",
        lineHeight: 1.2,
        marginTop: ThemeNodetool.spacing(0),
        marginBottom: ThemeNodetool.spacing(0),
      },
      body2: {
        fontSize: "0.8em",
        lineHeight: 1.1,
        fontFamily: ThemeNodetool.fontFamily2,
        wordSpacing: "-2px",
      },
    },
  },

  MuiButton: {
    styleOverrides: {
      root: {
        minWidth: 36,
      },
    },
  },

  MuiFormLabel: {
    styleOverrides: {
      root: {
        textTransform: "capitalize",
        fontSize: ThemeNodetool.fontSizeSmall,
        lineHeight: "1em",
        padding: ThemeNodetool.spacing(0, 0, 2, 0),
        color: ThemeNodetool.palette.c_hl1,
        "&.Mui-focused": {
          color: ThemeNodetool.palette.primary.main,
        },
      },
    },
  },

  MuiFormControl: {
    styleOverrides: {
      root: {
        margin: ThemeNodetool.spacing(0, 0, 5, 0),
        width: "100%",
      },
    },
  },
  MuiPopover: {
    styleOverrides: {
      root: { zIndex: 10000 },
    },
  },
  MuiModal: {
    styleOverrides: {
      root: { zIndex: 10000 },
    },
  },
  MuiToolbar: {
    styleOverrides: {
      dense: {
        backgroundColor: ThemeNodetool.palette.c_gray1,
        minHeight: "50px",
        height: "50px",
        display: "flex",
        justifyContent: "space-between",
      },
    },
  },

  // List
  // MuiList: {
  //   styleOverrides: {
  //     root: {
  //       paddingLeft: ThemeNodetool.spacing(1),
  //     },
  //   },
  // },
  // MuiListItem: {
  //   styleOverrides: {
  //     root: {
  //       paddingTop: ThemeNodetool.spacing(0.5),
  //       paddingBottom: ThemeNodetool.spacing(0.5),
  //       paddingLeft: ThemeNodetool.spacing(1),
  //       paddingRight: ThemeNodetool.spacing(1),
  //     },
  //   },
  // },
  // MuiListItemText: {
  //   styleOverrides: {
  //     root: {
  //       listStyleType: "square",
  //       margin: 0,
  //     },
  //     primary: {
  //       color: ThemeNodetool.palette.c_white,
  //     },
  //   },
  // },
  // MuiListItemIcon: {
  //   styleOverrides: {
  //     root: {
  //       minWidth: "20px",
  //       color: ThemeNodetool.palette.c_white,
  //     },
  //   },
  // },
};

export default ThemeNodetool;
