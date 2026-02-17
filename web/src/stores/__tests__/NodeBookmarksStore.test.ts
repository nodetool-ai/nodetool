/**
 * Tests for NodeBookmarksStore
 */

import { renderHook, act } from "@testing-library/react";
import { useNodeBookmarksStore } from "../NodeBookmarksStore";

describe("NodeBookmarksStore", () => {
  beforeEach(() => {
    // Clear the store state before each test
    const { clearBookmarks } = useNodeBookmarksStore.getState();
    clearBookmarks();
  });

  afterEach(() => {
    // Clean up after each test
    const { clearBookmarks } = useNodeBookmarksStore.getState();
    clearBookmarks();
  });

  describe("initial state", () => {
    it("should start with empty bookmarks array", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      expect(result.current.bookmarks).toEqual([]);
    });

    it("should return false for isBookmarked when no bookmarks exist", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      expect(result.current.isBookmarked("node-1")).toBe(false);
    });
  });

  describe("addBookmark", () => {
    it("should add a bookmark to the store", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "Test Node", "nodetool.test.Test");
      });

      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.bookmarks[0]).toMatchObject({
        nodeId: "node-1",
        nodeName: "Test Node",
        nodeType: "nodetool.test.Test"
      });
      expect(result.current.bookmarks[0].timestamp).toBeGreaterThan(0);
    });

    it("should not add duplicate bookmarks for the same node", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "Test Node", "nodetool.test.Test");
        result.current.addBookmark("node-1", "Test Node 2", "nodetool.test.Test2");
      });

      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.bookmarks[0].nodeName).toBe("Test Node");
    });

    it("should add new bookmarks to the beginning of the array", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "First", "nodetool.test.First");
        result.current.addBookmark("node-2", "Second", "nodetool.test.Second");
      });

      expect(result.current.bookmarks[0].nodeId).toBe("node-2");
      expect(result.current.bookmarks[1].nodeId).toBe("node-1");
    });

    it("should enforce maximum bookmarks limit", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        for (let i = 0; i < 60; i++) {
          result.current.addBookmark(`node-${i}`, `Node ${i}`, `nodetool.test.Node${i}`);
        }
      });

      // Should be limited to 50 (MAX_BOOKMARKS)
      expect(result.current.bookmarks).toHaveLength(50);
      // Most recent should be at the beginning
      expect(result.current.bookmarks[0].nodeId).toBe("node-59");
    });
  });

  describe("removeBookmark", () => {
    it("should remove a bookmark by nodeId", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "Test Node", "nodetool.test.Test");
        result.current.addBookmark("node-2", "Test Node 2", "nodetool.test.Test2");
      });

      expect(result.current.bookmarks).toHaveLength(2);

      act(() => {
        result.current.removeBookmark("node-1");
      });

      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.bookmarks[0].nodeId).toBe("node-2");
    });

    it("should handle removing non-existent bookmark gracefully", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "Test Node", "nodetool.test.Test");
      });

      expect(result.current.bookmarks).toHaveLength(1);

      act(() => {
        result.current.removeBookmark("non-existent");
      });

      expect(result.current.bookmarks).toHaveLength(1);
    });
  });

  describe("toggleBookmark", () => {
    it("should add bookmark when node is not bookmarked", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.toggleBookmark("node-1", "Test Node", "nodetool.test.Test");
      });

      expect(result.current.bookmarks).toHaveLength(1);
      expect(result.current.isBookmarked("node-1")).toBe(true);
    });

    it("should remove bookmark when node is already bookmarked", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.toggleBookmark("node-1", "Test Node", "nodetool.test.Test");
      });

      expect(result.current.bookmarks).toHaveLength(1);

      act(() => {
        result.current.toggleBookmark("node-1", "Test Node", "nodetool.test.Test");
      });

      expect(result.current.bookmarks).toHaveLength(0);
      expect(result.current.isBookmarked("node-1")).toBe(false);
    });
  });

  describe("isBookmarked", () => {
    it("should return true when node is bookmarked", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "Test Node", "nodetool.test.Test");
      });

      expect(result.current.isBookmarked("node-1")).toBe(true);
    });

    it("should return false when node is not bookmarked", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "Test Node", "nodetool.test.Test");
      });

      expect(result.current.isBookmarked("node-2")).toBe(false);
    });
  });

  describe("clearBookmarks", () => {
    it("should remove all bookmarks", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "Test Node", "nodetool.test.Test");
        result.current.addBookmark("node-2", "Test Node 2", "nodetool.test.Test2");
        result.current.addBookmark("node-3", "Test Node 3", "nodetool.test.Test3");
      });

      expect(result.current.bookmarks).toHaveLength(3);

      act(() => {
        result.current.clearBookmarks();
      });

      expect(result.current.bookmarks).toHaveLength(0);
      expect(result.current.isBookmarked("node-1")).toBe(false);
      expect(result.current.isBookmarked("node-2")).toBe(false);
      expect(result.current.isBookmarked("node-3")).toBe(false);
    });
  });

  describe("getBookmarks", () => {
    it("should return all bookmarks", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "First", "nodetool.test.First");
        result.current.addBookmark("node-2", "Second", "nodetool.test.Second");
      });

      const bookmarks = result.current.getBookmarks();
      expect(bookmarks).toHaveLength(2);
      expect(bookmarks[0].nodeId).toBe("node-2");
      expect(bookmarks[1].nodeId).toBe("node-1");
    });

    it("should return empty array when no bookmarks exist", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      const bookmarks = result.current.getBookmarks();
      expect(bookmarks).toEqual([]);
    });
  });

  describe("updateBookmarkName", () => {
    it("should update the name of an existing bookmark", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "Old Name", "nodetool.test.Test");
      });

      expect(result.current.bookmarks[0].nodeName).toBe("Old Name");

      act(() => {
        result.current.updateBookmarkName("node-1", "New Name");
      });

      expect(result.current.bookmarks[0].nodeName).toBe("New Name");
    });

    it("should handle updating non-existent bookmark gracefully", () => {
      const { result } = renderHook(() => useNodeBookmarksStore());
      
      act(() => {
        result.current.addBookmark("node-1", "Test Node", "nodetool.test.Test");
      });

      const originalLength = result.current.bookmarks.length;

      act(() => {
        result.current.updateBookmarkName("non-existent", "New Name");
      });

      expect(result.current.bookmarks).toHaveLength(originalLength);
      expect(result.current.bookmarks[0].nodeName).toBe("Test Node");
    });
  });
});
