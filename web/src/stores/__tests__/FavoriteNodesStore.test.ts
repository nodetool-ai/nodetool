import { renderHook, act } from "@testing-library/react";
import { useFavoriteNodesStore } from "../FavoriteNodesStore";

describe("FavoriteNodesStore", () => {
  beforeEach(() => {
    useFavoriteNodesStore.setState({ favorites: new Set<string>() });
  });

  describe("addFavorite", () => {
    it("should add a node type to favorites", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      act(() => {
        result.current.addFavorite("textToImage");
      });

      expect(result.current.favorites.has("textToImage")).toBe(true);
    });

    it("should handle adding multiple favorites", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      act(() => {
        result.current.addFavorite("textToImage");
        result.current.addFavorite("imageToText");
        result.current.addFavorite("audioGenerate");
      });

      expect(result.current.favorites.has("textToImage")).toBe(true);
      expect(result.current.favorites.has("imageToText")).toBe(true);
      expect(result.current.favorites.has("audioGenerate")).toBe(true);
      expect(result.current.favorites.size).toBe(3);
    });

    it("should not add duplicate favorites", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      act(() => {
        result.current.addFavorite("textToImage");
        result.current.addFavorite("textToImage");
      });

      expect(result.current.favorites.size).toBe(1);
    });
  });

  describe("removeFavorite", () => {
    it("should remove a node type from favorites", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      act(() => {
        result.current.addFavorite("textToImage");
        result.current.addFavorite("imageToText");
        result.current.removeFavorite("textToImage");
      });

      expect(result.current.favorites.has("textToImage")).toBe(false);
      expect(result.current.favorites.has("imageToText")).toBe(true);
      expect(result.current.favorites.size).toBe(1);
    });

    it("should handle removing non-existent favorite gracefully", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      act(() => {
        result.current.removeFavorite("nonExistent");
      });

      expect(result.current.favorites.size).toBe(0);
    });
  });

  describe("toggleFavorite", () => {
    it("should add a node type when not favorited", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      act(() => {
        result.current.toggleFavorite("textToImage");
      });

      expect(result.current.favorites.has("textToImage")).toBe(true);
    });

    it("should remove a node type when already favorited", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      act(() => {
        result.current.addFavorite("textToImage");
        result.current.toggleFavorite("textToImage");
      });

      expect(result.current.favorites.has("textToImage")).toBe(false);
    });
  });

  describe("isFavorite", () => {
    it("should return true for favorited node types", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      act(() => {
        result.current.addFavorite("textToImage");
      });

      expect(result.current.isFavorite("textToImage")).toBe(true);
    });

    it("should return false for non-favorited node types", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      expect(result.current.isFavorite("textToImage")).toBe(false);
    });
  });

  describe("getFavorites", () => {
    it("should return an array of favorite node types", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      act(() => {
        result.current.addFavorite("textToImage");
        result.current.addFavorite("imageToText");
        result.current.addFavorite("audioGenerate");
      });

      const favorites = result.current.getFavorites();
      expect(favorites).toContain("textToImage");
      expect(favorites).toContain("imageToText");
      expect(favorites).toContain("audioGenerate");
      expect(favorites.length).toBe(3);
    });

    it("should return empty array when no favorites", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      const favorites = result.current.getFavorites();
      expect(favorites).toEqual([]);
    });
  });

  describe("clearFavorites", () => {
    it("should remove all favorites", () => {
      const { result } = renderHook(() => useFavoriteNodesStore());

      act(() => {
        result.current.addFavorite("textToImage");
        result.current.addFavorite("imageToText");
        result.current.addFavorite("audioGenerate");
        result.current.clearFavorites();
      });

      expect(result.current.favorites.size).toBe(0);
      expect(result.current.getFavorites()).toEqual([]);
    });
  });
});
