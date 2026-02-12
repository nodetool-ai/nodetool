/**
 * BookmarksPanelStore tests
 */

import { renderHook, act } from "@testing-library/react";
import { useBookmarksPanelStore } from "../BookmarksPanelStore";

describe("BookmarksPanelStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useBookmarksPanelStore.setState({ showBookmarksPanel: false });
  });

  describe("initial state", () => {
    it("should have showBookmarksPanel set to false by default", () => {
      const { result } = renderHook(() => useBookmarksPanelStore());

      expect(result.current.showBookmarksPanel).toBe(false);
    });
  });

  describe("toggleBookmarksPanel", () => {
    it("should toggle showBookmarksPanel from false to true", () => {
      const { result } = renderHook(() => useBookmarksPanelStore());

      expect(result.current.showBookmarksPanel).toBe(false);

      act(() => {
        result.current.toggleBookmarksPanel();
      });

      expect(result.current.showBookmarksPanel).toBe(true);
    });

    it("should toggle showBookmarksPanel from true to false", () => {
      const { result } = renderHook(() => useBookmarksPanelStore());

      act(() => {
        result.current.setShowBookmarksPanel(true);
      });

      expect(result.current.showBookmarksPanel).toBe(true);

      act(() => {
        result.current.toggleBookmarksPanel();
      });

      expect(result.current.showBookmarksPanel).toBe(false);
    });
  });

  describe("setShowBookmarksPanel", () => {
    it("should set showBookmarksPanel to true", () => {
      const { result } = renderHook(() => useBookmarksPanelStore());

      act(() => {
        result.current.setShowBookmarksPanel(true);
      });

      expect(result.current.showBookmarksPanel).toBe(true);
    });

    it("should set showBookmarksPanel to false", () => {
      const { result } = renderHook(() => useBookmarksPanelStore());

      act(() => {
        result.current.setShowBookmarksPanel(true);
        result.current.setShowBookmarksPanel(false);
      });

      expect(result.current.showBookmarksPanel).toBe(false);
    });
  });
});
