import "@mui/material/styles";
import type { PaletteOptions } from "@mui/material/styles";

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
    // Ensure theme.vars is treated as always present in our codebase
    // MUI's internal theme.vars structure is complex and cannot be easily typed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vars: any;
    rounded: {
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
  }

  interface Color {
    0?: string;
    1000?: string;
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
