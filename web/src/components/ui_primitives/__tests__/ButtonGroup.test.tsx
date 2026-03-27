import React from "react";
import { render, screen } from "@testing-library/react";
import { ButtonGroup } from "../ButtonGroup";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { Button } from "@mui/material";

describe("ButtonGroup", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>{component}</ThemeProvider>
    );
  };

  it("renders children buttons", () => {
    renderWithTheme(
      <ButtonGroup>
        <Button>Left</Button>
        <Button>Right</Button>
      </ButtonGroup>
    );
    expect(screen.getByText("Left")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
  });

  it("renders in compact mode", () => {
    renderWithTheme(
      <ButtonGroup compact>
        <Button>A</Button>
        <Button>B</Button>
      </ButtonGroup>
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("renders vertical orientation", () => {
    const { container } = renderWithTheme(
      <ButtonGroup orientation="vertical">
        <Button>Top</Button>
        <Button>Bottom</Button>
      </ButtonGroup>
    );
    const group = container.querySelector(".MuiButtonGroup-root");
    expect(group).toBeInTheDocument();
  });

  it("renders full width", () => {
    const { container } = renderWithTheme(
      <ButtonGroup fullWidth>
        <Button>Full</Button>
      </ButtonGroup>
    );
    const group = container.querySelector(".MuiButtonGroup-root");
    expect(group).toBeInTheDocument();
  });
});
