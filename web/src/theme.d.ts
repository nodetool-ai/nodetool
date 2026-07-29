import "@mui/material/styles";
import type { PaletteOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface CssThemeVariables {
    enabled: true;
  }

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
    fontSizeBig?: string;
    fontSizeNormal?: string;
    fontSizeSmall?: string;
    fontSizeSmaller?: string;
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
    virtualScroll?: {
      overscan?: {
        small?: number;
        normal?: number;
        large?: number;
        gridRow?: number;
      };
    };
  }

  interface Theme {
    fontSizeGiant: string;
    fontSizeBig: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller: string;
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
    virtualScroll: {
      overscan: {
        small: number;
        normal: number;
        large: number;
        gridRow: number;
      };
    };
  }

  // When using @mui/material with CSS variables, many APIs use CssVarsTheme
  // Merge our custom fields there as well to satisfy callback typings
  interface CssVarsThemeOptions {
    fontSizeGiant?: string;
    fontSizeBig?: string;
    fontSizeNormal?: string;
    fontSizeSmall?: string;
    fontSizeSmaller?: string;
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
    virtualScroll?: {
      overscan?: {
        small?: number;
        normal?: number;
        large?: number;
        gridRow?: number;
      };
    };
  }
  interface CssVarsTheme {
    fontSizeGiant: string;
    fontSizeBig: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller: string;
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
    virtualScroll: {
      overscan: {
        small: number;
        normal: number;
        large: number;
        gridRow: number;
      };
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

  interface ThemeVars {
    fontSizeGiant: string;
    fontSizeBig: string;
    fontSizeNormal: string;
    fontSizeSmall: string;
    fontSizeSmaller: string;
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
    virtualScroll: {
      overscan: {
        small: string;
        normal: string;
        large: string;
        gridRow: string;
      };
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
    floatingPanel: number;
    highest: number;
  }
}
