import { usePanelStore } from "../PanelStore";

describe("PanelStore actions", () => {
  const initialState = usePanelStore.getState();

  afterEach(() => {
    usePanelStore.setState(initialState, true);
  });

  describe("closePanel", () => {
    it("sets panel to minimum width and hidden", () => {
      usePanelStore.setState({
        ...usePanelStore.getState(),
        panel: {
          ...usePanelStore.getState().panel,
          panelSize: 500,
          isVisible: true
        }
      });

      usePanelStore.getState().closePanel();

      const { panel } = usePanelStore.getState();
      expect(panel.isVisible).toBe(false);
      expect(panel.panelSize).toBe(panel.minWidth);
    });
  });

  describe("setActiveNodeCategory", () => {
    it("updates the active node category", () => {
      usePanelStore.getState().setActiveNodeCategory("image-ai");
      expect(usePanelStore.getState().panel.activeNodeCategory).toBe(
        "image-ai"
      );
    });

    it("preserves other panel state when changing category", () => {
      usePanelStore.setState({
        ...usePanelStore.getState(),
        panel: {
          ...usePanelStore.getState().panel,
          activeView: "nodes",
          isVisible: true,
          panelSize: 600
        }
      });

      usePanelStore.getState().setActiveNodeCategory("agents");

      const { panel } = usePanelStore.getState();
      expect(panel.activeNodeCategory).toBe("agents");
      expect(panel.activeView).toBe("nodes");
      expect(panel.isVisible).toBe(true);
      expect(panel.panelSize).toBe(600);
    });
  });

  describe("setVisibility", () => {
    it("sets panel visible", () => {
      usePanelStore.getState().setVisibility(true);
      expect(usePanelStore.getState().panel.isVisible).toBe(true);
    });

    it("hides panel", () => {
      usePanelStore.getState().setVisibility(true);
      usePanelStore.getState().setVisibility(false);
      expect(usePanelStore.getState().panel.isVisible).toBe(false);
    });
  });

  describe("initializePanelSize", () => {
    it("clamps to minimum panel size", () => {
      usePanelStore.getState().initializePanelSize(10);
      const { panel } = usePanelStore.getState();
      expect(panel.panelSize).toBeGreaterThanOrEqual(panel.defaultWidth - 100);
    });

    it("clamps to maximum panel size", () => {
      usePanelStore.getState().initializePanelSize(5000);
      const { panel } = usePanelStore.getState();
      expect(panel.panelSize).toBeLessThanOrEqual(panel.maxWidth);
    });

    it("uses default when no size provided", () => {
      usePanelStore.getState().initializePanelSize();
      const { panel } = usePanelStore.getState();
      expect(panel.panelSize).toBe(panel.defaultWidth);
    });
  });

  describe("setIsDragging / setHasDragged", () => {
    it("tracks dragging state", () => {
      usePanelStore.getState().setIsDragging(true);
      expect(usePanelStore.getState().panel.isDragging).toBe(true);

      usePanelStore.getState().setIsDragging(false);
      expect(usePanelStore.getState().panel.isDragging).toBe(false);
    });

    it("tracks hasDragged flag", () => {
      usePanelStore.getState().setHasDragged(true);
      expect(usePanelStore.getState().panel.hasDragged).toBe(true);
    });
  });

  describe("handleViewChange", () => {
    it("switches to a new view and makes panel visible", () => {
      usePanelStore.setState({
        ...usePanelStore.getState(),
        panel: {
          ...usePanelStore.getState().panel,
          activeView: "workflows",
          isVisible: false
        }
      });

      usePanelStore.getState().handleViewChange("assets");

      const { panel } = usePanelStore.getState();
      expect(panel.activeView).toBe("assets");
      expect(panel.isVisible).toBe(true);
    });

    it("toggles visibility when selecting same view while visible", () => {
      usePanelStore.setState({
        ...usePanelStore.getState(),
        panel: {
          ...usePanelStore.getState().panel,
          activeView: "assets",
          isVisible: true,
          panelSize: 500
        }
      });

      usePanelStore.getState().handleViewChange("assets");
      expect(usePanelStore.getState().panel.isVisible).toBe(false);
    });

    it("reopens and expands collapsed panel for same view", () => {
      const { minWidth, defaultWidth } = usePanelStore.getState().panel;
      usePanelStore.setState({
        ...usePanelStore.getState(),
        panel: {
          ...usePanelStore.getState().panel,
          activeView: "workflows",
          isVisible: false,
          panelSize: minWidth
        }
      });

      usePanelStore.getState().handleViewChange("workflows");

      const { panel } = usePanelStore.getState();
      expect(panel.isVisible).toBe(true);
      expect(panel.panelSize).toBeGreaterThanOrEqual(defaultWidth - 100);
    });
  });

  describe("setSize edge cases", () => {
    it("clamps negative values to minWidth", () => {
      usePanelStore.getState().setSize(-100);
      expect(usePanelStore.getState().panel.panelSize).toBe(
        usePanelStore.getState().panel.minWidth
      );
    });

    it("clamps exactly at minWidth boundary", () => {
      const { minWidth } = usePanelStore.getState().panel;
      usePanelStore.getState().setSize(minWidth);
      expect(usePanelStore.getState().panel.panelSize).toBe(minWidth);
    });

    it("accepts values within valid range", () => {
      usePanelStore.getState().setSize(400);
      expect(usePanelStore.getState().panel.panelSize).toBe(400);
    });
  });
});

