import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import {
  useFavoriteWorkflowsStore
} from "../FavoriteWorkflowsStore";

describe("FavoriteWorkflowsStore", () => {
  beforeEach(() => {
    act(() => {
      useFavoriteWorkflowsStore.setState({ favoriteWorkflowIds: [] });
    });
    localStorage.removeItem("favorite-workflows");
  });

  describe("toggleFavorite", () => {
    it("should add workflow to favorites when not already favorited", () => {
      act(() => {
        useFavoriteWorkflowsStore.getState().toggleFavorite("workflow-1");
      });

      const ids = useFavoriteWorkflowsStore.getState().favoriteWorkflowIds;
      expect(ids).toContain("workflow-1");
      expect(ids).toHaveLength(1);
    });

    it("should remove workflow from favorites when already favorited", () => {
      act(() => {
        useFavoriteWorkflowsStore.setState({ favoriteWorkflowIds: ["workflow-1", "workflow-2"] });
      });

      act(() => {
        useFavoriteWorkflowsStore.getState().toggleFavorite("workflow-1");
      });

      const ids = useFavoriteWorkflowsStore.getState().favoriteWorkflowIds;
      expect(ids).not.toContain("workflow-1");
      expect(ids).toEqual(["workflow-2"]);
    });
  });

  describe("addFavorite", () => {
    it("should add workflow to favorites", () => {
      act(() => {
        useFavoriteWorkflowsStore.getState().addFavorite("workflow-1");
        useFavoriteWorkflowsStore.getState().addFavorite("workflow-2");
      });

      const ids = useFavoriteWorkflowsStore.getState().favoriteWorkflowIds;
      expect(ids).toEqual(["workflow-1", "workflow-2"]);
    });

    it("should not add duplicate workflow", () => {
      act(() => {
        useFavoriteWorkflowsStore.setState({ favoriteWorkflowIds: ["workflow-1"] });
      });

      act(() => {
        useFavoriteWorkflowsStore.getState().addFavorite("workflow-1");
      });

      const ids = useFavoriteWorkflowsStore.getState().favoriteWorkflowIds;
      expect(ids).toEqual(["workflow-1"]);
      expect(ids).toHaveLength(1);
    });
  });

  describe("removeFavorite", () => {
    it("should remove workflow from favorites", () => {
      act(() => {
        useFavoriteWorkflowsStore.setState({ favoriteWorkflowIds: ["workflow-1", "workflow-2"] });
      });

      act(() => {
        useFavoriteWorkflowsStore.getState().removeFavorite("workflow-1");
      });

      const ids = useFavoriteWorkflowsStore.getState().favoriteWorkflowIds;
      expect(ids).toEqual(["workflow-2"]);
    });
  });

  describe("isFavorite", () => {
    it("should return true for favorited workflow", () => {
      act(() => {
        useFavoriteWorkflowsStore.setState({ favoriteWorkflowIds: ["workflow-1"] });
      });

    expect(
      useFavoriteWorkflowsStore.getState().isFavorite("workflow-1")
    ).toBe(true);
  });

  it("should return false for non-favorited workflow", () => {
    act(() => {
      useFavoriteWorkflowsStore.setState({ favoriteWorkflowIds: ["workflow-1"] });
    });

    expect(
      useFavoriteWorkflowsStore.getState().isFavorite("workflow-2")
    ).toBe(false);
  });
});

describe("clearAll", () => {
  it("should remove all favorites", () => {
    act(() => {
      useFavoriteWorkflowsStore.setState({ favoriteWorkflowIds: ["workflow-1", "workflow-2", "workflow-3"] });
    });

    act(() => {
      useFavoriteWorkflowsStore.getState().clearAll();
    });

      const ids = useFavoriteWorkflowsStore.getState().favoriteWorkflowIds;
      expect(ids).toEqual([]);
    });
  });

  describe("useFavoriteWorkflowIds", () => {
    it("should return all favorite workflow IDs", () => {
      act(() => {
        useFavoriteWorkflowsStore.setState({ favoriteWorkflowIds: ["workflow-1", "workflow-2"] });
      });

      const ids = useFavoriteWorkflowsStore.getState().favoriteWorkflowIds;
      expect(ids).toEqual(["workflow-1", "workflow-2"]);
    });
  });
});
