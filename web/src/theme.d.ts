import "@mui/material/styles";
import type { PaletteOptions, ThemeVars } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface ThemeOptions {
    /**
     * Enable auto-generated CSS custom properties.
     * true ➔ default prefix `--mui-...`
     * or an object to configure `cssVarPrefix` and `colorSchemeSelector`
     */
    cssVariables?:
      | boolean
      | {
          cssVarPrefix?: string;
          colorSchemeSelector?: "class" | "data" | string;
          /**
           * Attach CSS variables to the html tag instead of the :root pseudo-class.
           */
          rootElement?: string;
        };
    /**
     * The default color scheme to be used.
     */
    defaultColorScheme?: string;
    /**
     * The color schemes configuration.
     */
    colorSchemes?: Partial<Record<string, { palette: PaletteOptions }>>;
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
    rounded?: {
      xs?: string;
      sm?: string;
      md?: string;
      lg?: string;
      xl?: string;
      xxl?: string;
      pill?: string;
      circle?: string;
      dialog?: string;
      node?: string;
      buttonSmall?: string;
      buttonLarge?: string;
      container?: string;
    };
    /**
     * Minimal editor-specific values (kept small; expand only when needed).
     * Used behind editor marker classes so styles don't leak globally.
     */
    editor?: {
      heightNode?: string;
      heightInspector?: string;
      padXNode?: string;
      padYNode?: string;
      padXInspector?: string;
      padYInspector?: string;
      controlRadius?: string;
      menuRadius?: string;
      menuShadow?: string;
    };
  }

  interface Theme {
    fontSizeGiant: string;
    fontSizeBigger: string;
    fontSizeBig: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller: string;
    fontSizeTiny: string;
    fontSizeTinyer: string;
    fontFamily1: string;
    fontFamily2: string;
    vars: ThemeVars;
    rounded: {
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
      container: string;
    };
    editor: {
      heightNode: string;
      heightInspector: string;
      padXNode: string;
      padYNode: string;
      padXInspector: string;
      padYInspector: string;
      controlRadius: string;
      menuRadius: string;
      menuShadow: string;
    };
  }

  // When using @mui/material with CSS variables, many APIs use CssVarsTheme
  // Merge our custom fields there as well to satisfy callback typings
  interface CssVarsThemeOptions {
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
    rounded?: {
      xs?: string;
      sm?: string;
      md?: string;
      lg?: string;
      xl?: string;
      xxl?: string;
      pill?: string;
      circle?: string;
      dialog?: string;
      node?: string;
      buttonSmall?: string;
      buttonLarge?: string;
      container?: string;
    };
    editor?: {
      heightNode?: string;
      heightInspector?: string;
      padXNode?: string;
      padYNode?: string;
      padXInspector?: string;
      padYInspector?: string;
      controlRadius?: string;
      menuRadius?: string;
      menuShadow?: string;
    };
  }
  interface CssVarsTheme {
    fontSizeGiant: string;
    fontSizeBigger: string;
    fontSizeBig: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller: string;
    fontSizeTiny: string;
    fontSizeTinyer: string;
    fontFamily1: string;
    fontFamily2: string;
    rounded: {
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
      container: string;
    };
    editor: {
      heightNode: string;
      heightInspector: string;
      padXNode: string;
      padYNode: string;
      padXInspector: string;
      padYInspector: string;
      controlRadius: string;
      menuRadius: string;
      menuShadow: string;
    };
  }

  interface ThemeVars {
    fontSizeGiant: string;
    fontSizeBigger: string;
    fontSizeBig: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller: string;
    fontSizeTiny: string;
    fontSizeTinyer: string;
    fontFamily1: string;
    fontFamily2: string;
    rounded: {
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
      container: string;
    };
    editor: {
      heightNode: string;
      heightInspector: string;
      padXNode: string;
      padYNode: string;
      padXInspector: string;
      padYInspector: string;
      controlRadius: string;
      menuRadius: string;
      menuShadow: string;
    };
  }

  interface PaletteCommonChannel {
    whiteChannel: string;
    blackChannel: string;
  }

  interface PaletteActionChannel {
    hoverChannel: string;
  }

  interface Color {
    0?: string;
    850?: string;
    1000?: string;
  }

  interface PaletteOptions {
    c_gray0?: string;
    c_gray1?: string;
    c_gray2?: string;
    c_gray3?: string;
    c_gray4?: string;
    c_gray5?: string;
    c_gray6?: string;
    c_hl1?: string;
    c_hl2?: string;
    rounded?: {
      container?: string;
    };
  }

  interface Palette {
    c_gray0?: string;
    c_gray1?: string;
    c_gray2?: string;
    c_gray3?: string;
    c_gray4?: string;
    c_gray5?: string;
    c_gray6?: string;
    c_hl1?: string;
    c_hl2?: string;
    rounded: {
      container?: string;
    };
  }

  // Extend ZIndex with app-specific levels used across the project
  interface ZIndex {
    behind: number;
    base: number;
    commandMenu: number;
    popover: number;
    autocomplete: number;
    popover2: number;
    floating: number;
    highest: number;
  }
}
