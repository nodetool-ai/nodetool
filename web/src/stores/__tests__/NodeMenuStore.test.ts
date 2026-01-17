import { NodeMetadata } from "../ApiTypes";
import { useNodeMenuStore } from "../NodeMenuStore";

const createMockNodeMetadata = (overrides: Partial<NodeMetadata> = {}): NodeMetadata => ({
  type: "test_node",
  name: "Test Node",
  namespace: "test",
  description: "A test node",
  category: "test",
  inputs: [],
  outputs: [],
  default_values: {},
  expose_as_tool: false,
  ...overrides,
});

describe("NodeMenuStore", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useNodeMenuStore.setState({
      isMenuOpen: false,
      searchTerm: "",
      searchResults: [],
      allSearchMatches: [],
      groupedSearchResults: [],
      selectedPath: [],
      highlightedNamespaces: [],
      selectedInputType: "",
      selectedOutputType: "",
      selectedIndex: -1,
      showDocumentation: false,
      selectedNodeType: null,
      isLoading: false,
      searchResultsCache: {},
      dragToCreate: false,
      connectDirection: null,
      dropType: "",
      menuPosition: { x: 0, y: 0 },
      menuWidth: 0,
      menuHeight: 0,
      hoveredNode: null,
      currentSearchId: 0,
      closeBlockUntil: 0,
      clickPosition: { x: 0, y: 0 },
      documentationPosition: { x: 0, y: 0 },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("initializes with default values", () => {
      const state = useNodeMenuStore.getState();
      expect(state.isMenuOpen).toBe(false);
      expect(state.searchTerm).toBe("");
      expect(state.searchResults).toEqual([]);
      expect(state.allSearchMatches).toEqual([]);
      expect(state.groupedSearchResults).toEqual([]);
      expect(state.selectedPath).toEqual([]);
      expect(state.selectedIndex).toBe(-1);
      expect(state.showDocumentation).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe("menu visibility", () => {
    it("opens menu with correct parameters", () => {
      useNodeMenuStore.getState().openNodeMenu({
        x: 100,
        y: 200,
        searchTerm: "test",
      });

      const state = useNodeMenuStore.getState();
      expect(state.isMenuOpen).toBe(true);
      expect(state.searchTerm).toBe("test");
      expect(state.clickPosition).toEqual({ x: 100, y: 200 });
    });

    it("closes menu and resets state", () => {
      useNodeMenuStore.setState({
        isMenuOpen: true,
        searchTerm: "test",
        searchResults: [createMockNodeMetadata()],
        groupedSearchResults: [{ category: "test", nodes: [createMockNodeMetadata()] }],
        selectedPath: ["test"],
        highlightedNamespaces: ["test"],
      });

      useNodeMenuStore.getState().closeNodeMenu();

      const state = useNodeMenuStore.getState();
      expect(state.isMenuOpen).toBe(false);
      expect(state.searchTerm).toBe("");
      expect(state.searchResults).toEqual([]);
      expect(state.groupedSearchResults).toEqual([]);
      expect(state.selectedPath).toEqual([]);
      expect(state.highlightedNamespaces).toEqual([]);
    });

    it("does nothing when closing already closed menu", () => {
      const initialState = useNodeMenuStore.getState();
      useNodeMenuStore.getState().closeNodeMenu();
      expect(useNodeMenuStore.getState().isMenuOpen).toBe(initialState.isMenuOpen);
    });
  });

  describe("search functionality", () => {
    it("sets search term", () => {
      useNodeMenuStore.getState().setSearchTerm("test");
      expect(useNodeMenuStore.getState().searchTerm).toBe("test");
    });

    it("resets selected index when search term changes", () => {
      useNodeMenuStore.setState({ selectedIndex: 5 });
      useNodeMenuStore.getState().setSearchTerm("new");
      expect(useNodeMenuStore.getState().selectedIndex).toBe(-1);
    });

    it("sets selected input type", () => {
      useNodeMenuStore.getState().setSelectedInputType("text");
      expect(useNodeMenuStore.getState().selectedInputType).toBe("text");
    });

    it("sets selected output type", () => {
      useNodeMenuStore.getState().setSelectedOutputType("image");
      expect(useNodeMenuStore.getState().selectedOutputType).toBe("image");
    });

    it("sets selected path", () => {
      useNodeMenuStore.getState().setSelectedPath(["test", "sub"]);
      expect(useNodeMenuStore.getState().selectedPath).toEqual(["test", "sub"]);
    });

    it("sets highlighted namespaces", () => {
      useNodeMenuStore.getState().setHighlightedNamespaces(["a", "b", "c"]);
      expect(useNodeMenuStore.getState().highlightedNamespaces).toEqual(["a", "b", "c"]);
    });
  });

  describe("keyboard navigation", () => {
    it("sets selected index", () => {
      useNodeMenuStore.getState().setSelectedIndex(5);
      expect(useNodeMenuStore.getState().selectedIndex).toBe(5);
    });

    it("moves selection down when not at end", () => {
      useNodeMenuStore.setState({
        groupedSearchResults: [
          { category: "test", nodes: [createMockNodeMetadata(), createMockNodeMetadata({ type: "node2" })] }
        ],
        selectedIndex: 0,
      });

      useNodeMenuStore.getState().moveSelectionDown();
      expect(useNodeMenuStore.getState().selectedIndex).toBe(1);
    });

    it("wraps selection to start when at end", () => {
      useNodeMenuStore.setState({
        groupedSearchResults: [
          { category: "test", nodes: [createMockNodeMetadata(), createMockNodeMetadata({ type: "node2" })] }
        ],
        selectedIndex: 1,
      });

      useNodeMenuStore.getState().moveSelectionDown();
      expect(useNodeMenuStore.getState().selectedIndex).toBe(0);
    });

    it("moves selection up when not at start", () => {
      useNodeMenuStore.setState({
        groupedSearchResults: [
          { category: "test", nodes: [createMockNodeMetadata(), createMockNodeMetadata({ type: "node2" })] }
        ],
        selectedIndex: 1,
      });

      useNodeMenuStore.getState().moveSelectionUp();
      expect(useNodeMenuStore.getState().selectedIndex).toBe(0);
    });

    it("wraps selection to end when at start", () => {
      useNodeMenuStore.setState({
        groupedSearchResults: [
          { category: "test", nodes: [createMockNodeMetadata(), createMockNodeMetadata({ type: "node2" })] }
        ],
        selectedIndex: 0,
      });

      useNodeMenuStore.getState().moveSelectionUp();
      expect(useNodeMenuStore.getState().selectedIndex).toBe(1);
    });

    it("does not navigate when no results", () => {
      useNodeMenuStore.setState({
        groupedSearchResults: [],
        selectedIndex: -1,
      });

      useNodeMenuStore.getState().moveSelectionDown();
      expect(useNodeMenuStore.getState().selectedIndex).toBe(-1);
    });

    it("gets selected node", () => {
      const node = createMockNodeMetadata({ type: "selected" });
      useNodeMenuStore.setState({
        groupedSearchResults: [{ category: "test", nodes: [node] }],
        selectedIndex: 0,
      });

      const result = useNodeMenuStore.getState().getSelectedNode();
      expect(result).toEqual(node);
    });

    it("returns null when no node selected", () => {
      useNodeMenuStore.setState({
        groupedSearchResults: [],
        selectedIndex: -1,
      });

      const result = useNodeMenuStore.getState().getSelectedNode();
      expect(result).toBeNull();
    });
  });

  describe("documentation", () => {
    it("opens documentation", () => {
      useNodeMenuStore.getState().openDocumentation("test_node", { x: 100, y: 200 });
      const state = useNodeMenuStore.getState();
      expect(state.showDocumentation).toBe(true);
      expect(state.selectedNodeType).toBe("test_node");
      expect(state.documentationPosition).toEqual({ x: 100, y: 200 });
    });

    it("closes documentation", () => {
      useNodeMenuStore.setState({
        showDocumentation: true,
        selectedNodeType: "test_node",
      });

      useNodeMenuStore.getState().closeDocumentation();
      const state = useNodeMenuStore.getState();
      expect(state.showDocumentation).toBe(false);
      expect(state.selectedNodeType).toBe("test_node");
    });

    it("sets documentation position", () => {
      useNodeMenuStore.getState().setDocumentationPosition({ x: 50, y: 60 });
      expect(useNodeMenuStore.getState().documentationPosition).toEqual({ x: 50, y: 60 });
    });
  });

  describe("menu size and position", () => {
    it("sets menu position", () => {
      useNodeMenuStore.getState().setMenuPosition(100, 200);
      expect(useNodeMenuStore.getState().menuPosition).toEqual({ x: 100, y: 200 });
    });

    it("sets menu size", () => {
      useNodeMenuStore.getState().setMenuSize(500, 600);
      expect(useNodeMenuStore.getState().menuWidth).toBe(500);
      expect(useNodeMenuStore.getState().menuHeight).toBe(600);
    });
  });

  describe("drag to create", () => {
    it("sets drag to create state", () => {
      useNodeMenuStore.getState().setDragToCreate(true);
      expect(useNodeMenuStore.getState().dragToCreate).toBe(true);
    });

    it("sets connect direction", () => {
      useNodeMenuStore.getState().setConnectDirection("source");
      expect(useNodeMenuStore.getState().connectDirection).toBe("source");
    });

    it("sets connect direction with null", () => {
      useNodeMenuStore.getState().setConnectDirection(null);
      expect(useNodeMenuStore.getState().connectDirection).toBeNull();
    });
  });

  describe("hover state", () => {
    it("sets hovered node", () => {
      const node = createMockNodeMetadata({ type: "hovered" });
      useNodeMenuStore.getState().setHoveredNode(node);
      expect(useNodeMenuStore.getState().hoveredNode).toEqual(node);
    });

    it("clears hovered node", () => {
      useNodeMenuStore.setState({ hoveredNode: createMockNodeMetadata() });
      useNodeMenuStore.getState().setHoveredNode(null);
      expect(useNodeMenuStore.getState().hoveredNode).toBeNull();
    });
  });

  describe("selected node type", () => {
    it("sets selected node type", () => {
      useNodeMenuStore.getState().setSelectedNodeType("test_node");
      expect(useNodeMenuStore.getState().selectedNodeType).toBe("test_node");
    });

    it("clears selected node type", () => {
      useNodeMenuStore.setState({ selectedNodeType: "test_node" });
      useNodeMenuStore.getState().setSelectedNodeType(null);
      expect(useNodeMenuStore.getState().selectedNodeType).toBeNull();
    });
  });

  describe("update highlighted namespaces", () => {
    it("updates highlighted namespaces from results", () => {
      const nodes = [
        createMockNodeMetadata({ namespace: "test.nested.path1" }),
        createMockNodeMetadata({ namespace: "test.nested.path2" }),
      ];

      useNodeMenuStore.getState().updateHighlightedNamespaces(nodes);

      const state = useNodeMenuStore.getState();
      expect(state.highlightedNamespaces).toContain("test");
      expect(state.highlightedNamespaces).toContain("test.nested");
      expect(state.highlightedNamespaces).toContain("test.nested.path1");
      expect(state.highlightedNamespaces).toContain("test.nested.path2");
    });

    it("includes selected path in highlighted namespaces", () => {
      const nodes = [createMockNodeMetadata({ namespace: "other.path" })];
      useNodeMenuStore.setState({ selectedPath: ["test", "selected"] });

      useNodeMenuStore.getState().updateHighlightedNamespaces(nodes);

      const state = useNodeMenuStore.getState();
      expect(state.highlightedNamespaces).toContain("test");
      expect(state.highlightedNamespaces).toContain("test.selected");
    });
  });

  describe("search results management", () => {
    it("sets search results", () => {
      const nodes = [createMockNodeMetadata()];
      useNodeMenuStore.getState().setSearchResults(nodes);
      expect(useNodeMenuStore.getState().searchResults).toEqual(nodes);
    });

    it("sets current search id", () => {
      useNodeMenuStore.getState().setCurrentSearchId(5);
      expect(useNodeMenuStore.getState().currentSearchId).toBe(5);
    });
  });
});
