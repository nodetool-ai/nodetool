import { useMiniMapStore } from "../MiniMapStore";

describe("MiniMapStore", () => {
  beforeEach(() => {
    useMiniMapStore.setState(useMiniMapStore.getInitialState());
  });

  afterEach(() => {
    useMiniMapStore.setState(useMiniMapStore.getInitialState());
  });

  describe("initial state", () => {
    it("should have visible set to false by default", () => {
      const state = useMiniMapStore.getState();
      expect(state.visible).toBe(false);
    });
  });

  describe("setVisible", () => {
    it("should set visible to true", () => {
      useMiniMapStore.getState().setVisible(true);
      expect(useMiniMapStore.getState().visible).toBe(true);
    });

    it("should set visible to false", () => {
      useMiniMapStore.getState().setVisible(true);
      useMiniMapStore.getState().setVisible(false);
      expect(useMiniMapStore.getState().visible).toBe(false);
    });

    it("should handle multiple setVisible calls", () => {
      useMiniMapStore.getState().setVisible(true);
      useMiniMapStore.getState().setVisible(true);
      useMiniMapStore.getState().setVisible(false);
      expect(useMiniMapStore.getState().visible).toBe(false);
    });
  });

  describe("toggleVisible", () => {
    it("should toggle from false to true", () => {
      expect(useMiniMapStore.getState().visible).toBe(false);
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(true);
    });

    it("should toggle from true to false", () => {
      useMiniMapStore.getState().setVisible(true);
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(false);
    });

    it("should toggle multiple times", () => {
      expect(useMiniMapStore.getState().visible).toBe(false);
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(true);
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(false);
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(true);
    });
  });
});
