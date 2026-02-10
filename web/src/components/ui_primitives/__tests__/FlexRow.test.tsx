import React from "react";
import { render, screen } from "@testing-library/react";
import { FlexRow } from "../FlexRow";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("FlexRow", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  it("renders children correctly", () => {
    renderWithTheme(
      <FlexRow>
        <div>Item 1</div>
        <div>Item 2</div>
      </FlexRow>
    );
    
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
  });

  it("applies gap spacing", () => {
    const { container } = renderWithTheme(
      <FlexRow gap={1.5}>
        <div>Item</div>
      </FlexRow>
    );
    
    const flexRow = container.firstChild as HTMLElement;
    expect(flexRow).toHaveStyle({ display: "flex", flexDirection: "row" });
  });

  it("applies full width when specified", () => {
    const { container } = renderWithTheme(
      <FlexRow fullWidth>
        <div>Item</div>
      </FlexRow>
    );
    
    const flexRow = container.firstChild as HTMLElement;
    expect(flexRow).toHaveStyle({ width: "100%" });
  });

  it("applies custom alignment and justification", () => {
    const { container } = renderWithTheme(
      <FlexRow align="center" justify="space-between">
        <div>Item</div>
      </FlexRow>
    );
    
    const flexRow = container.firstChild as HTMLElement;
    expect(flexRow).toHaveStyle({ 
      alignItems: "center",
      justifyContent: "space-between"
    });
  });

  it("enables wrapping when specified", () => {
    const { container } = renderWithTheme(
      <FlexRow wrap>
        <div>Item</div>
      </FlexRow>
    );
    
    const flexRow = container.firstChild as HTMLElement;
    expect(flexRow).toHaveStyle({ flexWrap: "wrap" });
  });
});
