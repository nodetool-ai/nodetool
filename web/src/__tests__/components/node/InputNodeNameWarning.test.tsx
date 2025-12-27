import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import InputNodeNameWarning from "../../../components/node/InputNodeNameWarning";

const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("InputNodeNameWarning", () => {
  it("shows warning for input node with empty name", () => {
    renderWithTheme(<InputNodeNameWarning nodeType="nodetool.input.StringInput" name="" />);
    expect(screen.getByText(/Name required/i)).toBeInTheDocument();
  });

  it("shows warning for input node with undefined name", () => {
    renderWithTheme(<InputNodeNameWarning nodeType="nodetool.input.IntegerInput" name={undefined} />);
    expect(screen.getByText(/Name required/i)).toBeInTheDocument();
  });

  it("shows warning for input node with whitespace-only name", () => {
    renderWithTheme(<InputNodeNameWarning nodeType="nodetool.input.FloatInput" name="   " />);
    expect(screen.getByText(/Name required/i)).toBeInTheDocument();
  });

  it("does not show warning for input node with valid name", () => {
    renderWithTheme(<InputNodeNameWarning nodeType="nodetool.input.StringInput" name="my_input" />);
    expect(screen.queryByText(/Name required/i)).not.toBeInTheDocument();
  });

  it("does not show warning for non-input nodes", () => {
    renderWithTheme(<InputNodeNameWarning nodeType="nodetool.text.Concat" name="" />);
    expect(screen.queryByText(/Name required/i)).not.toBeInTheDocument();
  });

  it("does not show warning for output nodes with empty name", () => {
    renderWithTheme(<InputNodeNameWarning nodeType="nodetool.output.TextOutput" name="" />);
    expect(screen.queryByText(/Name required/i)).not.toBeInTheDocument();
  });

  it("shows warning for various input node types", () => {
    const inputTypes = [
      "nodetool.input.StringInput",
      "nodetool.input.IntegerInput",
      "nodetool.input.FloatInput",
      "nodetool.input.BooleanInput",
      "nodetool.input.ImageInput",
      "nodetool.input.AudioInput",
      "nodetool.input.VideoInput"
    ];

    inputTypes.forEach((nodeType) => {
      const { unmount } = renderWithTheme(<InputNodeNameWarning nodeType={nodeType} name="" />);
      expect(screen.getByText(/Name required/i)).toBeInTheDocument();
      unmount();
    });
  });
});
