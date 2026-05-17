import { usePanelStore } from "../PanelStore";

describe("PanelStore — additional actions", () => {
  const initialState = usePanelStore.getState();

  afterEach(() => {
    usePanelStore.setState(initialState, true);
  });

  describe("setIsDragging", () => {
    it("sets isDragging to true", () => {
      usePanelStore.getState().setIsDragging(true);
      expect(usePanelStore.getState().panel.isDragging).toBe(true);
    });

    it("sets isDragging to false", () => {
      usePanelStore.getState().setIsDragging(true);
      usePanelStore.getState().setIsDragging(false);
      expect(usePanelStore.getState().panel.isDragging).toBe(false);
    });
  });

  describe("setHasDragged", () => {
    it("sets hasDragged to true", () => {
      usePanelStore.getState().setHasDragged(true);
      expect(usePanelStore.getState().panel.hasDragged).toBe(true);
    });

    it("sets hasDragged to false", () => {
      usePanelStore.getState().setHasDragged(true);
      usePanelStore.getState().setHasDragged(false);
      expect(usePanelStore.getState().panel.hasDragged).toBe(false);
    });
  });

  describe("initializePanelSize", () => {
    it("sets panel size to the given value", () => {
      usePanelStore.getState().initializePanelSize(600);
      expect(usePanelStore.getState().panel.panelSize).toBe(600);
    });

    it("clamps to MIN_PANEL_SIZE (400) when given a small value", () => {
      usePanelStore.getState().initializePanelSize(100);
      expect(usePanelStore.getState().panel.panelSize).toBe(400);
    });

    it("clamps to MAX_PANEL_SIZE (800) when given a large value", () => {
      usePanelStore.getState().initializePanelSize(1200);
      expect(usePanelStore.getState().panel.panelSize).toBe(800);
    });

    it("uses default (500) when no size provided", () => {
      usePanelStore.getState().initializePanelSize();
      expect(usePanelStore.getState().panel.panelSize).toBe(500);
    });
  });

  describe("setActiveView", () => {
    it("changes the active view", () => {
      usePanelStore.getState().setActiveView("assets");
      expect(usePanelStore.getState().panel.activeView).toBe("assets");
    });

    it("can set to any valid view", () => {
      usePanelStore.getState().setActiveView("history");
      expect(usePanelStore.getState().panel.activeView).toBe("history");
      usePanelStore.getState().setActiveView("search");
      expect(usePanelStore.getState().panel.activeView).toBe("search");
    });
  });

  describe("closePanel", () => {
    it("sets panelSize to minWidth and isVisible to false", () => {
      usePanelStore.getState().setVisibility(true);
      usePanelStore.getState().closePanel();
      const panel = usePanelStore.getState().panel;
      expect(panel.panelSize).toBe(60);
      expect(panel.isVisible).toBe(false);
    });
  });

  describe("setVisibility", () => {
    it("sets visibility to true", () => {
      usePanelStore.getState().setVisibility(true);
      expect(usePanelStore.getState().panel.isVisible).toBe(true);
    });

    it("sets visibility to false", () => {
      usePanelStore.getState().setVisibility(true);
      usePanelStore.getState().setVisibility(false);
      expect(usePanelStore.getState().panel.isVisible).toBe(false);
    });
  });

  describe("handleViewChange — switching to different view", () => {
    it("switches view and makes panel visible", () => {
      usePanelStore.getState().handleViewChange("assets");
      const panel = usePanelStore.getState().panel;
      expect(panel.activeView).toBe("assets");
      expect(panel.isVisible).toBe(true);
    });

    it("shows panel even if it was hidden when switching to same view", () => {
      usePanelStore.getState().handleViewChange("workflows");
      expect(usePanelStore.getState().panel.isVisible).toBe(true);
    });
  });

  describe("setSize — edge cases", () => {
    it("collapses to MIN_DRAG_SIZE (60) for very small values", () => {
      usePanelStore.getState().setSize(10);
      expect(usePanelStore.getState().panel.panelSize).toBe(60);
    });

    it("sets exact value within range", () => {
      usePanelStore.getState().setSize(400);
      expect(usePanelStore.getState().panel.panelSize).toBe(400);
    });
  });
});
