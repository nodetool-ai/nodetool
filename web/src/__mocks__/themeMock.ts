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
    primary: { main: "#77b4e6", dark: "#5a9ace" },
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
    // Provide text palette when MUI Typography reads from theme.vars
    text: {
      primary: "#ffffff",
      secondary: "#bdbdbd",
      disabled: "#9e9e9e"
    },
    background: {
      default: "#202020",
      paper: "#232323"
    },
    c_link: "#77b4e6",
    c_link_visited: "#5a9ace"
  },
  // Provide spacing variables expected by MUI components (e.g., Button)
  // MUI expects spacing to be a function that multiplies by 8px
  spacing: (factor: number) => `${factor * 8}px`,
  // Add shadows for Button component
  shadows: [
    "none",
    "0px 2px 1px -1px rgba(0,0,0,0.2),0px 1px 1px 0px rgba(0,0,0,0.14),0px 1px 3px 0px rgba(0,0,0,0.12)",
    "0px 3px 1px -2px rgba(0,0,0,0.2),0px 2px 2px 0px rgba(0,0,0,0.14),0px 1px 5px 0px rgba(0,0,0,0.12)",
    "0px 3px 3px -2px rgba(0,0,0,0.2),0px 3px 4px 0px rgba(0,0,0,0.14),0px 1px 8px 0px rgba(0,0,0,0.12)",
    "0px 2px 4px -1px rgba(0,0,0,0.2),0px 4px 5px 0px rgba(0,0,0,0.14),0px 1px 10px 0px rgba(0,0,0,0.12)",
    ...Array(20).fill("none") // Fill remaining shadow values
  ]
};

// Add tooltip property to theme
(mockTheme as any).tooltip = {};

// Ensure components overrides exist for MUI that reference theme.components
(mockTheme as any).components = {
  ...((mockTheme as any).components || {}),
  MuiTooltip: {
    styleOverrides: {
      tooltip: {}
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
