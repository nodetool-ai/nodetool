import { createTheme } from "@mui/material/styles";

/**
 * `createTheme` under Jest derives none of what MUI reads in CSS-variables mode
 * — the `*Channel` strings, the per-component palette slots — so the mock bolts
 * it on. Typing that surface makes a typo in a mock key a build error instead of
 * a component rendering `undefined` where a color belongs.
 */

/** A palette color slot plus the channel strings `alpha()` reads off it. */
interface MockPaletteColor {
  main: string;
  dark?: string;
  light?: string;
  mainChannel?: string;
  darkChannel?: string;
  lightChannel?: string;
  contrastText?: string;
  contrastTextChannel?: string;
}

interface MockLinearProgressBg {
  primaryBg: string;
  secondaryBg: string;
  errorBg: string;
  infoBg: string;
  successBg: string;
  warningBg: string;
  inheritBg: string;
}

interface MockVarsPalette {
  grey: Record<string, string>;
  primary: MockPaletteColor;
  secondary: MockPaletteColor;
  info: MockPaletteColor;
  error: MockPaletteColor;
  warning: MockPaletteColor;
  success: MockPaletteColor;
  divider: string;
  text: {
    primary: string;
    secondary: string;
    disabled: string;
    primaryChannel?: string;
    secondaryChannel?: string;
    disabledChannel?: string;
  };
  background: { default: string; paper: string };
  action: {
    hover: string;
    selected: string;
    disabled: string;
    disabledBackground: string;
    active: string;
    hoverOpacity?: number;
    selectedOpacity?: number;
    disabledOpacity?: number;
    focusOpacity?: number;
    activatedOpacity?: number;
  };
  Paper: { paper: string };
  c_link: string;
  c_link_visited: string;
  common: {
    white: string;
    black: string;
    onBackground?: string;
    onBackgroundChannel?: string;
    background?: string;
    backgroundChannel?: string;
  };
  primaryChannel: string;
  secondaryChannel: string;
  infoChannel: string;
  errorChannel: string;
  warningChannel: string;
  successChannel: string;
  greyChannel: string;
  textChannel: string;
  dividerChannel: string;
  backgroundDefaultChannel: string;
  backgroundPaperChannel: string;
  Alert: Record<string, string>;
  glass: { blur: string; backgroundDialog: string };
  Button: { inheritContainedBg: string; inheritContainedHoverBg: string };
  /** Everything below is assigned after the literal is built. */
  Switch?: { defaultColor: string };
  LinearProgress?: MockLinearProgressBg;
  ButtonGroup?: { inheritContainedBg: string; inheritContainedHoverBg: string };
  FilledInput?: { bg: string; hoverBg: string; disabledBg: string };
  TableCell?: { border: string };
  Tooltip?: { bg: string };
  Skeleton?: { bg: string };
  OutlinedInput?: { border: string; hoverBorder: string };
  Slider?: Record<string, string>;
  Chip?: {
    defaultAvatarColor: string;
    defaultIconColor: string;
    defaultBorder: string;
  };
}

interface MockZIndex {
  mobileStepper: number;
  fab: number;
  speedDial: number;
  appBar: number;
  drawer: number;
  modal: number;
  snackbar: number;
  tooltip: number;
  behind: number;
  base: number;
  commandMenu: number;
  popover: number;
  popover2: number;
  autocomplete: number;
  floating: number;
  highest: number;
}

interface MockRounded {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  xxl: string;
  pill: string;
  circle: string;
  dialog: string;
  node: string;
  buttonSmall: string;
  buttonLarge: string;
}

interface MockThemeVars {
  palette: MockVarsPalette;
  spacing: (factor: number) => string;
  shadows: string[];
  /** Assigned after the literal is built. */
  tooltip?: Record<string, string>;
  zIndex?: MockZIndex;
  avatar?: { defaultColor: string; defaultAvatarColor: string };
  chip?: { defaultColor: string };
  Switch?: { defaultColor: string };
  opacity?: {
    inputPlaceholder: number;
    inputUnderline: number;
    switchTrackDisabled: number;
    switchTrack: number;
  };
  shape?: { borderRadius: number };
  rounded?: MockRounded;
}

