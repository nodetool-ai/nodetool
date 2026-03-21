import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { act } from "@testing-library/react";
import useQuickAddNodeStore from "../QuickAddNodeStore";
import { NodeMetadata } from "../ApiTypes";

// Mock the MetadataStore - needs to be set up before the store is imported
const mockMetadata: Record<string, NodeMetadata> = {
  "nodetool.image.GenerateImage": {
    title: "Generate Image",
    node_type: "nodetool.image.GenerateImage",
    namespace: "nodetool.image",
    description: "Generate images from text"
  } as NodeMetadata,
  "nodetool.image.UpscaleImage": {
    title: "Upscale Image",
    node_type: "nodetool.image.UpscaleImage",
    namespace: "nodetool.image",
    description: "Upscale images"
  } as NodeMetadata,
  "nodetool.text.GenerateText": {
    title: "Generate Text",
    node_type: "nodetool.text.GenerateText",
    namespace: "nodetool.text",
    description: "Generate text from prompts"
  } as NodeMetadata,
  "nodetool.video.CreateVideo": {
    title: "Create Video",
    node_type: "nodetool.video.CreateVideo",
    namespace: "nodetool.video",
    description: "Create videos from images"
  } as NodeMetadata
};

jest.mock("../MetadataStore", () => {
  return {
    __esModule: true,
    default: {
      getState: () => ({
        metadata: mockMetadata
      })
    }
  };
});

