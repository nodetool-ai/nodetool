import { act } from "@testing-library/react";
import { useRightPanelStore } from "../RightPanelStore";

describe("RightPanelStore", () => {
  beforeEach(() => {
    const store = useRightPanelStore.getState();
    store.closePanel();
    store.setHasDragged(false);
    store.setIsDragging(false);
    store.initializePanelSize(350);
  });

  describe("initial state", () => {
    it("has default panel size", () => {
      const { panel } = useRightPanelStore.getState();
      expect(panel.panelSize).toBe(350);
    });

    it("is not visible initially", () => {
      const { panel } = useRightPanelStore.getState();
      expect(panel.isVisible).toBe(false);
    });

    it("is not dragging initially", () => {
      const { panel } = useRightPanelStore.getState();
      expect(panel.isDragging).toBe(false);
      expect(panel.hasDragged).toBe(false);
    });

    it("has inspector as the only view", () => {
      const { panel } = useRightPanelStore.getState();
      expect(panel.activeView).toBe("inspector");
    });

    it("has correct size constraints", () => {
      const { panel } = useRightPanelStore.getState();
      expect(panel.minWidth).toBe(60);
      expect(panel.maxWidth).toBe(600);
      expect(panel.defaultWidth).toBe(350);
    });
  });

  describe("setSize", () => {
    it("sets panel size within valid range", () => {
      const { setSize } = useRightPanelStore.getState();
      act(() => {
        setSize(400);
      });
      expect(useRightPanelStore.getState().panel.panelSize).toBe(400);
    });

    it("constrains size to maximum", () => {
      const { setSize } = useRightPanelStore.getState();
      act(() => {
        setSize(800);
      });
      expect(useRightPanelStore.getState().panel.panelSize).toBe(600);
    });

    it("constrains size to minimum drag size", () => {
      const { setSize } = useRightPanelStore.getState();
      act(() => {
        setSize(50);
      });
      expect(useRightPanelStore.getState().panel.panelSize).toBe(60);
    });
  });

  describe("handleViewChange", () => {
    it("opens the inspector panel", () => {
      const { handleViewChange } = useRightPanelStore.getState();
      act(() => {
        handleViewChange("inspector");
      });

      const { panel } = useRightPanelStore.getState();
      expect(panel.activeView).toBe("inspector");
      expect(panel.isVisible).toBe(true);
    });

    it("toggles visibility when clicking the active view again", () => {
      const { handleViewChange } = useRightPanelStore.getState();

      act(() => {
        handleViewChange("inspector");
      });
      expect(useRightPanelStore.getState().panel.isVisible).toBe(true);

      act(() => {
        handleViewChange("inspector");
      });
      expect(useRightPanelStore.getState().panel.isVisible).toBe(false);
    });

    it("expands panel to minimum size when reopening from a collapsed state", () => {
      const { handleViewChange, setSize, setVisibility } =
        useRightPanelStore.getState();

      act(() => {
        setSize(100);
        setVisibility(false);
        handleViewChange("inspector");
      });

      const { panel } = useRightPanelStore.getState();
      expect(panel.panelSize).toBe(250);
      expect(panel.isVisible).toBe(true);
    });
  });

  describe("setVisibility", () => {
    it("restores the panel to the usable minimum when reopening from a collapsed sliver", () => {
      const { closePanel, setVisibility } = useRightPanelStore.getState();

      act(() => {
        // Drag-collapse persists panelSize: 60 (MIN_DRAG_SIZE) and hides.
        closePanel();
        setVisibility(true);
      });

      const { panel } = useRightPanelStore.getState();
      expect(panel.isVisible).toBe(true);
      expect(panel.panelSize).toBe(250);
    });

    it("keeps the current size when reopening with a usable size", () => {
      const { setSize, setVisibility } = useRightPanelStore.getState();

      act(() => {
        setSize(400);
        setVisibility(false);
        setVisibility(true);
      });

      const { panel } = useRightPanelStore.getState();
      expect(panel.isVisible).toBe(true);
      expect(panel.panelSize).toBe(400);
    });

    it("does not resize when hiding the panel", () => {
      const { setSize, setVisibility } = useRightPanelStore.getState();

      act(() => {
        setSize(60);
        setVisibility(false);
      });

      const { panel } = useRightPanelStore.getState();
      expect(panel.isVisible).toBe(false);
      expect(panel.panelSize).toBe(60);
    });
  });

  describe("closePanel", () => {
    it("closes panel and sets size to minimum", () => {
      const { closePanel, setVisibility, setSize } = useRightPanelStore.getState();

      act(() => {
        setSize(400);
        setVisibility(true);
        closePanel();
      });

      const { panel } = useRightPanelStore.getState();
      expect(panel.isVisible).toBe(false);
      expect(panel.panelSize).toBe(60);
    });
  });
});