/** The mock as this file assembles it, before it is handed out as a theme. */
interface MockThemeDraft {
  palette: {
    LinearProgress: MockLinearProgressBg;
    Switch?: { defaultColor: string };
  };
  vars: MockThemeVars;
  tooltip: Record<string, string>;
  zIndex: MockZIndex;
  avatar: { defaultColor: string; defaultAvatarColor: string };
  chip: { defaultColor: string };
  Switch: { defaultColor: string };
  alpha: (color: string, opacity: number) => string;
  getColorSchemeSelector: (scheme: string) => string;
  components: Record<string, { styleOverrides: Record<string, object> }>;
  shape: { borderRadius: number };
  rounded: MockRounded;
}

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
  },
  fontSizeGiant: "22px",
  fontSizeBig: "18px",
  fontSizeNormal: "15px",
  fontSizeSmall: "13px",
  fontSizeSmaller: "11px",
  fontFamily1: "'Inter', Arial, sans-serif",
  fontFamily2: "'JetBrains Mono', 'Inter', Arial, sans-serif",
  // TanStack Virtual overscan — mirrors ThemeNodetool so virtualized
  // components (LogsTable, ChatThreadView) can read it under test.
  virtualScroll: {
    overscan: {
      small: 10,
      normal: 25,
      large: 50,
      gridRow: 4
    }
  }
});

// The one seam where the mock stops being a MUI `Theme`; every mutation below
// is checked against `MockThemeDraft`.
const draft = mockTheme as unknown as MockThemeDraft;

// MUI derives these track colors when a real palette is built; the mock
// declares them so LinearProgress-based primitives render under Jest.
draft.palette.LinearProgress = {
  primaryBg: "#3a5a72",
  secondaryBg: "#3a3a3a",
  errorBg: "#5a3a3a",
  infoBg: "#3a4a5a",
  successBg: "#3a5a3a",
  warningBg: "#5a4a3a",
  inheritBg: "#444444"
};

