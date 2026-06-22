import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { GetVariableBody } from "../GetVariableBody";
import { useGraphVariableNames } from "../useGraphVariables";
import mockTheme from "../../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

const mockSetProperty = jest.fn();
const mockSetPropertyComplete = jest.fn();

jest.mock("../useGraphVariables", () => ({
  useGraphVariableNames: jest.fn(() => [])
}));
const mockUseGraphVariableNames =
  useGraphVariableNames as jest.MockedFunction<typeof useGraphVariableNames>;

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
  });

  it("explains that it reads a variable set anywhere in the workflow", () => {
    renderWithTheme(<GetVariableBody {...makeProps()} />);
    expect(
      screen.getByText(
        /Reads a variable set by any Set Variable node in this workflow/i
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