describe("QuickAddNodeStore", () => {
  beforeEach(() => {
    // Reset the store state
    act(() => {
      useQuickAddNodeStore.setState({
        isOpen: false,
        searchTerm: "",
        searchResults: [],
        selectedIndex: -1,
        selectedInputType: "",
        selectedOutputType: "",
        position: undefined
      });
    });
  });

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const state = useQuickAddNodeStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.searchTerm).toBe("");
      expect(state.searchResults).toEqual([]);
      expect(state.selectedIndex).toBe(-1);
      expect(state.selectedInputType).toBe("");
      expect(state.selectedOutputType).toBe("");
      expect(state.position).toBeUndefined();
    });
  });

  describe("openDialog", () => {
    it("should open the dialog with default state", () => {
      act(() => {
        useQuickAddNodeStore.getState().openDialog();
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.searchTerm).toBe("");
      expect(state.searchResults).toEqual([]);
      expect(state.selectedIndex).toBe(-1);
      expect(state.selectedInputType).toBe("");
      expect(state.selectedOutputType).toBe("");
    });

    it("should open the dialog with custom position", () => {
      const position = { x: 100, y: 200 };

      act(() => {
        useQuickAddNodeStore.getState().openDialog(position);
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.position).toEqual({ x: 100, y: 200 });
    });

    it("should use default position (0, 0) when partial coordinates provided", () => {
      act(() => {
        useQuickAddNodeStore.getState().openDialog({ x: 50 });
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.position).toEqual({ x: 50, y: 0 });
    });

    it("should reset existing state when opening dialog", () => {
      act(() => {
        useQuickAddNodeStore.setState({
          isOpen: true,
          searchTerm: "existing search",
          searchResults: [mockMetadata["nodetool.image.GenerateImage"]],
          selectedIndex: 0
        });
      });

      act(() => {
        useQuickAddNodeStore.getState().openDialog();
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.searchTerm).toBe("");
      expect(state.searchResults).toEqual([]);
      expect(state.selectedIndex).toBe(-1);
    });
  });

  describe("closeDialog", () => {
    it("should close the dialog and reset state", () => {
      act(() => {
        useQuickAddNodeStore.setState({
          isOpen: true,
          searchTerm: "test",
          searchResults: [mockMetadata["nodetool.image.GenerateImage"]],
          position: { x: 100, y: 100 }
        });
      });

      act(() => {
        useQuickAddNodeStore.getState().closeDialog();
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.searchTerm).toBe("");
      expect(state.searchResults).toEqual([]);
      expect(state.selectedIndex).toBe(-1);
      expect(state.position).toBeUndefined();
    });
  });

  describe("setSearchTerm", () => {
    it("should update search term immediately", () => {
      act(() => {
        useQuickAddNodeStore.getState().setSearchTerm("image");
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.searchTerm).toBe("image");
    });
  });

  describe("setSelectedIndex", () => {
    it("should set the selected index", () => {
      act(() => {
        useQuickAddNodeStore.setState({
          searchResults: [
            mockMetadata["nodetool.image.GenerateImage"],
            mockMetadata["nodetool.image.UpscaleImage"]
          ]
        });
      });

      act(() => {
        useQuickAddNodeStore.getState().setSelectedIndex(1);
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.selectedIndex).toBe(1);
    });
  });

  describe("moveSelectionUp", () => {
    it("should wrap to bottom when at top", () => {
      const results = [
        mockMetadata["nodetool.image.GenerateImage"],
        mockMetadata["nodetool.image.UpscaleImage"],
        mockMetadata["nodetool.text.GenerateText"]
      ];

      act(() => {
        useQuickAddNodeStore.setState({ searchResults: results, selectedIndex: 0 });
      });

      act(() => {
        useQuickAddNodeStore.getState().moveSelectionUp();
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.selectedIndex).toBe(2);
    });

    it("should move selection up when not at top", () => {
      const results = [
        mockMetadata["nodetool.image.GenerateImage"],
        mockMetadata["nodetool.image.UpscaleImage"],
        mockMetadata["nodetool.text.GenerateText"]
      ];

      act(() => {
        useQuickAddNodeStore.setState({ searchResults: results, selectedIndex: 2 });
      });

      act(() => {
        useQuickAddNodeStore.getState().moveSelectionUp();
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.selectedIndex).toBe(1);
    });

    it("should not move when there are no results", () => {
      act(() => {
        useQuickAddNodeStore.setState({ searchResults: [], selectedIndex: -1 });
      });

      act(() => {
        useQuickAddNodeStore.getState().moveSelectionUp();
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.selectedIndex).toBe(-1);
    });
  });

  describe("moveSelectionDown", () => {
    it("should wrap to top when at bottom", () => {
      const results = [
        mockMetadata["nodetool.image.GenerateImage"],
        mockMetadata["nodetool.image.UpscaleImage"],
        mockMetadata["nodetool.text.GenerateText"]
      ];

      act(() => {
        useQuickAddNodeStore.setState({ searchResults: results, selectedIndex: 2 });
      });

      act(() => {
        useQuickAddNodeStore.getState().moveSelectionDown();
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.selectedIndex).toBe(0);
    });

    it("should move selection down when not at bottom", () => {
      const results = [
        mockMetadata["nodetool.image.GenerateImage"],
        mockMetadata["nodetool.image.UpscaleImage"],
        mockMetadata["nodetool.text.GenerateText"]
      ];

      act(() => {
        useQuickAddNodeStore.setState({ searchResults: results, selectedIndex: 0 });
      });

      act(() => {
        useQuickAddNodeStore.getState().moveSelectionDown();
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.selectedIndex).toBe(1);
    });

    it("should not move when there are no results", () => {
      act(() => {
        useQuickAddNodeStore.setState({ searchResults: [], selectedIndex: -1 });
      });

      act(() => {
        useQuickAddNodeStore.getState().moveSelectionDown();
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.selectedIndex).toBe(-1);
    });
  });

  describe("getSelectedNode", () => {
    it("should return the selected node when index is valid", () => {
      const results = [
        mockMetadata["nodetool.image.GenerateImage"],
        mockMetadata["nodetool.image.UpscaleImage"]
      ];

      act(() => {
        useQuickAddNodeStore.setState({ searchResults: results, selectedIndex: 0 });
      });

      const selectedNode = useQuickAddNodeStore.getState().getSelectedNode();
      expect(selectedNode).toEqual(mockMetadata["nodetool.image.GenerateImage"]);
    });

    it("should return null when index is out of bounds", () => {
      act(() => {
        useQuickAddNodeStore.setState({
          searchResults: [mockMetadata["nodetool.image.GenerateImage"]],
          selectedIndex: 5
        });
      });

      const selectedNode = useQuickAddNodeStore.getState().getSelectedNode();
      expect(selectedNode).toBeNull();
    });

    it("should return null when index is -1", () => {
      act(() => {
        useQuickAddNodeStore.setState({
          searchResults: [mockMetadata["nodetool.image.GenerateImage"]],
          selectedIndex: -1
        });
      });

      const selectedNode = useQuickAddNodeStore.getState().getSelectedNode();
      expect(selectedNode).toBeNull();
    });

    it("should return null when there are no results", () => {
      act(() => {
        useQuickAddNodeStore.setState({ searchResults: [], selectedIndex: -1 });
      });

      const selectedNode = useQuickAddNodeStore.getState().getSelectedNode();
      expect(selectedNode).toBeNull();
    });
  });

  describe("resetFilters", () => {
    it("should reset all filter state", () => {
      act(() => {
        useQuickAddNodeStore.setState({
          searchTerm: "test",
          selectedInputType: "image",
          selectedOutputType: "text"
        });
      });

      act(() => {
        useQuickAddNodeStore.getState().resetFilters();
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.searchTerm).toBe("");
      expect(state.selectedInputType).toBe("");
      expect(state.selectedOutputType).toBe("");
    });
  });

  describe("setPosition", () => {
    it("should set the position", () => {
      const position = { x: 250, y: 350 };

      act(() => {
        useQuickAddNodeStore.getState().setPosition(position);
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.position).toEqual(position);
    });

    it("should update existing position", () => {
      act(() => {
        useQuickAddNodeStore.setState({ position: { x: 100, y: 100 } });
      });

      act(() => {
        useQuickAddNodeStore.getState().setPosition({ x: 200, y: 300 });
      });

      const state = useQuickAddNodeStore.getState();
      expect(state.position).toEqual({ x: 200, y: 300 });
    });
  });

  describe("setSelectedInputType and setSelectedOutputType", () => {
    it("should not throw when setting input type", () => {
      expect(() => {
        act(() => {
          useQuickAddNodeStore.getState().setSelectedInputType("image");
        });
      }).not.toThrow();
    });

    it("should not throw when setting output type", () => {
      expect(() => {
        act(() => {
          useQuickAddNodeStore.getState().setSelectedOutputType("text");
        });
      }).not.toThrow();
    });
  });
});
