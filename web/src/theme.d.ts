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
  }
  // If you also need to access theme.vars in your components or component overrides
  // you might need to augment the Theme interface as well, though the docs primarily show its usage
  // for accessing variables like theme.vars.palette.primary.main.
  // For now, let's focus on getting ThemeOptions right for createTheme.
}
