import { act } from "@testing-library/react";
import { useAISuggestionsStore, NodeSuggestion } from "../AISuggestionsStore";
import { NodeMetadata } from "../ApiTypes";

describe("AISuggestionsStore", () => {
  beforeEach(() => {
    useAISuggestionsStore.setState({
      suggestions: [],
      isLoading: false,
      error: null
    });
  });

  it("initializes with empty default state", () => {
    expect(useAISuggestionsStore.getState().suggestions).toEqual([]);
    expect(useAISuggestionsStore.getState().isLoading).toBe(false);
    expect(useAISuggestionsStore.getState().error).toBeNull();
  });

  describe("setSuggestions", () => {
    it("sets suggestions and clears loading/error state", () => {
      const mockSuggestions: NodeSuggestion[] = [
        {
          nodeType: "nodetool.base.Preview",
          reason: "Add a Preview node to visualize output",
          confidence: 0.8,
          metadata: createMockMetadata("nodetool.base.Preview")
        }
      ];

      act(() => {
        useAISuggestionsStore.getState().setSuggestions(mockSuggestions);
      });

      expect(useAISuggestionsStore.getState().suggestions).toEqual(mockSuggestions);
      expect(useAISuggestionsStore.getState().isLoading).toBe(false);
      expect(useAISuggestionsStore.getState().error).toBeNull();
    });

    it("overwrites existing suggestions", () => {
      const initialSuggestions: NodeSuggestion[] = [
        {
          nodeType: "nodetool.base.Preview",
          reason: "Initial suggestion",
          confidence: 0.5,
          metadata: createMockMetadata("nodetool.base.Preview")
        }
      ];

      const updatedSuggestions: NodeSuggestion[] = [
        {
          nodeType: "nodetool.text.TextLength",
          reason: "Updated suggestion",
          confidence: 0.9,
          metadata: createMockMetadata("nodetool.text.TextLength")
        }
      ];

      act(() => {
        useAISuggestionsStore.getState().setSuggestions(initialSuggestions);
      });
      act(() => {
        useAISuggestionsStore.getState().setSuggestions(updatedSuggestions);
      });

      expect(useAISuggestionsStore.getState().suggestions).toEqual(updatedSuggestions);
      expect(useAISuggestionsStore.getState().suggestions).toHaveLength(1);
    });

    it("handles empty suggestions array", () => {
      const mockSuggestions: NodeSuggestion[] = [
        {
          nodeType: "nodetool.base.Preview",
          reason: "Some suggestion",
          confidence: 0.8,
          metadata: createMockMetadata("nodetool.base.Preview")
        }
      ];

      act(() => {
        useAISuggestionsStore.getState().setSuggestions(mockSuggestions);
      });
      act(() => {
        useAISuggestionsStore.getState().setSuggestions([]);
      });

      expect(useAISuggestionsStore.getState().suggestions).toEqual([]);
    });
  });

  describe("clearSuggestions", () => {
    it("clears all suggestions and resets state", () => {
      const mockSuggestions: NodeSuggestion[] = [
        {
          nodeType: "nodetool.base.Preview",
          reason: "Some suggestion",
          confidence: 0.8,
          metadata: createMockMetadata("nodetool.base.Preview")
        }
      ];

      act(() => {
        useAISuggestionsStore.getState().setSuggestions(mockSuggestions);
      });
      act(() => {
        useAISuggestionsStore.getState().clearSuggestions();
      });

      expect(useAISuggestionsStore.getState().suggestions).toEqual([]);
      expect(useAISuggestionsStore.getState().isLoading).toBe(false);
      expect(useAISuggestionsStore.getState().error).toBeNull();
    });
  });

  describe("setLoading", () => {
    it("sets loading state to true", () => {
      act(() => {
        useAISuggestionsStore.getState().setLoading(true);
      });

      expect(useAISuggestionsStore.getState().isLoading).toBe(true);
    });

    it("sets loading state to false", () => {
      act(() => {
        useAISuggestionsStore.getState().setLoading(true);
      });
      act(() => {
        useAISuggestionsStore.getState().setLoading(false);
      });

      expect(useAISuggestionsStore.getState().isLoading).toBe(false);
    });
  });

  describe("setError", () => {
    it("sets error state and clears loading", () => {
      act(() => {
        useAISuggestionsStore.getState().setError("Failed to load suggestions");
      });

      expect(useAISuggestionsStore.getState().error).toBe("Failed to load suggestions");
      expect(useAISuggestionsStore.getState().isLoading).toBe(false);
    });

    it("clears error when passed null", () => {
      act(() => {
        useAISuggestionsStore.getState().setError("Some error");
      });
      act(() => {
        useAISuggestionsStore.getState().setError(null);
      });

      expect(useAISuggestionsStore.getState().error).toBeNull();
    });
  });

  describe("multiple operations", () => {
    it("handles loading then suggestions flow", () => {
      act(() => {
        useAISuggestionsStore.getState().setLoading(true);
      });
      expect(useAISuggestionsStore.getState().isLoading).toBe(true);

      const mockSuggestions: NodeSuggestion[] = [
        {
          nodeType: "nodetool.base.Preview",
          reason: "Preview output",
          confidence: 0.7,
          metadata: createMockMetadata("nodetool.base.Preview")
        }
      ];

      act(() => {
        useAISuggestionsStore.getState().setSuggestions(mockSuggestions);
      });

      expect(useAISuggestionsStore.getState().suggestions).toEqual(mockSuggestions);
      expect(useAISuggestionsStore.getState().isLoading).toBe(false);
      expect(useAISuggestionsStore.getState().error).toBeNull();
    });

    it("handles error after loading", () => {
      act(() => {
        useAISuggestionsStore.getState().setLoading(true);
      });
      expect(useAISuggestionsStore.getState().isLoading).toBe(true);

      act(() => {
        useAISuggestionsStore.getState().setError("Network error");
      });

      expect(useAISuggestionsStore.getState().isLoading).toBe(false);
      expect(useAISuggestionsStore.getState().error).toBe("Network error");
      expect(useAISuggestionsStore.getState().suggestions).toEqual([]);
    });
  });
});

function createMockMetadata(nodeType: string): NodeMetadata {
  return {
    node_type: nodeType,
    description: `Mock description for ${nodeType}`,
    namespace: nodeType.split(".")[1] || "mock",
    title: nodeType.split(".").pop() || "Mock",
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
    type: nodeType,
    category: "output",
    display_name: nodeType.split(".").pop() || "Mock",
    inputs: [
      {
        name: "input",
        type: "any",
        accepts: ["any"],
        required: false,
        optional: true
      }
    ]
  };
}
