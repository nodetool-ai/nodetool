import { act } from "@testing-library/react";
import { useMiniMapStore } from "../MiniMapStore";

describe("MiniMapStore", () => {
  beforeEach(() => {
    useMiniMapStore.setState({
      visible: false
    });
  });

  describe("initial state", () => {
    test("should initialize with visible set to false", () => {
      expect(useMiniMapStore.getState().visible).toBe(false);
    });
  });

  describe("setVisible", () => {
    test("should set visibility to true", () => {
      act(() => {
        useMiniMapStore.getState().setVisible(true);
      });

      expect(useMiniMapStore.getState().visible).toBe(true);
    });

    test("should set visibility to false", () => {
      act(() => {
        useMiniMapStore.getState().setVisible(true);
        useMiniMapStore.getState().setVisible(false);
      });

      expect(useMiniMapStore.getState().visible).toBe(false);
    });
  });

  describe("toggleVisible", () => {
    test("should toggle visibility from false to true", () => {
      act(() => {
        useMiniMapStore.getState().toggleVisible();
      });

      expect(useMiniMapStore.getState().visible).toBe(true);
    });

    test("should toggle visibility from true to false", () => {
      act(() => {
        useMiniMapStore.getState().setVisible(true);
        useMiniMapStore.getState().toggleVisible();
      });

      expect(useMiniMapStore.getState().visible).toBe(false);
    });

    test("should handle multiple toggle operations", () => {
      act(() => {
        useMiniMapStore.getState().toggleVisible();
        useMiniMapStore.getState().toggleVisible();
        useMiniMapStore.getState().toggleVisible();
      });

      expect(useMiniMapStore.getState().visible).toBe(true);
    });
  });

  describe("explicit setVisible values", () => {
    test("should handle setVisible with explicit true value", () => {
      act(() => {
        useMiniMapStore.getState().setVisible(true);
      });

      expect(useMiniMapStore.getState().visible).toBe(true);
    });

    test("should handle setVisible with explicit false value", () => {
      act(() => {
        useMiniMapStore.getState().setVisible(false);
      });

      expect(useMiniMapStore.getState().visible).toBe(false);
    });
  });
});
