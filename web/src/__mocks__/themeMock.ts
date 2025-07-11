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
  } as any // Use 'as any' to bypass TypeScript checking for custom properties
} as any);

// Add custom font properties to the mock theme
(mockTheme as any).fontSizeNormal = "16px";
(mockTheme as any).fontSizeSmall = "0.875em";
(mockTheme as any).fontSizeSmaller = "0.75em";
(mockTheme as any).fontFamily1 = "'Inter', Arial, sans-serif";
(mockTheme as any).fontFamily2 = "'JetBrains Mono', 'Inter', Arial, sans-serif";

export default mockTheme;