// Add vars property directly to the theme object
draft.vars = {
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
    text: {
      primary: "#ffffff",
      secondary: "#bdbdbd",
      disabled: "#9e9e9e"
    },
    background: {
      default: "#202020",
      paper: "#232323"
    },
    action: {
      hover: "rgba(255,255,255,0.08)",
      selected: "rgba(255,255,255,0.16)",
      disabled: "rgba(255,255,255,0.3)",
      disabledBackground: "rgba(255,255,255,0.12)",
      active: "rgba(255,255,255,0.54)"
    },
    Paper: {
      paper: "#232323"
    },
    c_link: "#77b4e6",
    c_link_visited: "#5a9ace",
    // Add color channels for MUI v7 Button component
    common: {
      white: "#ffffff",
      black: "#000000"
    },
    // Add color channels for proper alpha value calculation
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
    // Add Alert palette for MUI v7 Alert component
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
    // Add glass effect for ResultOverlay component
    glass: {
      blur: "blur(12px)",
      backgroundDialog: "rgba(0, 0, 0, 0.5)"
    },
    // Add Button palette for MUI v7 Button component
    Button: {
      inheritContainedBg: "rgba(255, 255, 255, 0.08)",
      inheritContainedHoverBg: "rgba(255, 255, 255, 0.12)"
    }
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
draft.tooltip = {};
draft.vars.tooltip = {};

// Add zIndex for MUI components plus Nodetool's custom scale
const zIndexScale: MockZIndex = {
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
};
draft.zIndex = { ...zIndexScale };
draft.vars.zIndex = { ...zIndexScale };

// Add avatar properties for MUI Chip component
draft.vars.avatar = {
  defaultColor: "#9e9e9e",
  defaultAvatarColor: "#9e9e9e"
};
draft.avatar = {
  defaultColor: "#9e9e9e",
  defaultAvatarColor: "#9e9e9e"
};

// Add chip properties for MUI Chip component
draft.vars.chip = {
  defaultColor: "#616161"
};
draft.chip = {
  defaultColor: "#616161"
};

// Add Switch properties for MUI Switch component
draft.vars.Switch = {
  defaultColor: "#9e9e9e"
};
draft.Switch = {
  defaultColor: "#9e9e9e"
};
draft.vars.palette.Switch = {
  defaultColor: "#9e9e9e"
};
draft.palette.Switch = {
  defaultColor: "#9e9e9e"
};

// LinearProgress track colors, which MUI reads off `vars.palette` in CSS
// variables mode.
draft.vars.palette.LinearProgress = {
  ...draft.palette.LinearProgress
};

// Add theme.alpha() method for MUI v7 CSS variables mode
draft.alpha = (color: string, opacity: number) => {
  // If color already has rgba, return as-is with adjusted alpha
  if (color && color.startsWith("rgba")) {return color;}
  // For CSS var references or hex colors, return rgba fallback
  return `rgba(255, 255, 255, ${opacity})`;
};

// Add theme.getColorSchemeSelector() for MUI v7 CSS variables mode
draft.getColorSchemeSelector = (scheme: string) => `&[data-color-scheme="${scheme}"]`;

// Add color channels for MUI v7 alpha() function used by ButtonGroup, OutlinedInput, etc.
draft.vars.palette.ButtonGroup = {
  inheritContainedBg: "rgba(255, 255, 255, 0.08)",
  inheritContainedHoverBg: "rgba(255, 255, 255, 0.12)",
};
draft.vars.palette.common.onBackground = "#ffffff";
draft.vars.palette.common.onBackgroundChannel = "255 255 255";
draft.vars.palette.common.background = "#000000";
draft.vars.palette.common.backgroundChannel = "0 0 0";
draft.vars.palette.primary.mainChannel = "119 180 230";
draft.vars.palette.primary.darkChannel = "90 154 206";
draft.vars.palette.primary.lightChannel = "156 204 232";
draft.vars.palette.primary.contrastText = "#000000";
draft.vars.palette.primary.contrastTextChannel = "0 0 0";
draft.vars.palette.secondary.mainChannel = "156 39 176";
draft.vars.palette.error.mainChannel = "244 67 54";
draft.vars.palette.warning.mainChannel = "255 152 0";
draft.vars.palette.info.mainChannel = "33 150 243";
draft.vars.palette.success.mainChannel = "76 175 80";
draft.vars.palette.text.primaryChannel = "255 255 255";
draft.vars.palette.text.secondaryChannel = "189 189 189";
draft.vars.palette.text.disabledChannel = "158 158 158";
draft.vars.palette.action.hoverOpacity = 0.08;
draft.vars.palette.action.selectedOpacity = 0.16;
draft.vars.palette.action.disabledOpacity = 0.38;
draft.vars.palette.action.focusOpacity = 0.12;
draft.vars.palette.action.activatedOpacity = 0.12;
draft.vars.palette.FilledInput = {
  bg: "rgba(255, 255, 255, 0.09)",
  hoverBg: "rgba(255, 255, 255, 0.13)",
  disabledBg: "rgba(255, 255, 255, 0.12)",
};
draft.vars.palette.TableCell = {
  border: "rgba(81, 81, 81, 1)",
};
draft.vars.palette.Tooltip = {
  bg: "rgba(97, 97, 97, 0.92)",
};
draft.vars.palette.Skeleton = {
  bg: "rgba(255, 255, 255, 0.11)",
};
draft.vars.palette.OutlinedInput = {
  border: "rgba(255, 255, 255, 0.23)",
  hoverBorder: "#ffffff",
};
draft.vars.palette.Slider = {
  primaryTrack: "rgba(119, 180, 230, 0.62)",
  secondaryTrack: "rgba(156, 39, 176, 0.62)",
  errorTrack: "rgba(244, 67, 54, 0.62)",
  infoTrack: "rgba(33, 150, 243, 0.62)",
  successTrack: "rgba(76, 175, 80, 0.62)",
  warningTrack: "rgba(255, 152, 0, 0.62)",
};

// Add Chip palette properties for MUI Chip component (theme.vars.palette.Chip)
draft.vars.palette.Chip = {
  defaultAvatarColor: "#9e9e9e",
  defaultIconColor: "#9e9e9e",
  defaultBorder: "#616161",
};

// Add opacity vars for MUI InputBase component
draft.vars.opacity = {
  inputPlaceholder: 0.42,
  inputUnderline: 0.42,
  switchTrackDisabled: 0.12,
  switchTrack: 0.38,
};

// Ensure components overrides exist for MUI that reference theme.components
draft.components = {
  ...(draft.components || {}),
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
draft.shape = {
  borderRadius: 4
};
draft.vars.shape = {
  borderRadius: 4
};

// Mirror the `rounded` token set from ThemeNodetool so components that read
// `theme.rounded.*` work under test.
const roundedTokens: MockRounded = {
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
};
draft.rounded = roundedTokens;
draft.vars.rounded = roundedTokens;

export default mockTheme;
