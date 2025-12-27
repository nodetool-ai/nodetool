import { act } from "@testing-library/react";
import { useBottomPanelStore } from "../BottomPanelStore";

describe("BottomPanelStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    const store = useBottomPanelStore.getState();
    store.closePanel();
    store.setHasDragged(false);
    store.setIsDragging(false);
    store.initializePanelSize(300);
  });

  describe("initial state", () => {
    it("has default panel size", () => {
      const { panel } = useBottomPanelStore.getState();
      expect(panel.panelSize).toBe(300);
    });

    it("is not visible initially", () => {
      const { panel } = useBottomPanelStore.getState();
      expect(panel.isVisible).toBe(false);
    });

    it("is not dragging initially", () => {
      const { panel } = useBottomPanelStore.getState();
      expect(panel.isDragging).toBe(false);
      expect(panel.hasDragged).toBe(false);
    });

    it("has correct default view", () => {
      const { panel } = useBottomPanelStore.getState();
      expect(panel.activeView).toBe("terminal");
    });

    it("has correct size constraints", () => {
      const { panel } = useBottomPanelStore.getState();
      expect(panel.minHeight).toBe(40);
      expect(panel.maxHeight).toBe(600);
      expect(panel.defaultHeight).toBe(300);
    });
  });

  describe("setSize", () => {
    it("sets panel size within valid range", () => {
      const { setSize } = useBottomPanelStore.getState();
      act(() => {
        setSize(400);
      });

      expect(useBottomPanelStore.getState().panel.panelSize).toBe(400);
    });

    it("constrains size to maximum", () => {
      const { setSize } = useBottomPanelStore.getState();
      act(() => {
        setSize(800); // Above MAX_PANEL_SIZE (600)
      });

      expect(useBottomPanelStore.getState().panel.panelSize).toBe(600);
    });

    it("constrains size to minimum drag size", () => {
      const { setSize } = useBottomPanelStore.getState();
      act(() => {
        setSize(30); // Below MIN_DRAG_SIZE (40)
      });

      expect(useBottomPanelStore.getState().panel.panelSize).toBe(40);
    });

    it("sets size to exact MIN_DRAG_SIZE when size is zero", () => {
      const { setSize } = useBottomPanelStore.getState();
      act(() => {
        setSize(0);
      });

      expect(useBottomPanelStore.getState().panel.panelSize).toBe(40);
    });
  });

  describe("setIsDragging", () => {
    it("sets dragging state to true", () => {
      const { setIsDragging } = useBottomPanelStore.getState();
      act(() => {
        setIsDragging(true);
      });

      expect(useBottomPanelStore.getState().panel.isDragging).toBe(true);
    });

    it("sets dragging state to false", () => {
      const { setIsDragging } = useBottomPanelStore.getState();
      act(() => {
        setIsDragging(true);
        setIsDragging(false);
      });

      expect(useBottomPanelStore.getState().panel.isDragging).toBe(false);
    });
  });

  describe("setHasDragged", () => {
    it("sets hasDragged state to true", () => {
      const { setHasDragged } = useBottomPanelStore.getState();
      act(() => {
        setHasDragged(true);
      });

      expect(useBottomPanelStore.getState().panel.hasDragged).toBe(true);
    });

    it("sets hasDragged state to false", () => {
      const { setHasDragged } = useBottomPanelStore.getState();
      act(() => {
        setHasDragged(true);
        setHasDragged(false);
      });

      expect(useBottomPanelStore.getState().panel.hasDragged).toBe(false);
    });
  });

  describe("initializePanelSize", () => {
    it("initializes panel with provided size", () => {
      const { initializePanelSize } = useBottomPanelStore.getState();
      act(() => {
        initializePanelSize(350);
      });

      expect(useBottomPanelStore.getState().panel.panelSize).toBe(350);
    });

    it("initializes panel with default size when no size provided", () => {
      const { initializePanelSize } = useBottomPanelStore.getState();
      act(() => {
        initializePanelSize();
      });

      expect(useBottomPanelStore.getState().panel.panelSize).toBe(300);
    });

    it("constrains initialization to minimum panel size", () => {
      const { initializePanelSize } = useBottomPanelStore.getState();
      act(() => {
        initializePanelSize(100); // Below MIN_PANEL_SIZE (200)
      });

      expect(useBottomPanelStore.getState().panel.panelSize).toBe(200);
    });

    it("constrains initialization to maximum panel size", () => {
      const { initializePanelSize } = useBottomPanelStore.getState();
      act(() => {
        initializePanelSize(700); // Above MAX_PANEL_SIZE (600)
      });

      expect(useBottomPanelStore.getState().panel.panelSize).toBe(600);
    });
  });

  describe("setActiveView", () => {
    it("sets active view to terminal", () => {
      const { setActiveView } = useBottomPanelStore.getState();
      act(() => {
        setActiveView("terminal");
      });

      expect(useBottomPanelStore.getState().panel.activeView).toBe("terminal");
    });
  });

  describe("closePanel", () => {
    it("closes panel and sets size to minimum", () => {
      const { closePanel, setVisibility, setSize } = useBottomPanelStore.getState();
      
      act(() => {
        setSize(400);
        setVisibility(true);
        closePanel();
      });

      const { panel } = useBottomPanelStore.getState();
      expect(panel.isVisible).toBe(false);
      expect(panel.panelSize).toBe(40); // MIN_DRAG_SIZE
    });
  });

  describe("setVisibility", () => {
    it("sets panel visible", () => {
      const { setVisibility } = useBottomPanelStore.getState();
      act(() => {
        setVisibility(true);
      });

      expect(useBottomPanelStore.getState().panel.isVisible).toBe(true);
    });

    it("sets panel hidden", () => {
      const { setVisibility } = useBottomPanelStore.getState();
      act(() => {
        setVisibility(true);
        setVisibility(false);
      });

      expect(useBottomPanelStore.getState().panel.isVisible).toBe(false);
    });
  });

  describe("handleViewChange", () => {
    it("shows panel when changing to new view", () => {
      const { handleViewChange } = useBottomPanelStore.getState();
      act(() => {
        handleViewChange("terminal");
      });

      const { panel } = useBottomPanelStore.getState();
      expect(panel.activeView).toBe("terminal");
      expect(panel.isVisible).toBe(true);
    });

    it("toggles visibility when clicking same view", () => {
      const { handleViewChange } = useBottomPanelStore.getState();
      
      act(() => {
        handleViewChange("terminal"); // Open
      });
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(true);

      act(() => {
        handleViewChange("terminal"); // Toggle
      });
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(false);

      act(() => {
        handleViewChange("terminal"); // Toggle again
      });
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(true);
    });

    it("expands panel to minimum size when clicking same view with small panel", () => {
      const { handleViewChange, setSize, setVisibility } = useBottomPanelStore.getState();
      
      act(() => {
        setSize(100); // Below MIN_PANEL_SIZE
        setVisibility(false);
        handleViewChange("terminal");
      });

      const { panel } = useBottomPanelStore.getState();
      expect(panel.panelSize).toBe(200); // MIN_PANEL_SIZE
      expect(panel.isVisible).toBe(true);
    });
  });
});
