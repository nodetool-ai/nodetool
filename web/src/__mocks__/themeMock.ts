import { createTheme } from "@mui/material/styles";

// Create a simple mock theme for testing
const mockTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#77b4e6"
    },
    background: {
      default: "#202020",
      paper: "#232323"
    },
    text: {
      primary: "#fff"
    },
    // Add the custom palette properties
    c_hl1: "#77b4e6",
    c_white: "#FCFCFC",
    c_gray1: "#242424",
    c_gray2: "#444444",
    c_gray3: "#6D6D6D",
    c_gray4: "#959595",
    c_gray5: "#BDBDBD",
    c_gray6: "#D9D9D9"
  } as any, // Use 'as any' to bypass TypeScript checking for custom properties
  fontSizeNormal: "16px",
  fontSizeSmall: "0.875em",
  fontSizeSmaller: "0.75em",
  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', 'Inter', Arial, sans-serif"
});

// Add vars property directly to the theme object
(mockTheme as any).vars = {
  palette: {
    grey: {
      0: "#000000",
      50: "#fafafa",
      100: "#f5f5f5",
      200: "#eeeeee",
      300: "#e0e0e0",
      400: "#bdbdbd",
      500: "#9e9e9e",
      600: "#757575",
      700: "#616161",
      800: "#424242",
      900: "#212121",
      1000: "#ffffff"
    },
    // Add missing palette properties used by components
    primary: { main: "#77b4e6", dark: "#5a9ace", light: "#9ccce8" },
    secondary: { main: "#9c27b0" },
    info: { main: "#2196f3" },
    error: { main: "#f44336" },
    warning: { main: "#ff9800" },
    success: { main: "#4caf50" },
    divider: "#2f2f2f",
    action: {
      hover: "rgba(255,255,255,0.08)",
      selected: "rgba(255,255,255,0.16)",
      disabled: "rgba(255,255,255,0.3)",
      disabledBackground: "rgba(255,255,255,0.12)",
      active: "rgba(255,255,255,0.54)"
    },
    text: {
      primary: "#ffffff",
      secondary: "#bdbdbd",
      disabled: "#9e9e9e"
    },
    Paper: {
      paper: "#232323"
    },
    background: {
      default: "#202020",
      paper: "#232323"
    },
    c_link: "#77b4e6",
    c_link_visited: "#5a9ace",
    common: {
      white: "#ffffff",
      black: "#000000"
    },
    primaryChannel: "119 180 230",
    secondaryChannel: "156 39 176",
    infoChannel: "33 150 243",
    errorChannel: "244 67 54",
    warningChannel: "255 152 0",
    successChannel: "76 175 80",
    greyChannel: "158 158 158",
    textChannel: "255 255 255",
    dividerChannel: "47 47 47",
    backgroundDefaultChannel: "32 32 32",
    backgroundPaperChannel: "35 35 35",
    Alert: {
      primaryColor: "#77b4e6",
      primaryIconColor: "#77b4e6",
      primaryStandardBg: "rgba(119, 180, 230, 0.1)",
      primaryStandardBgHover: "rgba(119, 180, 230, 0.2)",
      primaryOutlinedBg: "transparent",
      primaryOutlinedBorder: "rgba(119, 180, 230, 0.5)",
      primaryTextColor: "#77b4e6",
      secondaryColor: "#9c27b0",
      secondaryIconColor: "#9c27b0",
      secondaryStandardBg: "rgba(156, 39, 176, 0.1)",
      secondaryStandardBgHover: "rgba(156, 39, 176, 0.2)",
      secondaryOutlinedBg: "transparent",
      secondaryOutlinedBorder: "rgba(156, 39, 176, 0.5)",
      secondaryTextColor: "#9c27b0",
      errorColor: "#f44336",
      errorIconColor: "#f44336",
      errorStandardBg: "rgba(244, 67, 54, 0.1)",
      errorStandardBgHover: "rgba(244, 67, 54, 0.2)",
      errorOutlinedBg: "transparent",
      errorOutlinedBorder: "rgba(244, 67, 54, 0.5)",
      errorTextColor: "#f44336",
      infoColor: "#2196f3",
      infoIconColor: "#2196f3",
      infoStandardBg: "rgba(33, 150, 243, 0.1)",
      infoStandardBgHover: "rgba(33, 150, 243, 0.2)",
      infoOutlinedBg: "transparent",
      infoOutlinedBorder: "rgba(33, 150, 243, 0.5)",
      infoTextColor: "#2196f3",
      successColor: "#4caf50",
      successIconColor: "#4caf50",
      successStandardBg: "rgba(76, 175, 80, 0.1)",
      successStandardBgHover: "rgba(76, 175, 80, 0.2)",
      successOutlinedBg: "transparent",
      successOutlinedBorder: "rgba(76, 175, 80, 0.5)",
      successTextColor: "#4caf50",
      warningColor: "#ff9800",
      warningIconColor: "#ff9800",
      warningStandardBg: "rgba(255, 152, 0, 0.1)",
      warningStandardBgHover: "rgba(255, 152, 0, 0.2)",
      warningOutlinedBg: "transparent",
      warningOutlinedBorder: "rgba(255, 152, 0, 0.5)",
      warningTextColor: "#ff9800"
    },
    glass: {
      blur: "blur(12px)"
    },
    Button: {
      inheritContainedBg: "rgba(255, 255, 255, 0.08)",
      inheritContainedHoverBg: "rgba(255, 255, 255, 0.12)"
    }
  },
  spacing: (factor: number) => `${factor * 8}px`,
  shadows: [
    "none",
    "0px 2px 1px -1px rgba(0,0,0,0.2),0px 1px 1px 0px rgba(0,0,0,0.14),0px 1px 3px 0px rgba(0,0,0,0.12)",
    "0px 3px 1px -2px rgba(0,0,0,0.2),0px 2px 2px 0px rgba(0,0,0,0.14),0px 1px 5px 0px rgba(0,0,0,0.12)",
    "0px 3px 3px -2px rgba(0,0,0,0.2),0px 3px 4px 0px rgba(0,0,0,0.14),0px 1px 8px 0px rgba(0,0,0,0.12)",
    "0px 2px 4px -1px rgba(0,0,0,0.2),0px 4px 5px 0px rgba(0,0,0,0.14),0px 1px 10px 0px rgba(0,0,0,0.12)",
    ...Array(20).fill("none")
  ]
};

