/**
 * Shared test utilities for ui_primitives.
 *
 * Every new primitive test should use renderWithTheme() for rendering and
 * checkA11y() to assert WCAG compliance. Automated axe-core checks catch
 * roughly 30% of WCAG violations at near-zero cost — run them on every
 * component render, not just dedicated a11y test cases.
 */

import React from "react";
import { render, RenderResult } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { axe, toHaveNoViolations } from "jest-axe";
import mockTheme from "../../../__mocks__/themeMock";

expect.extend(toHaveNoViolations);

/**
 * Render a component wrapped in the Nodetool theme.
 * Use this instead of the bare render() in every primitive test.
 */
export const renderWithTheme = (ui: React.ReactElement): RenderResult => {
  return render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);
};

/**
 * Assert that the rendered container has no axe-core accessibility violations.
 * Call once per test (or per meaningful variant) on the container returned by
 * renderWithTheme().
 *
 * @example
 * it("has no accessibility violations", async () => {
 *   const { container } = renderWithTheme(<MyPrimitive label="Action" />);
 *   await checkA11y(container);
 * });
 */
export const checkA11y = async (container: HTMLElement): Promise<void> => {
  const results = await axe(container);
  expect(results).toHaveNoViolations();
};
