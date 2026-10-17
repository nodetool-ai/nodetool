import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { SectionHeader } from "../SectionHeader";
import { InspectorSectionTitle } from "../InspectorSection";
import { EYEBROW } from "../tokens";

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("SectionHeader", () => {
  it("draws the small size in the shared EYEBROW style", () => {
    renderWithTheme(<SectionHeader title="Filters" size="small" />);
    expect(screen.getByText("Filters")).toHaveStyle({
      fontSize: EYEBROW.fontSize,
      fontWeight: String(EYEBROW.fontWeight),
      textTransform: EYEBROW.textTransform,
      letterSpacing: EYEBROW.letterSpacing
    });
  });

  it("matches the InspectorSectionTitle eyebrow", () => {
    renderWithTheme(
      <>
        <SectionHeader title="Recent" size="small" />
        <InspectorSectionTitle title="Transform" />
      </>
    );
    const sectionStyle = window.getComputedStyle(screen.getByText("Recent"));
    const inspectorStyle = window.getComputedStyle(
      screen.getByText("Transform").parentElement as HTMLElement
    );
    for (const prop of ["font-size", "font-weight", "text-transform", "letter-spacing"]) {
      expect(sectionStyle.getPropertyValue(prop)).toBe(inspectorStyle.getPropertyValue(prop));
    }
  });

  it("renders the count beside the title and the action at the end", () => {
    renderWithTheme(
      <SectionHeader
        title="Recipes"
        size="large"
        titleComponent="h2"
        count="12"
        action={<button type="button">Browse all</button>}
      />
    );
    expect(screen.getByRole("heading", { level: 2, name: "Recipes" })).toBeInTheDocument();
    expect(screen.getByText("12")).toHaveClass("section-header-count");
    expect(screen.getByRole("button", { name: "Browse all" })).toBeInTheDocument();
  });

  it("uppercases a medium title only when asked", () => {
    const { rerender } = renderWithTheme(<SectionHeader title="Settings" />);
    expect(screen.getByText("Settings")).not.toHaveStyle({ textTransform: "uppercase" });
    rerender(
      <ThemeProvider theme={mockTheme}>
        <SectionHeader title="Settings" uppercase />
      </ThemeProvider>
    );
    expect(screen.getByText("Settings")).toHaveStyle({ textTransform: "uppercase" });
  });
});
