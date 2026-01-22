import { renderHook, act } from "@testing-library/react";
import { useBottomPanelStore, BottomPanelView } from "../BottomPanelStore";

describe("BottomPanelStore", () => {
  beforeEach(() => {
    useBottomPanelStore.setState({
      panel: {
        panelSize: 300,
        isVisible: false,
        isDragging: false,
        hasDragged: false,
        minHeight: 40,
        maxHeight: 600,
        defaultHeight: 300,
        activeView: "terminal"
      }
    });
  });

  describe("Initial State", () => {
    it("should have default panel size of 300", () => {
      const { result } = renderHook(() => useBottomPanelStore());
      expect(result.current.panel.panelSize).toBe(300);
    });

    it("should be hidden by default", () => {
      const { result } = renderHook(() => useBottomPanelStore());
      expect(result.current.panel.isVisible).toBe(false);
    });

    it("should not be dragging by default", () => {
      const { result } = renderHook(() => useBottomPanelStore());
      expect(result.current.panel.isDragging).toBe(false);
    });

    it("should not have dragged by default", () => {
      const { result } = renderHook(() => useBottomPanelStore());
      expect(result.current.panel.hasDragged).toBe(false);
    });

    it("should have min height of 40", () => {
      const { result } = renderHook(() => useBottomPanelStore());
      expect(result.current.panel.minHeight).toBe(40);
    });

    it("should have max height of 600", () => {
      const { result } = renderHook(() => useBottomPanelStore());
      expect(result.current.panel.maxHeight).toBe(600);
    });

    it("should have terminal as active view", () => {
      const { result } = renderHook(() => useBottomPanelStore());
      expect(result.current.panel.activeView).toBe("terminal");
    });
  });

  describe("Size Operations", () => {
    it("should set size to valid value", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setSize(400);
      });

      expect(result.current.panel.panelSize).toBe(400);
    });

    it("should clamp size to minimum", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setSize(20);
      });

      expect(result.current.panel.panelSize).toBe(40);
    });

    it("should clamp size to maximum", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setSize(800);
      });

      expect(result.current.panel.panelSize).toBe(600);
    });

    it("should initialize panel size with default", () => {
      useBottomPanelStore.setState({
        panel: {
          panelSize: 0,
          isVisible: false,
          isDragging: false,
          hasDragged: false,
          minHeight: 40,
          maxHeight: 600,
          defaultHeight: 300,
          activeView: "terminal"
        }
      });

      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.initializePanelSize();
      });

      expect(result.current.panel.panelSize).toBe(300);
    });

    it("should initialize panel size with provided value", () => {
      useBottomPanelStore.setState({
        panel: {
          panelSize: 0,
          isVisible: false,
          isDragging: false,
          hasDragged: false,
          minHeight: 40,
          maxHeight: 600,
          defaultHeight: 300,
          activeView: "terminal"
        }
      });

      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.initializePanelSize(500);
      });

      expect(result.current.panel.panelSize).toBe(500);
    });

    it("should clamp initialized size to min", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.initializePanelSize(100);
      });

      expect(result.current.panel.panelSize).toBe(200);
    });

    it("should clamp initialized size to max", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.initializePanelSize(800);
      });

      expect(result.current.panel.panelSize).toBe(600);
    });
  });

  describe("Dragging State", () => {
    it("should set isDragging to true", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setIsDragging(true);
      });

      expect(result.current.panel.isDragging).toBe(true);
    });

    it("should set isDragging to false", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setIsDragging(true);
        result.current.setIsDragging(false);
      });

      expect(result.current.panel.isDragging).toBe(false);
    });

    it("should set hasDragged to true", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setHasDragged(true);
      });

      expect(result.current.panel.hasDragged).toBe(true);
    });
  });

  describe("Active View", () => {
    it("should set active view", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setActiveView("terminal");
      });

      expect(result.current.panel.activeView).toBe("terminal");
    });
  });

  describe("Panel Visibility", () => {
    it("should show panel", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setVisibility(true);
      });

      expect(result.current.panel.isVisible).toBe(true);
    });

    it("should hide panel", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setVisibility(true);
        result.current.setVisibility(false);
      });

      expect(result.current.panel.isVisible).toBe(false);
    });

    it("should close panel and reset size", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setSize(500);
        result.current.setVisibility(true);
        result.current.closePanel();
      });

      expect(result.current.panel.isVisible).toBe(false);
      expect(result.current.panel.panelSize).toBe(40);
    });
  });

  describe("View Change Handler", () => {
    it("should show panel when clicking same view while hidden with small size", () => {
      useBottomPanelStore.setState({
        panel: {
          panelSize: 100,
          isVisible: false,
          isDragging: false,
          hasDragged: false,
          minHeight: 40,
          maxHeight: 600,
          defaultHeight: 300,
          activeView: "terminal"
        }
      });

      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.handleViewChange("terminal");
      });

      expect(result.current.panel.isVisible).toBe(true);
      expect(result.current.panel.panelSize).toBe(200);
    });

    it("should toggle visibility when clicking same view", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setVisibility(true);
        result.current.handleViewChange("terminal");
      });

      expect(result.current.panel.isVisible).toBe(false);
    });

    it("should switch view and show panel", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.handleViewChange("terminal" as BottomPanelView);
        result.current.handleViewChange("other" as BottomPanelView);
      });

      expect(result.current.panel.activeView).toBe("other");
      expect(result.current.panel.isVisible).toBe(true);
    });

    it("should not toggle when switching to different view", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setVisibility(true);
        result.current.handleViewChange("other" as BottomPanelView);
      });

      expect(result.current.panel.isVisible).toBe(true);
    });
  });

  describe("Complete Panel Workflow", () => {
    it("should handle complete resize workflow", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.setVisibility(true);
        result.current.setSize(400);
        result.current.setIsDragging(true);
        result.current.setHasDragged(true);
        result.current.setIsDragging(false);
      });

      expect(result.current.panel.isVisible).toBe(true);
      expect(result.current.panel.panelSize).toBe(400);
      expect(result.current.panel.isDragging).toBe(false);
      expect(result.current.panel.hasDragged).toBe(true);
    });

    it("should handle view switch workflow", () => {
      const { result } = renderHook(() => useBottomPanelStore());

      act(() => {
        result.current.handleViewChange("view1" as BottomPanelView);
        result.current.setSize(450);
        result.current.handleViewChange("view2" as BottomPanelView);
      });

      expect(result.current.panel.activeView).toBe("view2");
      expect(result.current.panel.isVisible).toBe(true);
      expect(result.current.panel.panelSize).toBe(450);
    });
  });
});
