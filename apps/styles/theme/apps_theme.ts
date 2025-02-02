import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/* -------------------------------------------------------------------------- */
/*                             Tokens                                         */
/* -------------------------------------------------------------------------- */
const tokens = {
  colors: {
    // Base colors
    black: { value: "#1a1a1a" },
    white: { value: "#ffffff" },
    // Primary colors
    primary: { value: "#76e5b8" },
    primaryAlpha: { value: "#76e5b992" },
    // Grays
    gray: {
      50: { value: "#f7f7f7" },
      100: { value: "#e0e0e0" },
      150: { value: "#d0d0d0" },
      200: { value: "#a2a2a2" },
      300: { value: "#494949" },
      400: { value: "#3e3e3e" },
      500: { value: "#333333" },
      600: { value: "#2a2a2a" },
      700: { value: "#1a1a1a" },
      800: { value: "#111111" },
      900: { value: "#000000" },
    },
    // Semantic colors for light mode
    textLight: { value: "#1a1a1a" },
    textGrayLight: { value: "#666666" },
    secondaryLight: { value: "#f0f0f0" },
    borderLight: { value: "#e0e0e0" },
    buttonBgLight: { value: "#e5e5e5" },
    inputBgLight: { value: "#f5f5f5" },
    // Semantic colors for dark mode
    textDark: { value: "#e0e0e0" },
    textGrayDark: { value: "#a2a2a2" },
    secondaryDark: { value: "#2a2a2a" },
    borderDark: { value: "#555555" },
    buttonBgDark: { value: "#494949" },
    inputBgDark: { value: "#3e3e3e" },
    // Status colors
    warning: { value: "#ffcc00" },
    success: { value: "#76e5b8" },
    error: { value: "#ff4d4d" },
  },
  fonts: {
    body: { value: "'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
    mono: { value: "monospace" },
  },
  fontSizes: {
    xs: { value: "0.75rem" },
    sm: { value: "0.875rem" },
    md: { value: "1rem" },
    lg: { value: "1.125rem" },
    xl: { value: "1.25rem" },
  },
};

/* -------------------------------------------------------------------------- */
/*                          Semantic Tokens                                   */
/* -------------------------------------------------------------------------- */
const semanticTokens = {
  colors: {
    text: {
      value: { base: "{colors.textLight}", _dark: "{colors.textDark}" },
    },
    borderColor: {
      value: { base: "red", _dark: "blue" },
    },
    // bg: {
    //   value: { base: "{colors.gray.100}", _dark: "{colors.gray.900}" },
    // },
    bg1: {
      value: { base: "{colors.gray.200}", _dark: "{colors.gray.800}" },
    },
    bg2: {
      value: { base: "{colors.gray.300}", _dark: "{colors.gray.700}" },
    },
    bg3: {
      value: { base: "{colors.gray.400}", _dark: "{colors.gray.600}" },
    },

    textGray: {
      value: {
        base: "{colors.textGrayLight}",
        _dark: "{colors.textGrayDark}",
      },
    },
    border: {
      value: { base: "{colors.borderLight}", _dark: "{colors.borderDark}" },
    },
    secondary: {
      value: {
        base: "{colors.secondaryLight}",
        _dark: "{colors.secondaryDark}",
      },
    },
    buttonBg: {
      value: {
        base: "{colors.buttonBgLight}",
        _dark: "{colors.buttonBgDark}",
      },
    },
    buttonHover: {
      value: {
        base: "{colors.gray.50}",
        _dark: "{colors.gray.400}",
      },
    },
    buttonActiveBg: {
      value: {
        base: "{colors.buttonBgLight}",
        _dark: "{colors.buttonBgDark}",
      },
    },
    inputBg: {
      value: {
        base: "{colors.inputBgLight}",
        _dark: "{colors.inputBgDark}",
      },
    },
    selection: { value: "{colors.primaryAlpha}" },
    primary: { value: "{colors.primary}" },
    warning: { value: "{colors.warning}" },

    gray50: {
      value: { base: "{colors.gray.50}", _dark: "{colors.gray.900}" },
    },
    gray100: {
      value: { base: "{colors.gray.100}", _dark: "{colors.gray.800}" },
    },
    gray200: {
      value: { base: "{colors.gray.200}", _dark: "{colors.gray.700}" },
    },
    gray300: {
      value: { base: "{colors.gray.300}", _dark: "{colors.gray.600}" },
    },
    gray400: {
      value: { base: "{colors.gray.400}", _dark: "{colors.gray.500}" },
    },
    gray500: {
      value: { base: "{colors.gray.500}", _dark: "{colors.gray.400}" },
    },
    gray600: {
      value: { base: "{colors.gray.600}", _dark: "{colors.gray.300}" },
    },
    gray700: {
      value: { base: "{colors.gray.700}", _dark: "{colors.gray.200}" },
    },
    gray800: {
      value: { base: "{colors.gray.800}", _dark: "{colors.gray.100}" },
    },
    gray900: {
      value: { base: "{colors.gray.900}", _dark: "{colors.gray.50}" },
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                          Global Styles Section                             */
/* -------------------------------------------------------------------------- */
const globalCss = {
  ":root": {
    "--selection-color": "{colors.primaryAlpha}",
  },
  "*, *::before, *::after": {
    boxSizing: "border-box",
  },
  "*::selection": {
    backgroundColor: "selection",
  },
  "html, body": {
    margin: 0,
    padding: 0,
    backgroundColor: "colors.gray200",
    color: "text",
    fontSize: "md",
    lineHeight: 1.2,
    fontFamily: "body",
  },
  // Scrollbar styles
  "::-webkit-scrollbar": {
    width: "8px",
  },
  "::-webkit-scrollbar-track": {
    // background: "border",
  },
  "::-webkit-scrollbar-thumb": {
    background: "primary",
    borderRadius: "2px",
  },
  "::-webkit-scrollbar-thumb:hover": {
    background: "border",
  },
  // Form elements
  "input, textarea, select": {
    backgroundColor: "inputBg",
    color: "text",
    border: "1px solid",
    borderColor: "border",
    borderRadius: "2px",
    padding: "0.5em",
    outline: "none",
    "&::placeholder": {
      color: "placeholder",
      opacity: 1,
    },
    "&:focus": {
      borderColor: "primary",
      boxShadow: "0 0 0 2px var(--nt-colors-primaryAlpha)",
    },
  },
  // Buttons
  button: {
    backgroundColor: "buttonBg",
    color: "text",
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    "&:hover": {
      color: "primary",
    },
    "&:disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
  },
};

/* -------------------------------------------------------------------------- */
/*                   Custom Configuration                                     */
/* -------------------------------------------------------------------------- */
const customConfig = defineConfig({
  // strictTokens: true,
  cssVarsPrefix: "nt",

  theme: {
    tokens,
    semanticTokens,
  },
  globalCss,
});

// Create the system with defaultConfig merged with our customConfig
const theme = createSystem(defaultConfig, customConfig);

export default theme;
