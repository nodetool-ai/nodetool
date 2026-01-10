import { act } from "@testing-library/react";
import { useQuickFavoritesPaletteStore } from "../QuickFavoritesPaletteStore";
import { useFavoriteNodesStore } from "../FavoriteNodesStore";
import useMetadataStore from "../MetadataStore";
import type { NodeMetadata } from "../ApiTypes";

describe("QuickFavoritesPaletteStore", () => {
  beforeEach(() => {
    act(() => {
      useQuickFavoritesPaletteStore.setState({
        isOpen: false,
        searchTerm: "",
        selectedIndex: 0,
        filteredFavorites: []
      });
      useFavoriteNodesStore.setState({ favorites: [] });
      useMetadataStore.setState({
        metadata: {},
        getMetadata: (): NodeMetadata | undefined => undefined
      });
    });
  });

  describe("open/close behavior", () => {
    it("opens the palette with all favorites", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node1");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node2");
        useQuickFavoritesPaletteStore.getState().openPalette();
      });

      const state = useQuickFavoritesPaletteStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.searchTerm).toBe("");
      expect(state.selectedIndex).toBe(0);
      expect(state.filteredFavorites).toHaveLength(2);
    });

    it("closes the palette and clears state", () => {
      act(() => {
        const store = useQuickFavoritesPaletteStore.getState();
        store.openPalette();
        store.setSearchTerm("test search");
        store.setSelectedIndex(5);
        store.closePalette();
      });

      const state = useQuickFavoritesPaletteStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.searchTerm).toBe("");
      expect(state.selectedIndex).toBe(0);
      expect(state.filteredFavorites).toHaveLength(0);
    });

    it("toggles the palette from closed to open", () => {
      const store = useQuickFavoritesPaletteStore.getState();
      expect(store.isOpen).toBe(false);

      store.togglePalette();
      expect(useQuickFavoritesPaletteStore.getState().isOpen).toBe(true);

      store.togglePalette();
      expect(useQuickFavoritesPaletteStore.getState().isOpen).toBe(false);
    });
  });

  describe("search functionality", () => {
    beforeEach(() => {
      act(() => {
        useMetadataStore.setState({
          metadata: {
            "nodetool.test.NodeA": {
              title: "Node A",
              node_type: "nodetool.test.NodeA",
              namespace: "nodetool.test",
              properties: [],
              layout: "default",
              outputs: [],
              description: "",
              the_model_info: {},
              recommended_models: [],
              basic_fields: [],
              is_dynamic: false,
              is_streaming_output: false,
              expose_as_tool: false,
              supports_dynamic_outputs: false
            },
            "nodetool.test.NodeB": {
              title: "Node B",
              node_type: "nodetool.test.NodeB",
              namespace: "nodetool.test",
              properties: [],
              layout: "default",
              outputs: [],
              description: "",
              the_model_info: {},
              recommended_models: [],
              basic_fields: [],
              is_dynamic: false,
              is_streaming_output: false,
              expose_as_tool: false,
              supports_dynamic_outputs: false
            }
          },
          getMetadata: (nodeType: string) => {
            return useMetadataStore.getState().metadata[nodeType] || null;
          }
        });
        useFavoriteNodesStore.setState({ favorites: [] });
      });
    });

    it("sets search term and filters favorites", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.NodeA");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.NodeB");
        const store = useQuickFavoritesPaletteStore.getState();
        store.openPalette();
        store.setSearchTerm("Node A");
      });

      const state = useQuickFavoritesPaletteStore.getState();
      expect(state.searchTerm).toBe("Node A");
      expect(state.filteredFavorites).toHaveLength(1);
      expect(state.filteredFavorites[0].nodeType).toBe("nodetool.test.NodeA");
    });

    it("resets selected index when search term changes", () => {
      act(() => {
        const store = useQuickFavoritesPaletteStore.getState();
        store.openPalette();
        store.setSelectedIndex(5);
        store.setSearchTerm("new search");
        expect(store.selectedIndex).toBe(0);
      });
    });

    it("searches by node type description", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.NodeA");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.NodeB");
        const store = useQuickFavoritesPaletteStore.getState();
        store.openPalette();
        store.setSearchTerm("nodetool");
      });

      const state = useQuickFavoritesPaletteStore.getState();
      expect(state.searchTerm).toBe("nodetool");
      expect(state.filteredFavorites).toHaveLength(2);
    });
  });

  describe("keyboard navigation", () => {
    beforeEach(() => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node1");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node2");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node3");
      });
    });

    it("sets selected index", () => {
      act(() => {
        useQuickFavoritesPaletteStore.getState().openPalette();
        useQuickFavoritesPaletteStore.getState().setSelectedIndex(3);
      });

      expect(useQuickFavoritesPaletteStore.getState().selectedIndex).toBe(3);
    });

    it("moves selection up", () => {
      act(() => {
        const store = useQuickFavoritesPaletteStore.getState();
        store.openPalette();
      });
      act(() => {
        const store = useQuickFavoritesPaletteStore.getState();
        store.setSelectedIndex(2);
        store.moveSelectionUp();
      });

      expect(useQuickFavoritesPaletteStore.getState().selectedIndex).toBe(1);
    });

    it("does not go below 0 when moving up from position 0", () => {
      act(() => {
        const store = useQuickFavoritesPaletteStore.getState();
        store.openPalette();
        store.setSelectedIndex(0);
        store.moveSelectionUp();
      });

      expect(useQuickFavoritesPaletteStore.getState().selectedIndex).toBe(0);
    });

    it("moves selection down", () => {
      act(() => {
        const store = useQuickFavoritesPaletteStore.getState();
        store.openPalette();
      });
      act(() => {
        const store = useQuickFavoritesPaletteStore.getState();
        store.setSelectedIndex(1);
        store.moveSelectionDown();
      });

      expect(useQuickFavoritesPaletteStore.getState().selectedIndex).toBe(2);
    });

    it("does not exceed filteredFavorites length when moving down from last position", () => {
      act(() => {
        const store = useQuickFavoritesPaletteStore.getState();
        store.openPalette();
        store.setSelectedIndex(2);
        store.moveSelectionDown();
      });

      expect(useQuickFavoritesPaletteStore.getState().selectedIndex).toBe(2);
    });
  });

  describe("getSelectedNode", () => {
    beforeEach(() => {
      act(() => {
        useMetadataStore.setState({
          metadata: {
            "nodetool.test.NodeA": {
              title: "Node A",
              node_type: "nodetool.test.NodeA",
              namespace: "nodetool.test",
              properties: [],
              layout: "default",
              outputs: [],
              description: "",
              the_model_info: {},
              recommended_models: [],
              basic_fields: [],
              is_dynamic: false,
              is_streaming_output: false,
              expose_as_tool: false,
              supports_dynamic_outputs: false
            }
          },
          getMetadata: (nodeType: string) => {
            return useMetadataStore.getState().metadata[nodeType] || null;
          }
        });
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.NodeA");
      });
    });

    it("returns null when palette is not open", () => {
      const result = useQuickFavoritesPaletteStore.getState().getSelectedNode();
      expect(result).toBeNull();
    });

    it("returns null when no favorites exist", () => {
      act(() => {
        useFavoriteNodesStore.setState({ favorites: [] });
        useQuickFavoritesPaletteStore.getState().openPalette();
      });

      const result = useQuickFavoritesPaletteStore.getState().getSelectedNode();
      expect(result).toBeNull();
    });

    it("returns null when selectedIndex is out of bounds", () => {
      act(() => {
        const store = useQuickFavoritesPaletteStore.getState();
        store.openPalette();
        store.setSelectedIndex(100);
      });

      const result = useQuickFavoritesPaletteStore.getState().getSelectedNode();
      expect(result).toBeNull();
    });

    it("returns null when selectedIndex is negative", () => {
      act(() => {
        const store = useQuickFavoritesPaletteStore.getState();
        store.openPalette();
        store.setSelectedIndex(-1);
      });

      const result = useQuickFavoritesPaletteStore.getState().getSelectedNode();
      expect(result).toBeNull();
    });

    it("returns metadata for selected node", () => {
      act(() => {
        useQuickFavoritesPaletteStore.getState().openPalette();
      });

      const result = useQuickFavoritesPaletteStore.getState().getSelectedNode();
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Node A");
      expect(result?.node_type).toBe("nodetool.test.NodeA");
    });

    it("returns null for non-existent node type", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.nonexistent.NodeX");
        useQuickFavoritesPaletteStore.getState().openPalette();
      });

      const result = useQuickFavoritesPaletteStore.getState().getSelectedNode();
      expect(result).toBeNull();
    });
  });
});

describe("QuickFavoritesPaletteStore favorites limit", () => {
  beforeEach(() => {
    act(() => {
      useQuickFavoritesPaletteStore.setState({
        isOpen: false,
        searchTerm: "",
        selectedIndex: 0,
        filteredFavorites: []
      });
      useFavoriteNodesStore.setState({ favorites: [] });
      useMetadataStore.setState({
        metadata: {},
        getMetadata: (): NodeMetadata | undefined => undefined
      });
    });
  });

  it("limits favorites when maximum is reached in FavoriteNodesStore", () => {
    act(() => {
      for (let i = 0; i < 15; i++) {
        useFavoriteNodesStore.getState().addFavorite(`nodetool.test.Node${i}`);
      }
      useQuickFavoritesPaletteStore.getState().openPalette();
    });

    const state = useQuickFavoritesPaletteStore.getState();
    expect(state.filteredFavorites.length).toBeLessThanOrEqual(12);
  });
});
