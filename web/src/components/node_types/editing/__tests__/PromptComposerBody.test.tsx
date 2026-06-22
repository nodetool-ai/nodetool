import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PromptComposerBody } from "../PromptComposerBody";
import { useUpstreamVariableNames } from "../useUpstreamVariables";
import mockTheme from "../../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

const mockSetProperties = jest.fn();
const mockSetPropertyComplete = jest.fn();
const mockAddProperty = jest.fn();

jest.mock("../useUpstreamVariables", () => ({
  useUpstreamVariableNames: jest.fn(() => [])
}));
const mockUseUpstreamVariableNames =
  useUpstreamVariableNames as jest.MockedFunction<
    typeof useUpstreamVariableNames
  >;

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
const mockGet = jest.fn();
jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: (selector: any) =>
    selector({ search: mockSearch, get: mockGet })
}));

const renderWithTheme = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>
    </QueryClientProvider>
  );
};

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  id: "node-1",
  nodeType: "nodetool.text.Prompt",
  nodeMetadata: {
    node_type: "nodetool.text.Prompt",
    properties: [],
    outputs: [{ name: "output", type: { type: "str" } }],
    supports_dynamic_inputs: true
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
    mockUseUpstreamVariableNames.mockReturnValue([]);
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

  it("renders a variable chip decorator inside the composer body", async () => {
    const { container } = renderWithTheme(
      <PromptComposerBody {...makeProps()} />
    );
    await waitFor(() => {
      const chip = container.querySelector(".prompt-variable-chip");
      expect(chip).not.toBeNull();
      expect(chip?.textContent).toContain("subject");
    });
  });

  it("shows the Variables label when the prompt references a variable", () => {
    renderWithTheme(<PromptComposerBody {...makeProps()} />);
    expect(screen.getByText("Variables")).toBeInTheDocument();
  });

  it("hides the Variables label when the prompt references none", () => {
    renderWithTheme(
      <PromptComposerBody
        {...makeProps({
          data: {
            properties: { prompt: "what is this?" },
            dynamic_properties: {}
          }
        })}
      />
    );
    expect(screen.queryByText("Variables")).not.toBeInTheDocument();
  });

  it("offers an insert chip for a variable set by an upstream Set Variable node", () => {
    mockUseUpstreamVariableNames.mockReturnValue(["theme"]);
    renderWithTheme(
      <PromptComposerBody
        {...makeProps({
          data: { properties: { prompt: "" }, dynamic_properties: {} }
        })}
      />
    );
    expect(
      screen.getByLabelText("Insert upstream variable theme")
    ).toBeInTheDocument();
  });

  it("does not duplicate a variable that is both an input and set upstream", () => {
    mockUseUpstreamVariableNames.mockReturnValue(["subject"]);
    renderWithTheme(<PromptComposerBody {...makeProps()} />);
    // The dynamic input "subject" wins; no separate upstream chip is added.
    expect(
      screen.getByLabelText("Insert variable subject")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Insert upstream variable subject")
    ).not.toBeInTheDocument();
  });

  it("renders an inline image preview for an asset URN in the prompt", async () => {
    mockGet.mockResolvedValue({
      id: "abc123",
      content_type: "image/png",
      get_url: "https://example.test/abc123.png"
    });
    const { container } = renderWithTheme(
      <PromptComposerBody
        {...makeProps({
          data: {
            properties: { prompt: "look at asset://abc123.png here" },
            dynamic_properties: {}
          }
        })}
      />
    );
    await waitFor(() => {
      const img = container.querySelector(".asset-mention-preview img");
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe(
        "https://example.test/abc123.png"
      );
    });
    expect(mockGet).toHaveBeenCalledWith("abc123");
  });
});
