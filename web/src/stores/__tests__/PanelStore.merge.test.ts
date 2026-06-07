import { usePanelStore } from "../PanelStore";

type PersistApi = {
  persist: {
    getOptions: () => {
      merge: (
        persisted: unknown,
        current: ReturnType<typeof usePanelStore.getState>
      ) => ReturnType<typeof usePanelStore.getState>;
    };
  };
};

function getMerge() {
  return (usePanelStore as unknown as PersistApi).persist.getOptions().merge;
}

function currentState() {
  return usePanelStore.getState();
}

describe("PanelStore merge (legacy migration)", () => {
  const merge = getMerge();

  it("returns currentState when persisted is null", () => {
    const cs = currentState();
    expect(merge(null, cs)).toBe(cs);
  });

  it("returns currentState when persisted is an array", () => {
    const cs = currentState();
    expect(merge([], cs)).toBe(cs);
  });

  it("returns currentState when persisted.panel is missing", () => {
    const cs = currentState();
    expect(merge({}, cs)).toBe(cs);
  });

  it("migrates workflowGrid to workflows", () => {
    const cs = currentState();
    const result = merge({ panel: { activeView: "workflowGrid" } }, cs);
    expect(result.panel.activeView).toBe("workflows");
  });

  it("migrates search to nodes/all", () => {
    const cs = currentState();
    const result = merge({ panel: { activeView: "search" } }, cs);
    expect(result.panel.activeView).toBe("nodes");
    expect(result.panel.activeNodeCategory).toBe("all");
  });

  it("migrates a legacy node-category view id to the renamed subcategory", () => {
    const cs = currentState();
    const result = merge({ panel: { activeView: "image-models" } }, cs);
    expect(result.panel.activeView).toBe("nodes");
    expect(result.panel.activeNodeCategory).toBe("image-ai");
  });

  it("preserves valid view names", () => {
    const cs = currentState();
    const result = merge({ panel: { activeView: "assets" } }, cs);
    expect(result.panel.activeView).toBe("assets");
  });

  it("clamps panelSize to min 60", () => {
    const cs = currentState();
    const result = merge({ panel: { panelSize: 10, activeView: "workflows" } }, cs);
    expect(result.panel.panelSize).toBe(60);
  });

  it("clamps panelSize to max 800", () => {
    const cs = currentState();
    const result = merge({ panel: { panelSize: 2000, activeView: "workflows" } }, cs);
    expect(result.panel.panelSize).toBe(800);
  });

  it("uses current panelSize when persisted is non-numeric", () => {
    const cs = currentState();
    const result = merge({ panel: { panelSize: "big", activeView: "workflows" } }, cs);
    expect(result.panel.panelSize).toBe(cs.panel.panelSize);
  });

  it("preserves isVisible boolean", () => {
    const cs = currentState();
    const result = merge({ panel: { isVisible: true, activeView: "workflows" } }, cs);
    expect(result.panel.isVisible).toBe(true);
  });

  it("uses current isVisible when persisted is non-boolean", () => {
    const cs = currentState();
    const result = merge({ panel: { isVisible: "yes", activeView: "workflows" } }, cs);
    expect(result.panel.isVisible).toBe(cs.panel.isVisible);
  });

  it("preserves valid activeNodeCategory from persisted state", () => {
    const cs = currentState();
    const result = merge(
      { panel: { activeView: "nodes", activeNodeCategory: "image-ai" } },
      cs
    );
    expect(result.panel.activeNodeCategory).toBe("image-ai");
  });

  it("aliases a legacy persisted activeNodeCategory (tools → image)", () => {
    const cs = currentState();
    const result = merge(
      { panel: { activeView: "nodes", activeNodeCategory: "tools" } },
      cs
    );
    expect(result.panel.activeNodeCategory).toBe("image");
  });

  it("ignores invalid activeNodeCategory", () => {
    const cs = currentState();
    const result = merge(
      { panel: { activeView: "nodes", activeNodeCategory: "bogus" } },
      cs
    );
    expect(result.panel.activeNodeCategory).toBe(cs.panel.activeNodeCategory);
  });
});
