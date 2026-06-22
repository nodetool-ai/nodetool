import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { GetVariableBody } from "../GetVariableBody";
import {
  useGraphVariableNames,
  useGraphVariableTypes
} from "../useGraphVariables";
import mockTheme from "../../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

const mockSetProperty = jest.fn();
const mockSetPropertyComplete = jest.fn();
const mockUpdateNodeData = jest.fn();

jest.mock("../useGraphVariables", () => ({
  useGraphVariableNames: jest.fn(() => []),
  useGraphVariableTypes: jest.fn(() => new Map())
}));
const mockUseGraphVariableNames =
  useGraphVariableNames as jest.MockedFunction<typeof useGraphVariableNames>;
const mockUseGraphVariableTypes =
  useGraphVariableTypes as jest.MockedFunction<typeof useGraphVariableTypes>;

jest.mock("../../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: { updateNodeData: jest.Mock }) => unknown) =>
    selector({ updateNodeData: mockUpdateNodeData })
}));

jest.mock("../../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: jest.fn(() => ({
    setProperty: mockSetProperty,
    setProperties: jest.fn(),
    setPropertyComplete: mockSetPropertyComplete
  }))
}));

jest.mock("../../../node/HandleColumn", () => ({
  __esModule: true,
  default: () => <div data-testid="handle-column" />
}));

jest.mock("../../../node/NodeOutputs", () => ({
  __esModule: true,
  NodeOutputs: () => <div data-testid="node-outputs" />
}));

jest.mock("../../../node/NodeProgress", () => ({
  __esModule: true,
  default: () => <div data-testid="node-progress" />
}));

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  id: "get-1",
  nodeType: "nodetool.variable.GetVariable",
  nodeMetadata: {
    node_type: "nodetool.variable.GetVariable",
    properties: [
      { name: "name", type: { type: "str" } },
      { name: "trigger", type: { type: "any" } }
    ],
    outputs: [{ name: "output", type: { type: "any" } }]
  } as unknown as Parameters<typeof GetVariableBody>[0]["nodeMetadata"],
  data: {
    properties: { name: "" }
  } as unknown as Parameters<typeof GetVariableBody>[0]["data"],
  workflowId: "wf-1",
  isOutputNode: false,
  ...overrides
});

describe("GetVariableBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGraphVariableNames.mockReturnValue([]);
    mockUseGraphVariableTypes.mockReturnValue(new Map());
  });

  it("persists the inferred variable type onto its output handle", () => {
    mockUseGraphVariableNames.mockReturnValue(["subject"]);
    mockUseGraphVariableTypes.mockReturnValue(
      new Map([
        ["subject", { type: "image", optional: false, type_args: [] }]
      ])
    );
    renderWithTheme(
      <GetVariableBody
        {...makeProps({ data: { properties: { name: "subject" } } })}
      />
    );
    expect(mockUpdateNodeData).toHaveBeenCalledWith(
      "get-1",
      expect.objectContaining({
        dynamic_outputs: expect.objectContaining({
          output: expect.objectContaining({ type: "image" })
        })
      })
    );
  });

  it("explains that it reads a variable published anywhere in the workflow", () => {
    renderWithTheme(<GetVariableBody {...makeProps()} />);
    expect(
      screen.getByText(
        /Reads a variable published by any Set Variable node in this workflow/i
      )
    ).toBeInTheDocument();
  });

  it("shows a hint when no variables are defined", () => {
    renderWithTheme(<GetVariableBody {...makeProps()} />);
    expect(
      screen.getByText(/No variables defined yet/i)
    ).toBeInTheDocument();
  });

  it("renders the picker (not the hint) when variables are defined", () => {
    mockUseGraphVariableNames.mockReturnValue(["alpha", "beta"]);
    renderWithTheme(<GetVariableBody {...makeProps()} />);
    expect(
      screen.queryByText(/No variables defined yet/i)
    ).not.toBeInTheDocument();
    // The Variable picker label is shown.
    expect(screen.getByText("Variable")).toBeInTheDocument();
  });

  it("renders an input handle column and an output row", () => {
    renderWithTheme(<GetVariableBody {...makeProps()} />);
    expect(screen.getByTestId("handle-column")).toBeInTheDocument();
    expect(screen.getByTestId("node-outputs")).toBeInTheDocument();
  });
});
