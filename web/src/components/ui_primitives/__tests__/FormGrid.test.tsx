import React from "react";
import { render, screen } from "@testing-library/react";
import { FormGrid } from "../FormGrid";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("FormGrid", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  it("renders children correctly", () => {
    renderWithTheme(
      <FormGrid>
        <div>Left</div>
        <div>Right</div>
      </FormGrid>
    );

    expect(screen.getByText("Left")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
  });

  it("forwards ref to the root element", () => {
    const ref = React.createRef<HTMLDivElement>();
    renderWithTheme(
      <FormGrid ref={ref}>
        <div>Child</div>
      </FormGrid>
    );

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it("applies the default grid template columns", () => {
    const { container } = renderWithTheme(
      <FormGrid>
        <div>Left</div>
        <div>Right</div>
      </FormGrid>
    );

    const grid = container.firstChild as HTMLElement;
    expect(grid).toHaveStyle({
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) 260px"
    });
  });

  it("applies custom columns", () => {
    const { container } = renderWithTheme(
      <FormGrid columns="1fr 1fr 1fr">
        <div>A</div>
        <div>B</div>
        <div>C</div>
      </FormGrid>
    );

    const grid = container.firstChild as HTMLElement;
    expect(grid).toHaveStyle({ gridTemplateColumns: "1fr 1fr 1fr" });
  });

  it("aligns items to the start", () => {
    const { container } = renderWithTheme(
      <FormGrid>
        <div>Child</div>
      </FormGrid>
    );

    expect(container.firstChild).toHaveStyle({ alignItems: "start" });
  });

  it("renders without stacking styles when stackBelow is 0", () => {
    const { container } = renderWithTheme(
      <FormGrid stackBelow={0}>
        <div>Child</div>
      </FormGrid>
    );

    const grid = container.firstChild as HTMLElement;
    expect(grid).toHaveStyle({
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) 260px"
    });
  });

  it("applies custom className to the root element", () => {
    const { container } = renderWithTheme(
      <FormGrid className="custom-grid">
        <div>Child</div>
      </FormGrid>
    );

    expect(container.firstChild).toHaveClass("custom-grid");
  });
});
