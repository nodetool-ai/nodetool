import { defaultLayout } from "../defaultLayouts";

describe("defaultLayout", () => {
  it("should have a grid property", () => {
    expect(defaultLayout.grid).toBeDefined();
  });

  it("should have a root branch with data", () => {
    expect(defaultLayout.grid.root.type).toBe("branch");
    expect(Array.isArray(defaultLayout.grid.root.data)).toBe(true);
    expect(defaultLayout.grid.root.data.length).toBeGreaterThan(0);
  });

  it("should have valid grid dimensions", () => {
    expect(defaultLayout.grid.width).toBeGreaterThan(0);
    expect(defaultLayout.grid.height).toBeGreaterThan(0);
  });

  it("should have panels defined", () => {
    expect(defaultLayout.panels).toBeDefined();
    expect(Object.keys(defaultLayout.panels).length).toBeGreaterThan(0);
  });

  it("should have an activeGroup", () => {
    expect(defaultLayout.activeGroup).toBeDefined();
    expect(typeof defaultLayout.activeGroup).toBe("string");
  });

  it("all leaf nodes should reference existing panels", () => {
    const panelIds = Object.keys(defaultLayout.panels);
    const leaves = defaultLayout.grid.root.data.filter(
      (d: { type: string }) => d.type === "leaf"
    );
    leaves.forEach((leaf: { data: { id: string } }) => {
      expect(panelIds).toContain(leaf.data.id);
    });
  });

  it("all panels should have id and contentComponent", () => {
    Object.values(defaultLayout.panels).forEach(
      (panel: { id: string; contentComponent: string; title: string }) => {
        expect(typeof panel.id).toBe("string");
        expect(panel.id.length).toBeGreaterThan(0);
        expect(typeof panel.contentComponent).toBe("string");
        expect(panel.contentComponent.length).toBeGreaterThan(0);
      }
    );
  });
});
