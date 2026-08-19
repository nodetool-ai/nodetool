/**
 * The MUI theme bootstrap every web entry point mounts at its root.
 *
 * The theme is a prop rather than an import: `ThemeNodetool` reads `CONTROL`
 * from this barrel, so importing it back here would make the primitives layer
 * and the theme layer circular.
 */
import type { ReactNode } from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import type { Theme } from "@mui/material/styles";

export interface ThemeRootProps {
  theme: Theme;
  children?: ReactNode;
}

export const ThemeRoot = ({ theme, children }: ThemeRootProps) => (
  <ThemeProvider theme={theme} defaultMode="dark">
    <InitColorSchemeScript attribute="class" defaultMode="dark" />
    <CssBaseline />
    {children}
  </ThemeProvider>
);
