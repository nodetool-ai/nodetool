import React from "react";
import { render, screen } from "@testing-library/react";
import { FlexColumn } from "../FlexColumn";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

describe("FlexColumn", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  it("renders children correctly", () => {
    renderWithTheme(
      <FlexColumn>
        <div>Child 1</div>
        <div>Child 2</div>
      </FlexColumn>
    );
    
    expect(screen.getByText("Child 1")).toBeInTheDocument();
    expect(screen.getByText("Child 2")).toBeInTheDocument();
  });

  it("applies gap spacing", () => {
    const { container } = renderWithTheme(
      <FlexColumn gap={2}>
        <div>Child</div>
      </FlexColumn>
    );
    
    const flexColumn = container.firstChild as HTMLElement;
    expect(flexColumn).toHaveStyle({ display: "flex", flexDirection: "column" });
  });

  it("applies full width when specified", () => {
    const { container } = renderWithTheme(
      <FlexColumn fullWidth>
        <div>Child</div>
      </FlexColumn>
    );
    
    const flexColumn = container.firstChild as HTMLElement;
    expect(flexColumn).toHaveStyle({ width: "100%" });
  });

  it("applies custom alignment", () => {
    const { container } = renderWithTheme(
      <FlexColumn align="center" justify="space-between">
        <div>Child</div>
      </FlexColumn>
    );
    
    const flexColumn = container.firstChild as HTMLElement;
    expect(flexColumn).toHaveStyle({ 
      alignItems: "center",
      justifyContent: "space-between"
    });
  });

  it("applies custom sx props", () => {
    const { container } = renderWithTheme(
      <FlexColumn sx={{ backgroundColor: "red" }}>
        <div>Child</div>
      </FlexColumn>
    );
    
    const flexColumn = container.firstChild as HTMLElement;
    expect(flexColumn).toHaveStyle({ backgroundColor: "red" });
  });

  it("enables wrapping when specified", () => {
    const { container } = renderWithTheme(
      <FlexColumn wrap>
        <div>Child</div>
      </FlexColumn>
    );
    
    const flexColumn = container.firstChild as HTMLElement;
    expect(flexColumn).toHaveStyle({ flexWrap: "wrap" });
  });
});
