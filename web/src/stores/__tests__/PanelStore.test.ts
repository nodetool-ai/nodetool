import { renderHook, act } from "@testing-library/react";
import { usePanelStore, PanelView } from "../PanelStore";

describe("PanelStore", () => {
  beforeEach(() => {
    usePanelStore.setState({
      panel: {
        panelSize: 500,
        isVisible: false,
        isDragging: false,
        hasDragged: false,
        minWidth: 60,
        maxWidth: 800,
        defaultWidth: 500,
        activeView: "workflowGrid"
      }
    });
  });

  describe("Initial State", () => {
    it("should have default panel size of 500", () => {
      const { result } = renderHook(() => usePanelStore());
      expect(result.current.panel.panelSize).toBe(500);
    });

    it("should be hidden by default", () => {
      const { result } = renderHook(() => usePanelStore());
      expect(result.current.panel.isVisible).toBe(false);
    });

    it("should not be dragging by default", () => {
      const { result } = renderHook(() => usePanelStore());
      expect(result.current.panel.isDragging).toBe(false);
    });

    it("should not have dragged by default", () => {
      const { result } = renderHook(() => usePanelStore());
      expect(result.current.panel.hasDragged).toBe(false);
    });

    it("should have min width of 60", () => {
      const { result } = renderHook(() => usePanelStore());
      expect(result.current.panel.minWidth).toBe(60);
    });

    it("should have max width of 800", () => {
      const { result } = renderHook(() => usePanelStore());
      expect(result.current.panel.maxWidth).toBe(800);
    });

    it("should have workflowGrid as active view", () => {
      const { result } = renderHook(() => usePanelStore());
      expect(result.current.panel.activeView).toBe("workflowGrid");
    });
  });

  describe("Size Operations", () => {
    it("should set size to valid value", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setSize(600);
      });

      expect(result.current.panel.panelSize).toBe(600);
    });

    it("should clamp size to minimum drag size", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setSize(30);
      });

      expect(result.current.panel.panelSize).toBe(60);
    });

    it("should clamp size to maximum", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setSize(1000);
      });

      expect(result.current.panel.panelSize).toBe(800);
    });

    it("should initialize panel size with default", () => {
      usePanelStore.setState({
        panel: {
          panelSize: 0,
          isVisible: false,
          isDragging: false,
          hasDragged: false,
          minWidth: 60,
          maxWidth: 800,
          defaultWidth: 500,
          activeView: "workflowGrid"
        }
      });

      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.initializePanelSize();
      });

      expect(result.current.panel.panelSize).toBe(500);
    });

    it("should initialize panel size with provided value", () => {
      usePanelStore.setState({
        panel: {
          panelSize: 0,
          isVisible: false,
          isDragging: false,
          hasDragged: false,
          minWidth: 60,
          maxWidth: 800,
          defaultWidth: 500,
          activeView: "workflowGrid"
        }
      });

      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.initializePanelSize(700);
      });

      expect(result.current.panel.panelSize).toBe(700);
    });

    it("should clamp initialized size to min panel size", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.initializePanelSize(300);
      });

      expect(result.current.panel.panelSize).toBe(400);
    });

    it("should clamp initialized size to max", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.initializePanelSize(900);
      });

      expect(result.current.panel.panelSize).toBe(800);
    });
  });

  describe("Dragging State", () => {
    it("should set isDragging to true", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setIsDragging(true);
      });

      expect(result.current.panel.isDragging).toBe(true);
    });

    it("should set isDragging to false", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setIsDragging(true);
        result.current.setIsDragging(false);
      });

      expect(result.current.panel.isDragging).toBe(false);
    });

    it("should set hasDragged to true", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setHasDragged(true);
      });

      expect(result.current.panel.hasDragged).toBe(true);
    });
  });

  describe("Active View", () => {
    it("should set active view to assets", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setActiveView("assets");
      });

      expect(result.current.panel.activeView).toBe("assets");
    });

    it("should set active view to workflowGrid", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setActiveView("workflowGrid");
      });

      expect(result.current.panel.activeView).toBe("workflowGrid");
    });
  });

  describe("Panel Visibility", () => {
    it("should show panel", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setVisibility(true);
      });

      expect(result.current.panel.isVisible).toBe(true);
    });

    it("should hide panel", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setVisibility(true);
        result.current.setVisibility(false);
      });

      expect(result.current.panel.isVisible).toBe(false);
    });

    it("should close panel and reset size", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setSize(700);
        result.current.setVisibility(true);
        result.current.closePanel();
      });

      expect(result.current.panel.isVisible).toBe(false);
      expect(result.current.panel.panelSize).toBe(60);
    });
  });

  describe("View Change Handler", () => {
    it("should show panel when clicking same view while hidden with small size", () => {
      usePanelStore.setState({
        panel: {
          panelSize: 200,
          isVisible: false,
          isDragging: false,
          hasDragged: false,
          minWidth: 60,
          maxWidth: 800,
          defaultWidth: 500,
          activeView: "workflowGrid"
        }
      });

      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.handleViewChange("workflowGrid");
      });

      expect(result.current.panel.isVisible).toBe(true);
      expect(result.current.panel.panelSize).toBe(400);
    });

    it("should toggle visibility when clicking same view", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setVisibility(true);
        result.current.handleViewChange("workflowGrid");
      });

      expect(result.current.panel.isVisible).toBe(false);
    });

    it("should switch view and show panel", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.handleViewChange("assets");
      });

      expect(result.current.panel.activeView).toBe("assets");
      expect(result.current.panel.isVisible).toBe(true);
    });

    it("should not toggle when switching to different view", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setVisibility(true);
        result.current.handleViewChange("assets");
      });

      expect(result.current.panel.isVisible).toBe(true);
    });
  });

  describe("Complete Panel Workflow", () => {
    it("should handle complete resize workflow", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.setVisibility(true);
        result.current.setSize(600);
        result.current.setIsDragging(true);
        result.current.setHasDragged(true);
        result.current.setIsDragging(false);
      });

      expect(result.current.panel.isVisible).toBe(true);
      expect(result.current.panel.panelSize).toBe(600);
      expect(result.current.panel.isDragging).toBe(false);
      expect(result.current.panel.hasDragged).toBe(true);
    });

    it("should handle view switch workflow", () => {
      const { result } = renderHook(() => usePanelStore());

      act(() => {
        result.current.handleViewChange("assets");
        result.current.setSize(650);
        result.current.handleViewChange("workflowGrid");
      });

      expect(result.current.panel.activeView).toBe("workflowGrid");
      expect(result.current.panel.isVisible).toBe(true);
      expect(result.current.panel.panelSize).toBe(650);
    });
  });
});