describe("PanelStore — merge migration", () => {
  const initialState = usePanelStore.getState();
  const getMerge = () => {
    const opts = usePanelStore.persist.getOptions();
    return opts.merge as (p: unknown, c: typeof initialState) => typeof initialState;
  };

  afterEach(() => {
    usePanelStore.setState(initialState, true);
  });

  it("migrates workflowGrid to workflows", () => {
    const merged = getMerge()(
      { panel: { panelSize: 500, isVisible: true, activeView: "workflowGrid", activeNodeCategory: "all" } },
      initialState
    );
    expect(merged.panel.activeView).toBe("workflows");
  });

  it("migrates search to nodes/all", () => {
    const merged = getMerge()(
      { panel: { panelSize: 500, isVisible: true, activeView: "search", activeNodeCategory: "all" } },
      initialState
    );
    expect(merged.panel.activeView).toBe("nodes");
    expect(merged.panel.activeNodeCategory).toBe("all");
  });

  it("migrates legacy node category alias in activeView", () => {
    const merged = getMerge()(
      { panel: { panelSize: 500, isVisible: true, activeView: "image-models" } },
      initialState
    );
    expect(merged.panel.activeView).toBe("nodes");
    expect(merged.panel.activeNodeCategory).toBe("image-ai");
  });

  it("migrates legacy alias in activeNodeCategory field", () => {
    const merged = getMerge()(
      { panel: { panelSize: 600, isVisible: true, activeView: "nodes", activeNodeCategory: "tools" } },
      initialState
    );
    expect(merged.panel.activeNodeCategory).toBe("image");
  });

  it("clamps persisted panelSize to max", () => {
    const merged = getMerge()(
      { panel: { panelSize: 9999, isVisible: false, activeView: "workflows", activeNodeCategory: "all" } },
      initialState
    );
    expect(merged.panel.panelSize).toBe(800);
  });

  it("clamps persisted panelSize to min", () => {
    const merged = getMerge()(
      { panel: { panelSize: 5, isVisible: false, activeView: "workflows", activeNodeCategory: "all" } },
      initialState
    );
    expect(merged.panel.panelSize).toBe(60);
  });

  it("returns currentState for null persisted data", () => {
    const merged = getMerge()(null, initialState);
    expect(merged).toEqual(initialState);
  });

  it("returns currentState for invalid panel shape", () => {
    const merged = getMerge()({ panel: "bad" }, initialState);
    expect(merged).toEqual(initialState);
  });

  it("preserves valid current view names", () => {
    const merged = getMerge()(
      { panel: { panelSize: 500, isVisible: true, activeView: "assets", activeNodeCategory: "all" } },
      initialState
    );
    expect(merged.panel.activeView).toBe("assets");
  });
});
