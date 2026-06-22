import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { GetVariableBody } from "../GetVariableBody";
import { useUpstreamVariableNames } from "../useUpstreamVariables";
import mockTheme from "../../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

const mockSetProperty = jest.fn();
const mockSetPropertyComplete = jest.fn();

jest.mock("../useUpstreamVariables", () => ({
  useUpstreamVariableNames: jest.fn(() => [])
}));
const mockUseUpstreamVariableNames =
  useUpstreamVariableNames as jest.MockedFunction<
    typeof useUpstreamVariableNames
  >;

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
    mockUseUpstreamVariableNames.mockReturnValue([]);
  });

  it("explains the upstream-only behaviour", () => {
    renderWithTheme(<GetVariableBody {...makeProps()} />);
    expect(
      screen.getByText(/Only variables set\s+upstream of this node are available/i)
    ).toBeInTheDocument();
  });

  it("shows a hint when no variables are set upstream", () => {
    renderWithTheme(<GetVariableBody {...makeProps()} />);
    expect(
      screen.getByText(/No variables set upstream/i)
    ).toBeInTheDocument();
  });

  it("renders the picker (not the hint) when variables are set upstream", () => {
    mockUseUpstreamVariableNames.mockReturnValue(["alpha", "beta"]);
    renderWithTheme(<GetVariableBody {...makeProps()} />);
    expect(
      screen.queryByText(/No variables set upstream/i)
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
