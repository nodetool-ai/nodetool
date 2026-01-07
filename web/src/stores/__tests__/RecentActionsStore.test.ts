import { act } from "@testing-library/react";
import { useRecentActionsStore, RecentAction, FavoritedItem } from "../RecentActionsStore";

describe("RecentActionsStore", () => {
  beforeEach(() => {
    useRecentActionsStore.setState({
      recentActions: [],
      favorites: []
    });
  });

  describe("trackAction", () => {
    it("should add a new action to recent actions", () => {
      useRecentActionsStore.getState().trackAction({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      const recentActions = useRecentActionsStore.getState().recentActions;
      expect(recentActions).toHaveLength(1);
      expect(recentActions[0]).toMatchObject({
        id: "test-node-1",
        type: "node",
        name: "Test Node",
        count: 1
      });
      expect(recentActions[0].timestamp).toBeDefined();
    });

    it("should increment count for existing action", () => {
      useRecentActionsStore.getState().trackAction({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      useRecentActionsStore.getState().trackAction({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      const recentActions = useRecentActionsStore.getState().recentActions;
      expect(recentActions).toHaveLength(1);
      expect(recentActions[0].count).toBe(2);
    });

    it("should update timestamp for existing action", () => {
      useRecentActionsStore.getState().trackAction({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      const firstTimestamp = useRecentActionsStore.getState().recentActions[0].timestamp;

      act(() => {
        jest.advanceTimersByTime(100);
      });

      useRecentActionsStore.getState().trackAction({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      const recentActions = useRecentActionsStore.getState().recentActions;
      expect(recentActions[0].timestamp).toBeGreaterThan(firstTimestamp);
    });

    it("should limit recent actions to MAX_RECENT_ACTIONS", () => {
      for (let i = 0; i < 25; i++) {
        useRecentActionsStore.getState().trackAction({
          id: `test-node-${i}`,
          type: "node",
          name: `Test Node ${i}`
        });
      }

      const recentActions = useRecentActionsStore.getState().recentActions;
      expect(recentActions).toHaveLength(20);
    });

    it("should sort actions by timestamp", () => {
      useRecentActionsStore.getState().trackAction({
        id: "node-2",
        type: "node",
        name: "Node 2"
      });

      useRecentActionsStore.getState().trackAction({
        id: "node-1",
        type: "node",
        name: "Node 1"
      });

      const recentActions = useRecentActionsStore.getState().recentActions;
      expect(recentActions[0].name).toBe("Node 1");
      expect(recentActions[1].name).toBe("Node 2");
    });
  });

  describe("getRecentActions", () => {
    it("should return only top 5 recent actions", () => {
      for (let i = 0; i < 10; i++) {
        useRecentActionsStore.getState().trackAction({
          id: `test-node-${i}`,
          type: "node",
          name: `Test Node ${i}`
        });
      }

      const recentActions = useRecentActionsStore.getState().getRecentActions();
      expect(recentActions).toHaveLength(5);
    });
  });

  describe("toggleFavorite", () => {
    it("should add a new favorite", () => {
      useRecentActionsStore.getState().toggleFavorite({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      const favorites = useRecentActionsStore.getState().favorites;
      expect(favorites).toHaveLength(1);
      expect(favorites[0]).toMatchObject({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });
    });

    it("should remove favorite if already favorited", () => {
      useRecentActionsStore.getState().toggleFavorite({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      expect(useRecentActionsStore.getState().favorites).toHaveLength(1);

      useRecentActionsStore.getState().toggleFavorite({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      expect(useRecentActionsStore.getState().favorites).toHaveLength(0);
    });

    it("should add multiple favorites", () => {
      useRecentActionsStore.getState().toggleFavorite({
        id: "test-node-1",
        type: "node",
        name: "Test Node 1"
      });

      useRecentActionsStore.getState().toggleFavorite({
        id: "test-template-1",
        type: "template",
        name: "Test Template"
      });

      const favorites = useRecentActionsStore.getState().favorites;
      expect(favorites).toHaveLength(2);
    });
  });

  describe("isFavorited", () => {
    it("should return true for favorited item", () => {
      useRecentActionsStore.getState().toggleFavorite({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      expect(useRecentActionsStore.getState().isFavorited("test-node-1", "node")).toBe(true);
    });

    it("should return false for non-favorited item", () => {
      expect(useRecentActionsStore.getState().isFavorited("test-node-1", "node")).toBe(false);
    });

    it("should return false for favorited item with different type", () => {
      useRecentActionsStore.getState().toggleFavorite({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      expect(useRecentActionsStore.getState().isFavorited("test-node-1", "template")).toBe(false);
    });
  });

  describe("removeFavorite", () => {
    it("should remove a favorite", () => {
      useRecentActionsStore.getState().toggleFavorite({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      expect(useRecentActionsStore.getState().favorites).toHaveLength(1);

      useRecentActionsStore.getState().removeFavorite("test-node-1", "node");

      expect(useRecentActionsStore.getState().favorites).toHaveLength(0);
    });
  });

  describe("clearRecentActions", () => {
    it("should clear all recent actions", () => {
      useRecentActionsStore.getState().trackAction({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      useRecentActionsStore.getState().trackAction({
        id: "test-node-2",
        type: "node",
        name: "Test Node 2"
      });

      expect(useRecentActionsStore.getState().recentActions).toHaveLength(2);

      useRecentActionsStore.getState().clearRecentActions();

      expect(useRecentActionsStore.getState().recentActions).toHaveLength(0);
    });
  });

  describe("clearAllFavorites", () => {
    it("should clear all favorites", () => {
      useRecentActionsStore.getState().toggleFavorite({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      useRecentActionsStore.getState().toggleFavorite({
        id: "test-template-1",
        type: "template",
        name: "Test Template"
      });

      expect(useRecentActionsStore.getState().favorites).toHaveLength(2);

      useRecentActionsStore.getState().clearAllFavorites();

      expect(useRecentActionsStore.getState().favorites).toHaveLength(0);
    });
  });

  describe("getFavorites", () => {
    it("should return all favorites", () => {
      useRecentActionsStore.getState().toggleFavorite({
        id: "test-node-1",
        type: "node",
        name: "Test Node"
      });

      useRecentActionsStore.getState().toggleFavorite({
        id: "test-template-1",
        type: "template",
        name: "Test Template"
      });

      const favorites = useRecentActionsStore.getState().getFavorites();
      expect(favorites).toHaveLength(2);
    });
  });
});
