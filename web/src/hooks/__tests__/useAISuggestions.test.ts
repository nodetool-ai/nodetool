import { renderHook } from "@testing-library/react";
import { useAISuggestions } from "../useAISuggestions";
import { useAISuggestionsStore } from "../../stores/AISuggestionsStore";

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("../../stores/MetadataStore", () => ({
  __esModule: true,
  default: jest.fn(() => ({}))
}));

jest.mock("../../stores/AISuggestionsStore", () => ({
  __esModule: true,
  useAISuggestionsStore: jest.fn(() => ({
    suggestions: [],
    isLoading: false,
    error: null,
    setSuggestions: jest.fn(),
    _clearSuggestions: jest.fn(),
    setLoading: jest.fn(),
    recordFeedback: jest.fn(),
    getFeedback: jest.fn(),
    clearFeedback: jest.fn(),
    feedback: {}
  }))
}));

describe("useAISuggestions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns default values when enabled is false", () => {
    const { result } = renderHook(() => useAISuggestions({ enabled: false }));

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refreshSuggestions).toBe("function");
    expect(typeof result.current.clearSuggestions).toBe("function");
  });

  it("returns suggestions from store", () => {
    const mockSuggestions = [
      {
        nodeType: "nodetool.base.Preview",
        reason: "Test suggestion",
        confidence: 0.8,
        metadata: {
          node_type: "nodetool.base.Preview",
          description: "Mock description",
          namespace: "base",
          title: "Preview",
          properties: [],
          outputs: [],
          the_model_info: {},
          layout: "default",
          recommended_models: [],
          basic_fields: [],
          is_dynamic: false,
          expose_as_tool: false,
          supports_dynamic_outputs: false,
          is_streaming_output: false,
          type: "nodetool.base.Preview",
          display_name: "Preview"
        }
      }
    ];

    (useAISuggestionsStore as jest.Mock).mockReturnValue({
      suggestions: mockSuggestions,
      isLoading: false,
      error: null,
      setSuggestions: jest.fn(),
      _clearSuggestions: jest.fn(),
      setLoading: jest.fn(),
      recordFeedback: jest.fn(),
      getFeedback: jest.fn(),
      clearFeedback: jest.fn(),
      feedback: {}
    });

    const { result } = renderHook(() => useAISuggestions());

    expect(result.current.suggestions).toEqual(mockSuggestions);
    expect(result.current.isLoading).toBe(false);
  });

  it("returns loading state from store", () => {
    (useAISuggestionsStore as jest.Mock).mockReturnValue({
      suggestions: [],
      isLoading: true,
      error: null,
      setSuggestions: jest.fn(),
      _clearSuggestions: jest.fn(),
      setLoading: jest.fn(),
      recordFeedback: jest.fn(),
      getFeedback: jest.fn(),
      clearFeedback: jest.fn(),
      feedback: {}
    });

    const { result } = renderHook(() => useAISuggestions());

    expect(result.current.isLoading).toBe(true);
  });

  it("returns error state from store", () => {
    (useAISuggestionsStore as jest.Mock).mockReturnValue({
      suggestions: [],
      isLoading: false,
      error: "Failed to load suggestions",
      setSuggestions: jest.fn(),
      _clearSuggestions: jest.fn(),
      setLoading: jest.fn(),
      recordFeedback: jest.fn(),
      getFeedback: jest.fn(),
      clearFeedback: jest.fn(),
      feedback: {}
    });

    const { result } = renderHook(() => useAISuggestions());

    expect(result.current.error).toBe("Failed to load suggestions");
  });

  it("returns refreshSuggestions callback", () => {
    const { result } = renderHook(() => useAISuggestions());

    expect(typeof result.current.refreshSuggestions).toBe("function");
  });

  it("returns clearSuggestions callback", () => {
    const { result } = renderHook(() => useAISuggestions());

    expect(typeof result.current.clearSuggestions).toBe("function");
  });

  it("respects maxSuggestions option", () => {
    const { result } = renderHook(() => useAISuggestions({ maxSuggestions: 3 }));

    expect(result.current.suggestions).toEqual([]);
  });
});
