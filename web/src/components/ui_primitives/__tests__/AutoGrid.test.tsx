import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { AutoGrid } from "../AutoGrid";
import { SPACING } from "../spacing";
import mockTheme from "../../../__mocks__/themeMock";
import { firstElement } from "../../../test-utils/doubles";

describe("AutoGrid", () => {
  const renderWithTheme = (component: React.ReactElement) =>
    render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

  it("renders children correctly", () => {
    renderWithTheme(
      <AutoGrid>
        <div>Item 1</div>
        <div>Item 2</div>
      </AutoGrid>
    );

    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
  });

  it("uses auto-fill and a 200px minimum by default", () => {
    const { container } = renderWithTheme(
      <AutoGrid>
        <div>Item</div>
      </AutoGrid>
    );

    expect(firstElement(container)).toHaveStyle({
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))"
    });
  });

  it("applies minItemWidth and fit mode", () => {
    const { container } = renderWithTheme(
      <AutoGrid minItemWidth={140} fill="fit">
        <div>Item</div>
      </AutoGrid>
    );

    expect(firstElement(container)).toHaveStyle({
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))"
    });
  });

  it("applies gap from a spacing step", () => {
    const { container } = renderWithTheme(
      <AutoGrid gap={SPACING.lg}>
        <div>Item</div>
      </AutoGrid>
    );

    // mockTheme uses an 8px spacing unit, so SPACING.lg (3 units) is 24px here.
    expect(firstElement(container)).toHaveStyle({ gap: "24px" });
  });

  it("forwards role and aria-label", () => {
    renderWithTheme(
      <AutoGrid role="list" aria-label="Assets">
        <div>Item</div>
      </AutoGrid>
    );

    expect(screen.getByRole("list", { name: "Assets" })).toBeInTheDocument();
  });
});
