import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import {
  useFavoriteNodesStore,
  FavoriteNode
} from "../FavoriteNodesStore";

describe("FavoriteNodesStore", () => {
  beforeEach(() => {
    act(() => {
      useFavoriteNodesStore.setState({ favorites: [] });
    });
    localStorage.removeItem("nodetool-favorite-nodes");
  });

  describe("addFavorite", () => {
    it("should add a node type to favorites", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node");
      });

      const favorites = useFavoriteNodesStore.getState().favorites;
      expect(favorites).toHaveLength(1);
      expect(favorites[0].nodeType).toBe("nodetool.test.Node");
    });

    it("should not add duplicate node types", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node");
      });

      const favorites = useFavoriteNodesStore.getState().favorites;
      expect(favorites).toHaveLength(1);
    });

    it("should add new favorites to the front of the list", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.First");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Second");
      });

      const favorites = useFavoriteNodesStore.getState().favorites;
      expect(favorites[0].nodeType).toBe("nodetool.test.Second");
      expect(favorites[1].nodeType).toBe("nodetool.test.First");
    });

    it("should limit favorites to MAX_FAVORITES (12)", () => {
      for (let i = 0; i < 15; i++) {
        act(() => {
          useFavoriteNodesStore
            .getState()
            .addFavorite(`nodetool.test.Node${i}`);
        });
      }

      const favorites = useFavoriteNodesStore.getState().favorites;
      expect(favorites).toHaveLength(12);
      expect(favorites[0].nodeType).toBe("nodetool.test.Node14");
    });
  });

  describe("removeFavorite", () => {
    it("should remove a node type from favorites", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node1");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node2");
        useFavoriteNodesStore
          .getState()
          .removeFavorite("nodetool.test.Node1");
      });

      const favorites = useFavoriteNodesStore.getState().favorites;
      expect(favorites).toHaveLength(1);
      expect(favorites[0].nodeType).toBe("nodetool.test.Node2");
    });

    it("should handle removing non-existent favorite gracefully", () => {
      act(() => {
        useFavoriteNodesStore.getState().removeFavorite("nodetool.test.NonExistent");
      });

      const favorites = useFavoriteNodesStore.getState().favorites;
      expect(favorites).toHaveLength(0);
    });
  });

  describe("isFavorite", () => {
    it("should return true for favorited nodes", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node");
      });

      expect(
        useFavoriteNodesStore.getState().isFavorite("nodetool.test.Node")
      ).toBe(true);
    });

    it("should return false for non-favorited nodes", () => {
      expect(
        useFavoriteNodesStore.getState().isFavorite("nodetool.test.Node")
      ).toBe(false);
    });
  });

  describe("toggleFavorite", () => {
    it("should add a node if not favorited", () => {
      act(() => {
        useFavoriteNodesStore
          .getState()
          .toggleFavorite("nodetool.test.Node");
      });

      expect(
        useFavoriteNodesStore.getState().isFavorite("nodetool.test.Node")
      ).toBe(true);
    });

    it("should remove a node if already favorited", () => {
      act(() => {
        useFavoriteNodesStore
          .getState()
          .toggleFavorite("nodetool.test.Node");
        useFavoriteNodesStore
          .getState()
          .toggleFavorite("nodetool.test.Node");
      });

      expect(
        useFavoriteNodesStore.getState().isFavorite("nodetool.test.Node")
      ).toBe(false);
    });
  });

  describe("clearFavorites", () => {
    it("should remove all favorites", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node1");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node2");
        useFavoriteNodesStore.getState().clearFavorites();
      });

      const favorites = useFavoriteNodesStore.getState().favorites;
      expect(favorites).toHaveLength(0);
    });
  });

  describe("reorderFavorites", () => {
    it("should reorder favorites by moving element from one position to another", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.First");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Second");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Third");
      });

      act(() => {
        useFavoriteNodesStore.getState().reorderFavorites(0, 2);
      });

      const favorites = useFavoriteNodesStore.getState().favorites;
      expect(favorites[0].nodeType).toBe("nodetool.test.Second");
      expect(favorites[1].nodeType).toBe("nodetool.test.First");
      expect(favorites[2].nodeType).toBe("nodetool.test.Third");
    });
    
    it("should handle reorder within bounds", () => {
      act(() => {
        useFavoriteNodesStore.getState().clearFavorites();
        useFavoriteNodesStore.getState().addFavorite("A");
        useFavoriteNodesStore.getState().addFavorite("B");
        useFavoriteNodesStore.getState().addFavorite("C");
      });
      
      act(() => {
        useFavoriteNodesStore.getState().reorderFavorites(0, 1);
      });
      
      const favorites = useFavoriteNodesStore.getState().favorites;
      expect(favorites[0].nodeType).toBe("B");
      expect(favorites[1].nodeType).toBe("C");
      expect(favorites[2].nodeType).toBe("A");
    });
  });

  describe("getFavorites", () => {
    it("should return all favorites", () => {
      act(() => {
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node1");
        useFavoriteNodesStore.getState().addFavorite("nodetool.test.Node2");
      });

      const favorites = useFavoriteNodesStore.getState().getFavorites();
      expect(favorites).toHaveLength(2);
    });
  });
});
