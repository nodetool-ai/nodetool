import { useMiniMapStore } from "../MiniMapStore";

describe("MiniMapStore", () => {
  beforeEach(() => {
    useMiniMapStore.setState(useMiniMapStore.getInitialState());
  });

  describe("initial state", () => {
    it("should initialize with visible set to false", () => {
      const state = useMiniMapStore.getInitialState();
      expect(state.visible).toBe(false);
    });
  });

  describe("setVisible", () => {
    it("should set visible to true", () => {
      useMiniMapStore.getState().setVisible(true);
      expect(useMiniMapStore.getState().visible).toBe(true);
    });

    it("should set visible to false", () => {
      useMiniMapStore.setState({ visible: true });
      useMiniMapStore.getState().setVisible(false);
      expect(useMiniMapStore.getState().visible).toBe(false);
    });

    it("should handle explicit true value", () => {
      useMiniMapStore.setState({ visible: false });
      useMiniMapStore.getState().setVisible(true);
      expect(useMiniMapStore.getState().visible).toBe(true);
    });
  });

  describe("toggleVisible", () => {
    it("should toggle visible from false to true", () => {
      useMiniMapStore.setState({ visible: false });
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(true);
    });

    it("should toggle visible from true to false", () => {
      useMiniMapStore.setState({ visible: true });
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

  describe("state transitions", () => {
    it("should handle show and hide flow", () => {
      expect(useMiniMapStore.getState().visible).toBe(false);

      useMiniMapStore.getState().setVisible(true);
      expect(useMiniMapStore.getState().visible).toBe(true);

      useMiniMapStore.getState().setVisible(false);
      expect(useMiniMapStore.getState().visible).toBe(false);
    });

    it("should handle toggle after setVisible", () => {
      useMiniMapStore.setState({ visible: true });
      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(false);

      useMiniMapStore.getState().toggleVisible();
      expect(useMiniMapStore.getState().visible).toBe(true);
    });
  });
});
