import { act } from "@testing-library/react";
import { useRightPanelStore } from "../RightPanelStore";

describe("RightPanelStore", () => {
  beforeEach(() => {
    // Reset store to initial state
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

    it("has correct default view", () => {
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
        setSize(800); // Above MAX_PANEL_SIZE (600)
      });

      expect(useRightPanelStore.getState().panel.panelSize).toBe(600);
    });

    it("constrains size to minimum drag size", () => {
      const { setSize } = useRightPanelStore.getState();
      act(() => {
        setSize(50); // Below MIN_DRAG_SIZE (60)
      });

      expect(useRightPanelStore.getState().panel.panelSize).toBe(60);
    });
  });

  describe("setActiveView", () => {
    it("sets active view to inspector", () => {
      const { setActiveView } = useRightPanelStore.getState();
      act(() => {
        setActiveView("inspector");
      });

      expect(useRightPanelStore.getState().panel.activeView).toBe("inspector");
    });

    it("sets active view to assistant", () => {
      const { setActiveView } = useRightPanelStore.getState();
      act(() => {
        setActiveView("assistant");
      });

      expect(useRightPanelStore.getState().panel.activeView).toBe("assistant");
    });

    it("sets active view to logs", () => {
      const { setActiveView } = useRightPanelStore.getState();
      act(() => {
        setActiveView("logs");
      });

      expect(useRightPanelStore.getState().panel.activeView).toBe("logs");
    });
  });

  describe("handleViewChange", () => {
    it("shows panel when changing to new view", () => {
      const { handleViewChange } = useRightPanelStore.getState();
      act(() => {
        handleViewChange("assistant");
      });

      const { panel } = useRightPanelStore.getState();
      expect(panel.activeView).toBe("assistant");
      expect(panel.isVisible).toBe(true);
    });

    it("toggles visibility when clicking same view", () => {
      const { handleViewChange } = useRightPanelStore.getState();
      
      act(() => {
        handleViewChange("inspector"); // Open
      });
      expect(useRightPanelStore.getState().panel.isVisible).toBe(true);

      act(() => {
        handleViewChange("inspector"); // Toggle
      });
      expect(useRightPanelStore.getState().panel.isVisible).toBe(false);
    });

    it("expands panel to minimum size when clicking same view with small panel", () => {
      const { handleViewChange, setSize, setVisibility } = useRightPanelStore.getState();
      
      act(() => {
        setSize(100); // Below MIN_PANEL_SIZE (250)
        setVisibility(false);
        handleViewChange("inspector");
      });

      const { panel } = useRightPanelStore.getState();
      expect(panel.panelSize).toBe(250); // MIN_PANEL_SIZE (DEFAULT_PANEL_SIZE - 100)
      expect(panel.isVisible).toBe(true);
    });

    it("switches views and shows panel", () => {
      const { handleViewChange } = useRightPanelStore.getState();
      
      act(() => {
        handleViewChange("inspector");
      });
      expect(useRightPanelStore.getState().panel.activeView).toBe("inspector");

      act(() => {
        handleViewChange("assistant");
      });
      expect(useRightPanelStore.getState().panel.activeView).toBe("assistant");
      expect(useRightPanelStore.getState().panel.isVisible).toBe(true);
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
      expect(panel.panelSize).toBe(60); // MIN_DRAG_SIZE
    });
  });
});
