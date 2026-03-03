/**
 * Tests for useBookmarkNavigation hook
 */

import { renderHook, act } from "@testing-library/react";
import { useBookmarkNavigation } from "../useBookmarkNavigation";
import { useNodeBookmarksStore } from "../../stores/NodeBookmarksStore";
import { useReactFlow } from "@xyflow/react";

// Mock the dependencies
jest.mock("../../stores/NodeBookmarksStore");
jest.mock("@xyflow/react");

describe("useBookmarkNavigation", () => {
  const mockBookmarks = [
    { nodeId: "node-1", nodeName: "Node 1", nodeType: "nodetool.test.Node1", timestamp: 3000 },
    { nodeId: "node-2", nodeName: "Node 2", nodeType: "nodetool.test.Node2", timestamp: 2000 },
    { nodeId: "node-3", nodeName: "Node 3", nodeType: "nodetool.test.Node3", timestamp: 1000 }
  ];

  const mockSetCenter = jest.fn();
  const mockSetNodes = jest.fn();
  const mockGetNode = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useReactFlow as jest.Mock).mockReturnValue({
      setCenter: mockSetCenter,
      setNodes: mockSetNodes,
      getNode: mockGetNode,
      getNodes: jest.fn(() => [])
    });

    mockGetNode.mockImplementation((id: string) => ({
      id,
      position: { x: 100, y: 100 },
      width: 200,
      height: 100
    }));

    (useNodeBookmarksStore as jest.Mock).mockImplementation((selector) => {
      const state = { bookmarks: mockBookmarks };
      return selector(state);
    });
  });

  describe("initial state", () => {
    it("returns bookmarks from store", () => {
      const { result } = renderHook(() => useBookmarkNavigation());
      
      expect(result.current.bookmarks).toEqual(mockBookmarks);
    });

    it("indicates when bookmarks exist", () => {
      const { result } = renderHook(() => useBookmarkNavigation());
      
      expect(result.current.hasNextBookmark).toBe(true);
      expect(result.current.hasPrevBookmark).toBe(true);
    });

    it("indicates when no bookmarks exist", () => {
      (useNodeBookmarksStore as jest.Mock).mockImplementation((selector) => {
        const state = { bookmarks: [] };
        return selector(state);
      });

      const { result } = renderHook(() => useBookmarkNavigation());
      
      expect(result.current.hasNextBookmark).toBe(false);
      expect(result.current.hasPrevBookmark).toBe(false);
    });
  });

  describe("navigateToBookmark", () => {
    it("navigates to specific bookmark by index", () => {
      const { result } = renderHook(() => useBookmarkNavigation());
      
      act(() => {
        const success = result.current.navigateToBookmark(1);
        expect(success).toBe(true);
      });
      
      expect(mockSetCenter).toHaveBeenCalledWith(
        200, // x position + width/2
        150, // y position + height/2
        { zoom: 1, duration: 300 }
      );
      expect(mockSetNodes).toHaveBeenCalled();
    });

    it("wraps around when navigating past the end", () => {
      const { result } = renderHook(() => useBookmarkNavigation());
      
      act(() => {
        result.current.navigateToBookmark(3); // Past the last index
      });
      
      // Should wrap to index 0 (first bookmark)
      expect(mockSetCenter).toHaveBeenCalled();
    });

    it("wraps around when navigating before the start", () => {
      const { result } = renderHook(() => useBookmarkNavigation());
      
      act(() => {
        result.current.navigateToBookmark(-1);
      });
      
      // Should wrap to last index
      expect(mockSetCenter).toHaveBeenCalled();
    });

    it("returns false when no bookmarks exist", () => {
      (useNodeBookmarksStore as jest.Mock).mockImplementation((selector) => {
        const state = { bookmarks: [] };
        return selector(state);
      });

      const { result } = renderHook(() => useBookmarkNavigation());
      
      act(() => {
        const success = result.current.navigateToBookmark(0);
        expect(success).toBe(false);
      });
      
      expect(mockSetCenter).not.toHaveBeenCalled();
    });

    it("calls onNavigateError when navigation fails", () => {
      const onNavigateError = jest.fn();
      (useNodeBookmarksStore as jest.Mock).mockImplementation((selector) => {
        const state = { bookmarks: [] };
        return selector(state);
      });

      const { result } = renderHook(() => useBookmarkNavigation({ onNavigateError }));
      
      act(() => {
        result.current.navigateToBookmark(0);
      });
      
      expect(onNavigateError).toHaveBeenCalled();
    });

    it("does not navigate when disabled", () => {
      const { result } = renderHook(() => useBookmarkNavigation({ enabled: false }));
      
      act(() => {
        const success = result.current.navigateToBookmark(0);
        expect(success).toBe(false);
      });
      
      expect(mockSetCenter).not.toHaveBeenCalled();
    });
  });

  describe("navigateToNextBookmark", () => {
    it("navigates to next bookmark from current selection", () => {
      const { result } = renderHook(() => useBookmarkNavigation());
      
      act(() => {
        const success = result.current.navigateToNextBookmark();
        expect(success).toBe(true);
      });
      
      expect(mockSetCenter).toHaveBeenCalled();
    });

    it("wraps to first bookmark after last", () => {
      (useReactFlow as jest.Mock).mockReturnValue({
        setCenter: mockSetCenter,
        setNodes: mockSetNodes,
        getNode: mockGetNode,
        getNodes: jest.fn(() => [{ id: "node-3", selected: true }])
      });

      const { result } = renderHook(() => useBookmarkNavigation());
      
      act(() => {
        result.current.navigateToNextBookmark();
      });
      
      // Should wrap around to first bookmark
      expect(mockSetCenter).toHaveBeenCalled();
    });
  });

  describe("navigateToPrevBookmark", () => {
    it("navigates to previous bookmark from current selection", () => {
      const { result } = renderHook(() => useBookmarkNavigation());
      
      act(() => {
        const success = result.current.navigateToPrevBookmark();
        expect(success).toBe(true);
      });
      
      expect(mockSetCenter).toHaveBeenCalled();
    });

    it("wraps to last bookmark when nothing is selected", () => {
      const { result } = renderHook(() => useBookmarkNavigation());
      
      act(() => {
        result.current.navigateToPrevBookmark();
      });
      
      // Should go to last bookmark (index 2)
      expect(mockSetCenter).toHaveBeenCalled();
    });
  });

  describe("with disabled option", () => {
    it("disables navigation when enabled is false", () => {
      const onNavigateError = jest.fn();
      const { result } = renderHook(() => useBookmarkNavigation({ 
        enabled: false,
        onNavigateError 
      }));
      
      act(() => {
        result.current.navigateToNextBookmark();
      });
      
      expect(mockSetCenter).not.toHaveBeenCalled();
      expect(onNavigateError).toHaveBeenCalled();
    });
  });
});
