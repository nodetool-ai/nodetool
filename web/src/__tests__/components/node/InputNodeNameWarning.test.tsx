import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import type { Node } from "@xyflow/react";
import mockTheme from "../../../__mocks__/themeMock";
import InputNodeNameWarning from "../../../components/node/InputNodeNameWarning";
import { NodeProvider } from "../../../contexts/NodeContext";
import type { NodeData } from "../../../stores/NodeData";
import { createNodeStore } from "../../../stores/NodeStore";

const renderWithTheme = (
  component: React.ReactNode,
  nodes: Node<NodeData>[] = []
) => {
  const store = createNodeStore(undefined, { nodes });
  return render(
    <ThemeProvider theme={mockTheme}>
      <NodeProvider createStore={() => store}>{component}</NodeProvider>
    </ThemeProvider>
  );
};

const input = (id: string, name: string): Node<NodeData> => ({
  id,
  type: "nodetool.input.StringInput",
  position: { x: 0, y: 0 },
  data: {
    properties: { name },
    selectable: true,
    dynamic_properties: {},
    workflow_id: "wf"
  }
});

describe("InputNodeNameWarning", () => {
  it("shows warning for input node with empty name", () => {
    renderWithTheme(<InputNodeNameWarning nodeId="a" nodeType="nodetool.input.StringInput" name="" />);
    expect(screen.getByText(/Name required/i)).toBeInTheDocument();
  });

  it("shows warning for input node with undefined name", () => {
    renderWithTheme(<InputNodeNameWarning nodeId="a" nodeType="nodetool.input.IntegerInput" name={undefined} />);
    expect(screen.getByText(/Name required/i)).toBeInTheDocument();
  });

  it("shows warning for input node with whitespace-only name", () => {
    renderWithTheme(<InputNodeNameWarning nodeId="a" nodeType="nodetool.input.FloatInput" name="   " />);
    expect(screen.getByText(/Name required/i)).toBeInTheDocument();
  });

  it("does not show warning for input node with valid name", () => {
    renderWithTheme(<InputNodeNameWarning nodeId="a" nodeType="nodetool.input.StringInput" name="my_input" />);
    expect(screen.queryByText(/Name required/i)).not.toBeInTheDocument();
  });

  it("does not show warning for non-input nodes", () => {
    renderWithTheme(<InputNodeNameWarning nodeId="a" nodeType="nodetool.text.Concat" name="" />);
    expect(screen.queryByText(/Name required/i)).not.toBeInTheDocument();
  });

  it("does not show warning for output nodes with empty name", () => {
    renderWithTheme(<InputNodeNameWarning nodeId="a" nodeType="nodetool.output.TextOutput" name="" />);
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
      const { unmount } = renderWithTheme(<InputNodeNameWarning nodeId="a" nodeType={nodeType} name="" />);
      expect(screen.getByText(/Name required/i)).toBeInTheDocument();
      unmount();
    });
  });

  it("warns when another input has the same name", () => {
    renderWithTheme(
      <InputNodeNameWarning nodeId="a" nodeType="nodetool.input.StringInput" name="prompt" />,
      [input("a", "prompt"), input("b", "prompt")]
    );
    expect(screen.getByText("Duplicate name")).toBeInTheDocument();
  });

  it("does not warn when the other inputs use other names", () => {
    renderWithTheme(
      <InputNodeNameWarning nodeId="a" nodeType="nodetool.input.StringInput" name="prompt" />,
      [input("a", "prompt"), input("b", "style")]
    );
    expect(screen.queryByText("Duplicate name")).not.toBeInTheDocument();
  });
});
