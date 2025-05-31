import { Theme, createTheme } from "@mui/material/styles";
import type {} from "@mui/material/themeCssVarsAugmentation";
import { paletteDark } from "../themes/paletteDark";
import { paletteLight } from "../themes/paletteLight";

import "@fontsource/inter";
import "@fontsource/inter/200.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";

import "@fontsource/jetbrains-mono/200.css";
import "@fontsource/jetbrains-mono/300.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";

const ThemeChat: Theme = createTheme({
  defaultColorScheme: "dark",
  colorSchemes: {
    dark: { palette: paletteDark },
    light: { palette: paletteLight }
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
  shape: { borderRadius: 4 }
});

export default ThemeChat;
