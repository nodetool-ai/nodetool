import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { PromptComposerBody } from "../PromptComposerBody";
import mockTheme from "../../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

const mockSetProperties = jest.fn();
const mockSetPropertyComplete = jest.fn();
const mockAddProperty = jest.fn();

jest.mock("../../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: jest.fn(() => ({
    setProperty: jest.fn(),
    setProperties: mockSetProperties,
    setPropertyComplete: mockSetPropertyComplete
  }))
}));

jest.mock("../../../../hooks/nodes/useDynamicProperty", () => ({
  useDynamicProperty: jest.fn(() => ({
    handleAddProperty: mockAddProperty,
    handleDeleteProperty: jest.fn(),
    handleUpdatePropertyName: jest.fn()
  }))
}));

jest.mock("../../../node/NodeInputs", () => ({
  __esModule: true,
  NodeInputs: () => <div data-testid="node-inputs" />
}));

jest.mock("../../../node/NodeOutputs", () => ({
  __esModule: true,
  NodeOutputs: () => <div data-testid="node-outputs" />
}));

jest.mock("../../../node/NodeProgress", () => ({
  __esModule: true,
  default: () => <div data-testid="node-progress" />
}));

const mockSearch = jest.fn().mockResolvedValue({ assets: [] });
jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: (selector: any) => selector({ search: mockSearch })
}));

const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  id: "node-1",
  nodeType: "nodetool.text.Prompt",
  nodeMetadata: {
    node_type: "nodetool.text.Prompt",
    properties: [],
    outputs: [{ name: "output", type: { type: "str" } }],
    is_dynamic: true
  } as unknown as Parameters<typeof PromptComposerBody>[0]["nodeMetadata"],
  data: {
    properties: { prompt: "Describe {{ subject }} in detail" },
    dynamic_properties: { subject: "" }
  } as unknown as Parameters<typeof PromptComposerBody>[0]["data"],
  workflowId: "wf-1",
  isOutputNode: false,
  ...overrides
});

describe("PromptComposerBody", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the composer placeholder when the prompt is empty", () => {
    renderWithTheme(
      <PromptComposerBody
        {...makeProps({
          data: { properties: { prompt: "" }, dynamic_properties: {} }
        })}
      />
    );
    expect(
      screen.getByText("Write a prompt… @ to mention an asset")
    ).toBeInTheDocument();
  });

  it("renders an insert chip for each dynamic input", () => {
    renderWithTheme(<PromptComposerBody {...makeProps()} />);
    expect(
      screen.getByLabelText("Insert variable subject")
    ).toBeInTheDocument();
  });

  it("loads the existing prompt text into the composer", () => {
    const { container } = renderWithTheme(
      <PromptComposerBody {...makeProps()} />
    );
    const input = container.querySelector(".composer-input");
    expect(input).not.toBeNull();
    expect(input?.textContent).toContain("Describe");
    expect(input?.textContent).toContain("in detail");
  });
});