// Add tooltip property to theme
(mockTheme as any).tooltip = {};
(mockTheme as any).vars.tooltip = {};

// Add zIndex for MUI components
(mockTheme as any).zIndex = {
  mobileStepper: 1000,
  fab: 1050,
  speedDial: 1050,
  appBar: 1100,
  drawer: 1200,
  modal: 1300,
  snackbar: 1400,
  tooltip: 1500
};
(mockTheme as any).vars.zIndex = {
  mobileStepper: 1000,
  fab: 1050,
  speedDial: 1050,
  appBar: 1100,
  drawer: 1200,
  modal: 1300,
  snackbar: 1400,
  tooltip: 1500
};

// Add avatar properties for MUI Chip component
(mockTheme as any).vars.avatar = {
  defaultColor: "#9e9e9e",
  defaultAvatarColor: "#9e9e9e"
};
(mockTheme as any).avatar = {
  defaultColor: "#9e9e9e",
  defaultAvatarColor: "#9e9e9e"
};

// Add chip properties for MUI Chip component
(mockTheme as any).vars.chip = {
  defaultColor: "#616161"
};
(mockTheme as any).chip = {
  defaultColor: "#616161"
};

// Add Switch properties for MUI Switch component
(mockTheme as any).vars.Switch = {
  defaultColor: "#9e9e9e"
};
(mockTheme as any).Switch = {
  defaultColor: "#9e9e9e"
};

// Ensure components overrides exist for MUI that reference theme.components
(mockTheme as any).components = {
  ...((mockTheme as any).components || {}),
  MuiTooltip: {
    styleOverrides: {
      tooltip: {}
    }
  },
  MuiChip: {
    styleOverrides: {
      root: {},
      filled: {},
      outlined: {}
    }
  }
};

// Ensure theme shape matches MUI v7 expectations without forcing internal flags
(mockTheme as any).shape = {
  borderRadius: 4
};
(mockTheme as any).vars.shape = {
  borderRadius: 4
};

export default mockTheme;
