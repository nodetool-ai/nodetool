import { renderHook, act } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { useNodeBookmarks } from "../useNodeBookmarks";
import { useNodeBookmarkStore } from "../../stores/NodeBookmarkStore";

// Mock ReactFlow
jest.mock("@xyflow/react", () => ({
  ...jest.requireActual("@xyflow/react"),
  useReactFlow: () => ({
    getNode: jest.fn((id) => ({
      id,
      type: "test_node",
      position: { x: 100, y: 200 },
      data: { title: "Test Node" }
    }))
  })
}));

// Mock window.location.search
const mockSearch = "?workflow=test-workflow-1";
Object.defineProperty(window, "location", {
  value: {
    search: mockSearch
  },
  writable: true
});

describe("useNodeBookmarks", () => {
  beforeEach(() => {
    // Clear all bookmarks before each test
    const { clearAllBookmarks } = useNodeBookmarkStore.getState();
    clearAllBookmarks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
  );

  describe("addNodeBookmark", () => {
    it("should add a bookmark for a node", () => {
      const { result } = renderHook(() => useNodeBookmarks(), { wrapper });

      act(() => {
        result.current.addNodeBookmark("node-1", 1);
      });

      const bookmark = result.current.getNodeBookmark("node-1");
      expect(bookmark).toMatchObject({
        nodeId: "node-1",
        index: 1,
        nodeName: "Test Node"
      });
    });

    it("should add bookmark with provided workflowId", () => {
      const { result } = renderHook(() => useNodeBookmarks(), { wrapper });

      act(() => {
        result.current.addNodeBookmark("node-1", 1, "custom-workflow");
      });

      const bookmark = result.current.getNodeBookmark("node-1", "custom-workflow");
      expect(bookmark).toMatchObject({
        nodeId: "node-1",
        index: 1
      });
    });
  });

  describe("removeNodeBookmark", () => {
    it("should remove bookmark for a node", () => {
      const { result } = renderHook(() => useNodeBookmarks(), { wrapper });

      act(() => {
        result.current.addNodeBookmark("node-1", 1);
        result.current.removeNodeBookmark("node-1");
      });

      const bookmark = result.current.getNodeBookmark("node-1");
      expect(bookmark).toBeUndefined();
    });
  });

  describe("getNodeBookmark", () => {
    it("should return bookmark for a specific node", () => {
      const { result } = renderHook(() => useNodeBookmarks(), { wrapper });

      act(() => {
        result.current.addNodeBookmark("node-1", 1);
      });

      const bookmark = result.current.getNodeBookmark("node-1");
      expect(bookmark).toMatchObject({
        nodeId: "node-1",
        index: 1
      });
    });

    it("should return undefined for non-bookmarked node", () => {
      const { result } = renderHook(() => useNodeBookmarks(), { wrapper });

      const bookmark = result.current.getNodeBookmark("non-existent");
      expect(bookmark).toBeUndefined();
    });
  });

  describe("getBookmarkAt", () => {
    it("should return bookmark at specified index", () => {
      const { result } = renderHook(() => useNodeBookmarks(), { wrapper });

      act(() => {
        result.current.addNodeBookmark("node-1", 1);
      });

      const bookmark = result.current.getBookmarkAt(1);
      expect(bookmark).toMatchObject({
        nodeId: "node-1",
        index: 1
      });
    });

    it("should return undefined for non-existent bookmark slot", () => {
      const { result } = renderHook(() => useNodeBookmarks(), { wrapper });

      const bookmark = result.current.getBookmarkAt(1);
      expect(bookmark).toBeUndefined();
    });
  });

  describe("getAllBookmarks", () => {
    it("should return all bookmarks for current workflow", () => {
      const { result } = renderHook(() => useNodeBookmarks(), { wrapper });

      act(() => {
        result.current.addNodeBookmark("node-1", 1);
        result.current.addNodeBookmark("node-2", 2);
      });

      const bookmarks = result.current.getAllBookmarks();
      expect(bookmarks).toHaveLength(2);
    });

    it("should return empty array when no bookmarks exist", () => {
      const { result } = renderHook(() => useNodeBookmarks(), { wrapper });

      const bookmarks = result.current.getAllBookmarks();
      expect(bookmarks).toEqual([]);
    });
  });

  describe("getWorkflowId", () => {
    it("should extract workflowId from URL", () => {
      const { result } = renderHook(() => useNodeBookmarks(), { wrapper });

      const workflowId = result.current.getWorkflowId();
      expect(workflowId).toBe("test-workflow-1");
    });
  });
});
