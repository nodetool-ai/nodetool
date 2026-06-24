/**
 * Shared test render helper.
 *
 * Wraps components under test in a `ThemeProvider` backed by the complete mock
 * theme (`src/__mocks__/themeMock`). That theme mirrors ThemeNodetool's shape —
 * including `vars.palette.common.white` / `.black`, the custom `c_*` tokens, the
 * `rounded` aliases, and the MUI v7 colour channels — so components that read
 * deep theme paths render under test without
 * "Cannot read properties of undefined" errors.
 *
 * Prefer this over hand-rolled per-file `renderWithTheme` helpers or partial
 * inline `useTheme` mocks: those drift from the real theme shape and break the
 * moment a component reaches for a path the partial mock forgot.
 */
import React from "react";
import {
  render,
  type RenderOptions,
  type RenderResult
} from "@testing-library/react";
import { ThemeProvider, type Theme } from "@mui/material/styles";
import testTheme from "../__mocks__/themeMock";

export { testTheme };

export interface RenderWithThemeOptions
  extends Omit<RenderOptions, "wrapper"> {
  /** Override the theme; defaults to the complete mock theme. */
  theme?: Theme;
}

/**
 * Render `ui` inside a `ThemeProvider` using the complete mock theme.
 * Pass `{ theme }` to override, or any other React Testing Library
 * `RenderOptions` (e.g. `container`).
 */
export const renderWithTheme = (
  ui: React.ReactElement,
  { theme = testTheme, ...options }: RenderWithThemeOptions = {}
): RenderResult =>
  render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    ),
    ...options
  });

export default renderWithTheme;
