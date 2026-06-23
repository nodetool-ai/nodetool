/**
 * Regression test for the stale-prompt bug: editing a `nodetool.text.Prompt`
 * node and running the graph could send the node's *previous* text downstream.
 *
 * The cause was a 400ms debounce on the store write — a run dispatched within
 * that window read the stale value. These tests assert the edited prompt is
 * committed to the store *synchronously* (no timers advanced), so any run sees
 * the current text.
 *
 * The OnChangePlugin is mocked to capture the editor's change handler so the
 * test can drive an edit without simulating typing into Lexical's
 * contentEditable in jsdom; $serializePrompt is overridden so the captured
 * serialized text is controllable (the rest of promptEditorState is kept real
 * via requireActual). The asset-mention/drop plugins are stubbed out — they're
 * irrelevant to the commit behaviour and only add weight to the render.
 */
import React from "react";
import { render, act } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PromptComposerBody } from "../PromptComposerBody";
import mockTheme from "../../../../__mocks__/themeMock";
import "@testing-library/jest-dom";

const mockSetProperties = jest.fn();

// Captures the OnChangePlugin `onChange` so a test can simulate an editor edit.
const mockOnChangeHolder: { current: ((state: unknown) => void) | null } = {
  current: null
};
jest.mock("@lexical/react/LexicalOnChangePlugin", () => ({
  OnChangePlugin: ({ onChange }: { onChange: (state: unknown) => void }) => {
    mockOnChangeHolder.current = onChange;
    return null;
  }
}));

// Controls what the editor serializes to; reassigned per test. Only
// $serializePrompt is overridden so it doesn't need a live Lexical read
// context — the other exports stay real (the asset plugins import
// $insertAssetMention from here).
let mockSerialized = "";
jest.mock("../promptComposer/promptEditorState", () => ({
  ...jest.requireActual("../promptComposer/promptEditorState"),
  $serializePrompt: () => mockSerialized
}));

// The asset typeahead/drop plugins don't participate in committing the prompt;
// stub them so the editor stays light.
jest.mock("../promptComposer/AssetMentionPlugin", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../promptComposer/AssetDropPlugin", () => ({
  __esModule: true,
  default: () => null
}));

jest.mock("../../../../hooks/nodes/useBespokePropertyWriter", () => ({
  useBespokePropertyWriter: () => ({
    setProperty: jest.fn(),
    setProperties: mockSetProperties,
    setPropertyComplete: jest.fn()
  })
}));

jest.mock("../useGraphVariables", () => ({
  useGraphVariableNames: () => []
}));

jest.mock("../../../../hooks/nodes/useDynamicProperty", () => ({
  useDynamicProperty: () => ({
    handleAddProperty: jest.fn(),
    handleDeleteProperty: jest.fn(),
    handleUpdatePropertyName: jest.fn()
  })
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

const makeProps = (initialPrompt: string) =>
  ({
    id: "node-1",
    nodeType: "nodetool.text.Prompt",
    nodeMetadata: {
      node_type: "nodetool.text.Prompt",
      properties: [],
      outputs: [{ name: "output", type: { type: "str" } }],
      supports_dynamic_inputs: true
    },
    data: {
      properties: { prompt: initialPrompt },
      dynamic_properties: {}
    },
    workflowId: "wf-1",
    isOutputNode: false
  }) as unknown as Parameters<typeof PromptComposerBody>[0];

// A stand-in for Lexical's EditorState whose `read` simply runs the callback;
// $serializePrompt is mocked, so no Lexical context is required.
const fakeEditorState = { read: (cb: () => void) => cb() };

describe("PromptComposerBody store commit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnChangeHolder.current = null;
    mockSerialized = "";
  });

  it("commits an edited prompt to the store synchronously (no debounce)", () => {
    renderWithTheme(<PromptComposerBody {...makeProps("")} />);
    expect(mockOnChangeHolder.current).toBeTruthy();

    mockSerialized = "fresh prompt text";
    act(() => {
      mockOnChangeHolder.current?.(fakeEditorState);
    });

    // Asserted without advancing any timers — proves the write is immediate.
    expect(mockSetProperties).toHaveBeenCalledWith({
      prompt: "fresh prompt text"
    });
  });

  it("does not write when the serialized text is unchanged", () => {
    renderWithTheme(<PromptComposerBody {...makeProps("hello")} />);
    expect(mockOnChangeHolder.current).toBeTruthy();

    // Selection-only change: serialized text matches the last written value.
    mockSerialized = "hello";
    act(() => {
      mockOnChangeHolder.current?.(fakeEditorState);
    });

    expect(mockSetProperties).not.toHaveBeenCalled();
  });
});
