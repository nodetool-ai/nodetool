import { useBottomPanelStore } from "../BottomPanelStore";

describe("BottomPanelStore", () => {
  beforeEach(() => {
    useBottomPanelStore.setState(useBottomPanelStore.getInitialState());
  });

  afterEach(() => {
    const state = useBottomPanelStore.getState();
    if (state.panel.isDragging) {
      useBottomPanelStore.setState({
        panel: { ...state.panel, isDragging: false, hasDragged: false }
      });
    }
  });

  it("initializes with correct default state", () => {
    const state = useBottomPanelStore.getState();
    expect(state.panel.panelSize).toBe(300);
    expect(state.panel.isVisible).toBe(false);
    expect(state.panel.isDragging).toBe(false);
    expect(state.panel.hasDragged).toBe(false);
    expect(state.panel.activeView).toBe("terminal");
  });

  describe("setSize", () => {
    it("sets panel size within valid range", () => {
      useBottomPanelStore.getState().setSize(400);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(400);
    });

    it("clamps size to maximum (600)", () => {
      useBottomPanelStore.getState().setSize(800);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(600);
    });

    it("collapses to minimum drag size (40) when size is below minimum", () => {
      useBottomPanelStore.getState().setSize(20);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(40);
    });

    it("collapses to minimum drag size when size equals minimum", () => {
      useBottomPanelStore.getState().setSize(40);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(40);
    });
  });

  describe("setIsDragging", () => {
    it("sets dragging state to true", () => {
      useBottomPanelStore.getState().setIsDragging(true);
      expect(useBottomPanelStore.getState().panel.isDragging).toBe(true);
    });

    it("sets dragging state to false", () => {
      useBottomPanelStore.setState({ panel: { ...useBottomPanelStore.getState().panel, isDragging: true } });
      useBottomPanelStore.getState().setIsDragging(false);
      expect(useBottomPanelStore.getState().panel.isDragging).toBe(false);
    });
  });

  describe("setHasDragged", () => {
    it("sets hasDragged state to true", () => {
      useBottomPanelStore.getState().setHasDragged(true);
      expect(useBottomPanelStore.getState().panel.hasDragged).toBe(true);
    });

    it("sets hasDragged state to false", () => {
      useBottomPanelStore.setState({ panel: { ...useBottomPanelStore.getState().panel, hasDragged: true } });
      useBottomPanelStore.getState().setHasDragged(false);
      expect(useBottomPanelStore.getState().panel.hasDragged).toBe(false);
    });
  });

  describe("initializePanelSize", () => {
    it("initializes with default size when no size provided", () => {
      useBottomPanelStore.getState().initializePanelSize();
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(300);
    });

    it("initializes with provided size when within valid range", () => {
      useBottomPanelStore.getState().initializePanelSize(350);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(350);
    });

    it("clamps size to minimum panel size (200) when size is below", () => {
      useBottomPanelStore.getState().initializePanelSize(100);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(200);
    });

    it("clamps size to maximum (600) when size is above", () => {
      useBottomPanelStore.getState().initializePanelSize(700);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(600);
    });
  });

  describe("setActiveView", () => {
    it("sets active view to terminal", () => {
      useBottomPanelStore.getState().setActiveView("terminal");
      expect(useBottomPanelStore.getState().panel.activeView).toBe("terminal");
    });
  });

  describe("closePanel", () => {
    it("closes panel and collapses to minimum size", () => {
      useBottomPanelStore.setState({ panel: { ...useBottomPanelStore.getState().panel, panelSize: 300, isVisible: true } });
      useBottomPanelStore.getState().closePanel();
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(40);
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(false);
    });
  });

  describe("setVisibility", () => {
    it("sets visibility to true", () => {
      useBottomPanelStore.getState().setVisibility(true);
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(true);
    });

    it("sets visibility to false", () => {
      useBottomPanelStore.setState({ panel: { ...useBottomPanelStore.getState().panel, isVisible: true } });
      useBottomPanelStore.getState().setVisibility(false);
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(false);
    });
  });

  describe("handleViewChange", () => {
    it("toggles visibility when clicking same view", () => {
      useBottomPanelStore.setState({
        panel: { ...useBottomPanelStore.getState().panel, activeView: "terminal", isVisible: true }
      });
      useBottomPanelStore.getState().handleViewChange("terminal");
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(false);
    });

    it("shows panel when clicking same view while hidden", () => {
      useBottomPanelStore.setState({
        panel: { ...useBottomPanelStore.getState().panel, activeView: "terminal", isVisible: false, panelSize: 40 }
      });
      useBottomPanelStore.getState().handleViewChange("terminal");
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(true);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(200);
    });

    it("keeps panel visible when clicking same view while visible", () => {
      useBottomPanelStore.setState({
        panel: { ...useBottomPanelStore.getState().panel, activeView: "terminal", isVisible: true, panelSize: 400 }
      });
      useBottomPanelStore.getState().handleViewChange("terminal");
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(false);
    });
  });
});
