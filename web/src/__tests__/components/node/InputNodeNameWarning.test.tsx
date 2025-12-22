import React from "react";
import { render, screen } from "@testing-library/react";
import InputNodeNameWarning from "../../../components/node/InputNodeNameWarning";

describe("InputNodeNameWarning", () => {
  it("shows warning for input node with empty name", () => {
    render(<InputNodeNameWarning nodeType="nodetool.input.StringInput" name="" />);
    expect(screen.getByText(/Name required/i)).toBeInTheDocument();
  });

  it("shows warning for input node with undefined name", () => {
    render(<InputNodeNameWarning nodeType="nodetool.input.IntegerInput" name={undefined} />);
    expect(screen.getByText(/Name required/i)).toBeInTheDocument();
  });

  it("shows warning for input node with whitespace-only name", () => {
    render(<InputNodeNameWarning nodeType="nodetool.input.FloatInput" name="   " />);
    expect(screen.getByText(/Name required/i)).toBeInTheDocument();
  });

  it("does not show warning for input node with valid name", () => {
    render(<InputNodeNameWarning nodeType="nodetool.input.StringInput" name="my_input" />);
    expect(screen.queryByText(/Name required/i)).not.toBeInTheDocument();
  });

  it("does not show warning for non-input nodes", () => {
    render(<InputNodeNameWarning nodeType="nodetool.text.Concat" name="" />);
    expect(screen.queryByText(/Name required/i)).not.toBeInTheDocument();
  });

  it("does not show warning for output nodes with empty name", () => {
    render(<InputNodeNameWarning nodeType="nodetool.output.TextOutput" name="" />);
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
      const { unmount } = render(<InputNodeNameWarning nodeType={nodeType} name="" />);
      expect(screen.getByText(/Name required/i)).toBeInTheDocument();
      unmount();
    });
  });
});
