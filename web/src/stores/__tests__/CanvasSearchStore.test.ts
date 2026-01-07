import { create } from "zustand";
import { Node } from "@xyflow/react";
import {
  createCanvasSearchStore,
  CanvasSearchStore
} from "../CanvasSearchStore";

const createMockNode = (id: string, type: string, title: string): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { title }
});

const mockNodes: Node[] = [
  createMockNode("node-1", "text", "Text Input"),
  createMockNode("node-2", "llm", "LLM Processor"),
  createMockNode("node-3", "image", "Image Generator")
];

describe("CanvasSearchStore", () => {
  let store: ReturnType<typeof createCanvasSearchStore>;

  beforeEach(() => {
    store = createCanvasSearchStore();
  });

  it("should initialize with default values", () => {
    expect(store.getState().isSearchOpen).toBe(false);
    expect(store.getState().searchTerm).toBe("");
    expect(store.getState().searchResults).toEqual([]);
    expect(store.getState().selectedResultIndex).toBe(-1);
    expect(store.getState().highlightedNodeIds).toEqual([]);
  });

  it("should open search", () => {
    store.getState().setIsSearchOpen(true);
    expect(store.getState().isSearchOpen).toBe(true);
  });

  it("should close search", () => {
    store.getState().setIsSearchOpen(true);
    store.getState().setIsSearchOpen(false);
    expect(store.getState().isSearchOpen).toBe(false);
  });

  it("should update search term", () => {
    store.getState().setSearchTerm("test");
    expect(store.getState().searchTerm).toBe("test");
  });

  it("should perform search and find nodes by title", () => {
    store.getState().performSearch(mockNodes, "Text");
    expect(store.getState().searchResults.length).toBe(1);
    expect(store.getState().searchResults[0].node.id).toBe("node-1");
    expect(store.getState().searchResults[0].matchType).toBe("title");
  });

  it("should perform search and find nodes by type", () => {
    store.getState().performSearch(mockNodes, "llm");
    expect(store.getState().searchResults.length).toBe(1);
    expect(store.getState().searchResults[0].node.id).toBe("node-2");
    expect(store.getState().searchResults[0].matchType).toBe("title");
  });

  it("should return empty results for non-matching search", () => {
    store.getState().performSearch(mockNodes, "nonexistent");
    expect(store.getState().searchResults).toEqual([]);
    expect(store.getState().highlightedNodeIds).toEqual([]);
  });

  it("should clear search completely", () => {
    store.getState().setIsSearchOpen(true);
    store.getState().setSearchTerm("test");
    store.setState({
      searchResults: [{ node: mockNodes[0], matchType: "title" as const, matchText: "test" }]
    });
    store.getState().setSelectedResultIndex(0);
    store.getState().setHighlightedNodeIds(["node-1"]);

    store.getState().clearSearch();

    expect(store.getState().searchTerm).toBe("");
    expect(store.getState().searchResults).toEqual([]);
    expect(store.getState().selectedResultIndex).toBe(-1);
    expect(store.getState().highlightedNodeIds).toEqual([]);
    expect(store.getState().isSearchOpen).toBe(false);
  });

  it("should find multiple matching nodes", () => {
    store.getState().performSearch(mockNodes, "node");
    expect(store.getState().searchResults.length).toBe(3);
  });
});
