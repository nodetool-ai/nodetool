import { usePanelStore } from "../PanelStore";

describe("PanelStore", () => {
  beforeEach(() => {
    usePanelStore.setState(usePanelStore.getInitialState());
  });

  afterEach(() => {
    const state = usePanelStore.getState();
    if (state.panel.isDragging) {
      usePanelStore.setState({
        panel: { ...state.panel, isDragging: false, hasDragged: false }
      });
    }
  });

  it("initializes with correct default state", () => {
    const state = usePanelStore.getState();
    expect(state.panel.panelSize).toBe(500);
    expect(state.panel.isVisible).toBe(false);
    expect(state.panel.isDragging).toBe(false);
    expect(state.panel.hasDragged).toBe(false);
    expect(state.panel.activeView).toBe("workflowGrid");
  });

  describe("setSize", () => {
    it("sets panel size within valid range", () => {
      usePanelStore.getState().setSize(600);
      expect(usePanelStore.getState().panel.panelSize).toBe(600);
    });

    it("clamps size to maximum (800)", () => {
      usePanelStore.getState().setSize(1000);
      expect(usePanelStore.getState().panel.panelSize).toBe(800);
    });

    it("collapses to minimum drag size (60) when size is below minimum", () => {
      usePanelStore.getState().setSize(30);
      expect(usePanelStore.getState().panel.panelSize).toBe(60);
    });

    it("collapses to minimum drag size when size equals minimum", () => {
      usePanelStore.getState().setSize(60);
      expect(usePanelStore.getState().panel.panelSize).toBe(60);
    });
  });

  describe("setIsDragging", () => {
    it("sets dragging state to true", () => {
      usePanelStore.getState().setIsDragging(true);
      expect(usePanelStore.getState().panel.isDragging).toBe(true);
    });

    it("sets dragging state to false", () => {
      usePanelStore.setState({ panel: { ...usePanelStore.getState().panel, isDragging: true } });
      usePanelStore.getState().setIsDragging(false);
      expect(usePanelStore.getState().panel.isDragging).toBe(false);
    });
  });

  describe("setHasDragged", () => {
    it("sets hasDragged state to true", () => {
      usePanelStore.getState().setHasDragged(true);
      expect(usePanelStore.getState().panel.hasDragged).toBe(true);
    });

    it("sets hasDragged state to false", () => {
      usePanelStore.setState({ panel: { ...usePanelStore.getState().panel, hasDragged: true } });
      usePanelStore.getState().setHasDragged(false);
      expect(usePanelStore.getState().panel.hasDragged).toBe(false);
    });
  });

  describe("initializePanelSize", () => {
    it("initializes with default size when no size provided", () => {
      usePanelStore.getState().initializePanelSize();
      expect(usePanelStore.getState().panel.panelSize).toBe(500);
    });

    it("initializes with provided size when within valid range", () => {
      usePanelStore.getState().initializePanelSize(400);
      expect(usePanelStore.getState().panel.panelSize).toBe(400);
    });

    it("clamps size to minimum panel size (400) when size is below", () => {
      usePanelStore.getState().initializePanelSize(300);
      expect(usePanelStore.getState().panel.panelSize).toBe(400);
    });

    it("clamps size to maximum (800) when size is above", () => {
      usePanelStore.getState().initializePanelSize(900);
      expect(usePanelStore.getState().panel.panelSize).toBe(800);
    });
  });

  describe("setActiveView", () => {
    it("sets active view to assets", () => {
      usePanelStore.getState().setActiveView("assets");
      expect(usePanelStore.getState().panel.activeView).toBe("assets");
    });

    it("sets active view to workflowGrid", () => {
      usePanelStore.getState().setActiveView("workflowGrid");
      expect(usePanelStore.getState().panel.activeView).toBe("workflowGrid");
    });
  });

  describe("closePanel", () => {
    it("closes panel and collapses to minimum size", () => {
      usePanelStore.setState({ panel: { ...usePanelStore.getState().panel, panelSize: 500, isVisible: true } });
      usePanelStore.getState().closePanel();
      expect(usePanelStore.getState().panel.panelSize).toBe(60);
      expect(usePanelStore.getState().panel.isVisible).toBe(false);
    });
  });

  describe("setVisibility", () => {
    it("sets visibility to true", () => {
      usePanelStore.getState().setVisibility(true);
      expect(usePanelStore.getState().panel.isVisible).toBe(true);
    });

    it("sets visibility to false", () => {
      usePanelStore.setState({ panel: { ...usePanelStore.getState().panel, isVisible: true } });
      usePanelStore.getState().setVisibility(false);
      expect(usePanelStore.getState().panel.isVisible).toBe(false);
    });
  });

  describe("handleViewChange", () => {
    it("toggles visibility when clicking same view", () => {
      usePanelStore.setState({
        panel: { ...usePanelStore.getState().panel, activeView: "workflowGrid", isVisible: true }
      });
      usePanelStore.getState().handleViewChange("workflowGrid");
      expect(usePanelStore.getState().panel.isVisible).toBe(false);
    });

    it("shows panel when clicking same view while hidden", () => {
      usePanelStore.setState({
        panel: { ...usePanelStore.getState().panel, activeView: "workflowGrid", isVisible: false, panelSize: 60 }
      });
      usePanelStore.getState().handleViewChange("workflowGrid");
      expect(usePanelStore.getState().panel.isVisible).toBe(true);
      expect(usePanelStore.getState().panel.panelSize).toBe(400);
    });

    it("switches view and shows panel when clicking different view", () => {
      usePanelStore.setState({
        panel: { ...usePanelStore.getState().panel, activeView: "workflowGrid", isVisible: false }
      });
      usePanelStore.getState().handleViewChange("assets");
      expect(usePanelStore.getState().panel.activeView).toBe("assets");
      expect(usePanelStore.getState().panel.isVisible).toBe(true);
    });

    it("keeps panel visible when switching to different view", () => {
      usePanelStore.setState({
        panel: { ...usePanelStore.getState().panel, activeView: "workflowGrid", isVisible: true }
      });
      usePanelStore.getState().handleViewChange("assets");
      expect(usePanelStore.getState().panel.activeView).toBe("assets");
      expect(usePanelStore.getState().panel.isVisible).toBe(true);
    });
  });
});
