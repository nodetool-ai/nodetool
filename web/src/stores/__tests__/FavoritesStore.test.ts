import { renderHook, act } from "@testing-library/react";
import useFavoritesStore from "../FavoritesStore";

describe("FavoritesStore", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset the store state
    useFavoritesStore.setState({ favoriteWorkflowIds: [] });
  });

  it("should initialize with empty favorites", () => {
    const { result } = renderHook(() => useFavoritesStore());
    expect(result.current.favoriteWorkflowIds).toEqual([]);
  });

  it("should add a workflow to favorites", () => {
    const { result } = renderHook(() => useFavoritesStore());

    act(() => {
      result.current.addFavorite("workflow-1");
    });

    expect(result.current.isFavorite("workflow-1")).toBe(true);
    expect(result.current.favoriteWorkflowIds).toContain("workflow-1");
  });

  it("should remove a workflow from favorites", () => {
    const { result } = renderHook(() => useFavoritesStore());

    act(() => {
      result.current.addFavorite("workflow-1");
      result.current.removeFavorite("workflow-1");
    });

    expect(result.current.isFavorite("workflow-1")).toBe(false);
    expect(result.current.favoriteWorkflowIds).not.toContain("workflow-1");
  });

  it("should toggle favorite status", () => {
    const { result } = renderHook(() => useFavoritesStore());

    act(() => {
      result.current.toggleFavorite("workflow-1");
    });

    expect(result.current.isFavorite("workflow-1")).toBe(true);

    act(() => {
      result.current.toggleFavorite("workflow-1");
    });

    expect(result.current.isFavorite("workflow-1")).toBe(false);
  });

  it("should not add duplicate favorites", () => {
    const { result } = renderHook(() => useFavoritesStore());

    act(() => {
      result.current.addFavorite("workflow-1");
      result.current.addFavorite("workflow-1");
    });

    expect(result.current.favoriteWorkflowIds.filter(id => id === "workflow-1").length).toBe(1);
  });

  it("should return all favorites", () => {
    const { result } = renderHook(() => useFavoritesStore());

    act(() => {
      result.current.addFavorite("workflow-1");
      result.current.addFavorite("workflow-2");
      result.current.addFavorite("workflow-3");
    });

    expect(result.current.getFavorites()).toEqual(["workflow-1", "workflow-2", "workflow-3"]);
  });

  it("should handle multiple workflows correctly", () => {
    const { result } = renderHook(() => useFavoritesStore());

    act(() => {
      result.current.addFavorite("workflow-1");
      result.current.addFavorite("workflow-2");
      result.current.removeFavorite("workflow-1");
      result.current.addFavorite("workflow-3");
    });

    expect(result.current.favoriteWorkflowIds).toEqual(["workflow-2", "workflow-3"]);
    expect(result.current.isFavorite("workflow-1")).toBe(false);
    expect(result.current.isFavorite("workflow-2")).toBe(true);
    expect(result.current.isFavorite("workflow-3")).toBe(true);
  });
});
