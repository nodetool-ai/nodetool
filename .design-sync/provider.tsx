import * as React from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import ThemeNodetool from "../web/src/components/themes/ThemeNodetool";

/**
 * Preview/runtime provider for the NodeTool UI primitives.
 *
 * Every primitive is theme-driven (MUI v7 + emotion). Without this wrapper the
 * components read an undefined theme and render unstyled. ThemeNodetool also
 * pulls the @fontsource Inter / JetBrains Mono CSS, so the brand fonts ship
 * inside the bundle's CSS.
 *
 * NodeTool runs dark by default (the app uses
 * `InitColorSchemeScript defaultMode="dark"` + `ThemeProvider defaultMode="dark"`).
 * The theme uses MUI cssVariables with `colorSchemeSelector: "class"`, so the
 * `dark` class must be present on a wrapper for the dark scheme's CSS vars to
 * apply in a static render. The wrapper also paints the dark surface so cards
 * match the real app instead of falling back to the light scheme.
 */
export const DSProvider = ({ children }: { children?: React.ReactNode }) => (
  <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
    <CssBaseline />
    <div
      className="dark"
      style={{
        background: "var(--palette-background-default, #08090A)",
        color: "var(--palette-text-primary, #F7F8F8)",
        padding: 16,
        minHeight: "100%",
        boxSizing: "border-box"
      }}
    >
      {children}
    </div>
  </ThemeProvider>
);

export default DSProvider;
