import { useBottomPanelStore } from "../BottomPanelStore";

describe("BottomPanelStore", () => {
  beforeEach(() => {
    useBottomPanelStore.setState(useBottomPanelStore.getInitialState());
  });

  afterEach(() => {
    useBottomPanelStore.setState(useBottomPanelStore.getInitialState());
  });

  describe("initial state", () => {
    it("should have correct default values", () => {
      const state = useBottomPanelStore.getState();
      expect(state.panel.panelSize).toBe(320);
      expect(state.panel.isVisible).toBe(false);
      expect(state.panel.isDragging).toBe(false);
      expect(state.panel.hasDragged).toBe(false);
      expect(state.panel.activeView).toBe("logs");
    });
  });

  describe("setSize", () => {
    it("should set size within valid range", () => {
      useBottomPanelStore.getState().setSize(400);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(400);
    });

    it("should collapse to minimum size when size is below threshold", () => {
      useBottomPanelStore.getState().setSize(30);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(40);
    });

    it("should cap size at maximum", () => {
      useBottomPanelStore.getState().setSize(800);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(700);
    });
  });

  describe("setIsDragging", () => {
    it("should set dragging state", () => {
      useBottomPanelStore.getState().setIsDragging(true);
      expect(useBottomPanelStore.getState().panel.isDragging).toBe(true);
    });
  });

  describe("setHasDragged", () => {
    it("should set hasDragged state", () => {
      useBottomPanelStore.getState().setHasDragged(true);
      expect(useBottomPanelStore.getState().panel.hasDragged).toBe(true);
    });
  });

  describe("initializePanelSize", () => {
    it("should use provided size when within bounds", () => {
      useBottomPanelStore.getState().initializePanelSize(400);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(400);
    });

    it("should use default size when no size provided", () => {
      useBottomPanelStore.getState().initializePanelSize();
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(320);
    });

    it("should clamp size below minimum", () => {
      useBottomPanelStore.getState().initializePanelSize(100);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(200);
    });

    it("should clamp size above maximum", () => {
      useBottomPanelStore.getState().initializePanelSize(900);
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(700);
    });
  });

  describe("setActiveView", () => {
    it("should change active view", () => {
      useBottomPanelStore.getState().setActiveView("trace");
      expect(useBottomPanelStore.getState().panel.activeView).toBe("trace");
    });
  });

  describe("closePanel", () => {
    it("should close panel and collapse size", () => {
      useBottomPanelStore.getState().setSize(400);
      useBottomPanelStore.getState().setVisibility(true);
      useBottomPanelStore.getState().closePanel();
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(40);
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(false);
    });
  });

  describe("setVisibility", () => {
    it("should set visibility to true", () => {
      useBottomPanelStore.getState().setVisibility(true);
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(true);
    });

    it("should set visibility to false", () => {
      useBottomPanelStore.getState().setVisibility(true);
      useBottomPanelStore.getState().setVisibility(false);
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(false);
    });
  });

  describe("handleViewChange", () => {
    it("should toggle visibility for same view", () => {
      useBottomPanelStore.getState().setVisibility(true);
      useBottomPanelStore.getState().handleViewChange("logs");
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(false);
    });

    it("should switch view and show panel for different view", () => {
      useBottomPanelStore.getState().setVisibility(false);
      useBottomPanelStore.getState().handleViewChange("trace");
      expect(useBottomPanelStore.getState().panel.activeView).toBe("trace");
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(true);
    });

    it("should expand panel if collapsed when same view selected", () => {
      useBottomPanelStore.getState().setSize(40);
      useBottomPanelStore.getState().setVisibility(false);
      useBottomPanelStore.getState().handleViewChange("logs");
      expect(useBottomPanelStore.getState().panel.panelSize).toBe(200);
      expect(useBottomPanelStore.getState().panel.isVisible).toBe(true);
    });
  });
});
