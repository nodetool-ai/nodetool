import { renderHook, act } from "@testing-library/react";
import { Node } from "@xyflow/react";
import { useCanvasSearch } from "../../hooks/useCanvasSearch";
import { useNodes } from "../../contexts/NodeContext";
import useCanvasSearchStore from "../../stores/CanvasSearchStore";

const mockNodes: Node[] = [
  {
    id: "node-1",
    type: "text",
    position: { x: 0, y: 0 },
    data: { title: "Text Input Node" }
  },
  {
    id: "node-2",
    type: "llm",
    position: { x: 100, y: 100 },
    data: { title: "LLM Processor" }
  },
  {
    id: "node-3",
    type: "image",
    position: { x: 200, y: 200 },
    data: { title: "Image Generator" }
  }
];

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn((selector) => {
    const result = selector({ nodes: mockNodes });
    return result !== undefined ? result : { nodes: mockNodes };
  })
}));

describe("useCanvasSearch", () => {
  beforeEach(() => {
    useCanvasSearchStore.setState({
      isSearchOpen: false,
      searchTerm: "",
      searchResults: [],
      selectedResultIndex: -1,
      highlightedNodeIds: []
    });
  });

  it("should open search when openSearch is called", () => {
    const { result } = renderHook(() => useCanvasSearch());

    act(() => {
      result.current.openSearch();
    });

    expect(result.current.isSearchOpen).toBe(true);
  });

  it("should close search when closeSearch is called", () => {
    const { result } = renderHook(() => useCanvasSearch());

    act(() => {
      result.current.openSearch();
      result.current.closeSearch();
    });

    expect(result.current.isSearchOpen).toBe(false);
  });

  it("should update search results when search term changes", () => {
    const { result } = renderHook(() => useCanvasSearch());

    act(() => {
      result.current.openSearch();
      result.current.handleSearchTermChange("text");
    });

    expect(result.current.searchResults.length).toBeGreaterThan(0);
    expect(result.current.searchResults[0].node.data.title).toContain("Text");
  });

  it("should clear search results when search term is empty", () => {
    const { result } = renderHook(() => useCanvasSearch());

    act(() => {
      result.current.openSearch();
      result.current.handleSearchTermChange("text");
      result.current.handleSearchTermChange("");
    });

    expect(result.current.searchResults).toEqual([]);
  });

  it("should highlight matching nodes", () => {
    const { result } = renderHook(() => useCanvasSearch());

    act(() => {
      result.current.openSearch();
      result.current.handleSearchTermChange("LLM");
    });

    expect(result.current.highlightedNodeIds).toContain("node-2");
  });
});
