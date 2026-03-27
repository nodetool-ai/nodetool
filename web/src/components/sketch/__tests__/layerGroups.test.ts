/**
 * Tests for Layer Groups Feature
 *
 * Tests groupable layers tree structure: add group, collapse/expand,
 * move layers into/out of groups, ungroup, and tree helper functions.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import {
  createDefaultDocument,
  createDefaultGroupLayer,
  getChildLayers,
  getLayerDepth,
  getDescendantIds,
  buildVisibleLayerTree,
  buildLayersPanelRows,
  Layer
} from "../types";

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Layer Group Types", () => {
  it("createDefaultGroupLayer creates a group layer", () => {
    const group = createDefaultGroupLayer("Test Group");
    expect(group.type).toBe("group");
    expect(group.name).toBe("Test Group");
    expect(group.collapsed).toBe(false);
    expect(group.visible).toBe(true);
    expect(group.data).toBeNull();
  });

  it("Layer type includes group", () => {
    const layer: Layer = {
      id: "test",
      name: "Test",
      type: "group",
      visible: true,
      opacity: 1,
      locked: false,
      alphaLock: false,
      blendMode: "normal",
      data: null,
      transform: { x: 0, y: 0 },
      contentBounds: { x: 0, y: 0, width: 0, height: 0 }
    };
    expect(layer.type).toBe("group");
  });
});

describe("Layer Tree Helpers", () => {
  const makeLayers = (): Layer[] => [
    {
      id: "root1", name: "Root 1", type: "raster", visible: true, opacity: 1,
      locked: false, alphaLock: false, blendMode: "normal", data: null,
      transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 100, height: 100 }
    },
    {
      id: "group1", name: "Group 1", type: "group", visible: true, opacity: 1,
      locked: false, alphaLock: false, blendMode: "normal", data: null,
      transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 0, height: 0 },
      collapsed: false
    },
    {
      id: "child1", name: "Child 1", type: "raster", visible: true, opacity: 1,
      locked: false, alphaLock: false, blendMode: "normal", data: null,
      transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 100, height: 100 },
      parentId: "group1"
    },
    {
      id: "child2", name: "Child 2", type: "raster", visible: true, opacity: 1,
      locked: false, alphaLock: false, blendMode: "normal", data: null,
      transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 100, height: 100 },
      parentId: "group1"
    },
    {
      id: "root2", name: "Root 2", type: "raster", visible: true, opacity: 1,
      locked: false, alphaLock: false, blendMode: "normal", data: null,
      transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 100, height: 100 }
    }
  ];

  it("getChildLayers returns root-level layers for null parentId", () => {
    const layers = makeLayers();
    const roots = getChildLayers(layers, null);
    expect(roots.map((l) => l.id)).toEqual(["root1", "group1", "root2"]);
  });

  it("getChildLayers returns children of a group", () => {
    const layers = makeLayers();
    const children = getChildLayers(layers, "group1");
    expect(children.map((l) => l.id)).toEqual(["child1", "child2"]);
  });

  it("getLayerDepth returns 0 for root layers", () => {
    const layers = makeLayers();
    expect(getLayerDepth(layers, "root1")).toBe(0);
    expect(getLayerDepth(layers, "group1")).toBe(0);
  });

  it("getLayerDepth returns 1 for children of a group", () => {
    const layers = makeLayers();
    expect(getLayerDepth(layers, "child1")).toBe(1);
    expect(getLayerDepth(layers, "child2")).toBe(1);
  });

  it("getDescendantIds returns all descendants of a group", () => {
    const layers = makeLayers();
    const descendants = getDescendantIds(layers, "group1");
    expect(descendants).toEqual(["child1", "child2"]);
  });

  it("getDescendantIds handles nested groups", () => {
    const layers: Layer[] = [
      ...makeLayers(),
      {
        id: "subgroup", name: "Sub Group", type: "group", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 0, height: 0 },
        parentId: "group1", collapsed: false
      },
      {
        id: "grandchild", name: "Grandchild", type: "raster", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 100, height: 100 },
        parentId: "subgroup"
      }
    ];
    const descendants = getDescendantIds(layers, "group1");
    expect(descendants).toContain("child1");
    expect(descendants).toContain("child2");
    expect(descendants).toContain("subgroup");
    expect(descendants).toContain("grandchild");
  });

  it("buildVisibleLayerTree returns all layers when no groups are collapsed", () => {
    const layers = makeLayers();
    const tree = buildVisibleLayerTree(layers);
    expect(tree).toHaveLength(5);
    expect(tree.map((t) => t.layer.id)).toEqual(["root1", "group1", "child1", "child2", "root2"]);
  });

  it("buildVisibleLayerTree includes correct depths", () => {
    const layers = makeLayers();
    const tree = buildVisibleLayerTree(layers);
    expect(tree[0].depth).toBe(0); // root1
    expect(tree[1].depth).toBe(0); // group1
    expect(tree[2].depth).toBe(1); // child1
    expect(tree[3].depth).toBe(1); // child2
    expect(tree[4].depth).toBe(0); // root2
  });

  it("buildVisibleLayerTree hides children of collapsed groups", () => {
    const layers = makeLayers();
    layers[1].collapsed = true; // Collapse group1
    const tree = buildVisibleLayerTree(layers);
    expect(tree).toHaveLength(3);
    expect(tree.map((t) => t.layer.id)).toEqual(["root1", "group1", "root2"]);
  });

  it("buildLayersPanelRows orders composite top first with group above its children", () => {
    const layers = makeLayers();
    const rows = buildLayersPanelRows(layers);
    expect(rows.map((r) => r.layer.id)).toEqual(["root2", "group1", "child2", "child1", "root1"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 0, 1, 1, 0]);
  });

  it("buildLayersPanelRows omits children when group is collapsed", () => {
    const layers = makeLayers();
    layers[1].collapsed = true;
    const rows = buildLayersPanelRows(layers);
    expect(rows.map((r) => r.layer.id)).toEqual(["root2", "group1", "root1"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 0, 0]);
  });

  it("buildLayersPanelRows nests subgroups under parent group row", () => {
    const layers: Layer[] = [
      {
        id: "root", name: "Root", type: "raster", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 100, height: 100 }
      },
      {
        id: "g1", name: "Group 1", type: "group", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 0, height: 0 },
        collapsed: false
      },
      {
        id: "g2", name: "Sub Group", type: "group", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 0, height: 0 },
        parentId: "g1", collapsed: false
      },
      {
        id: "deep", name: "Deep", type: "raster", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 100, height: 100 },
        parentId: "g2"
      }
    ];
    const rows = buildLayersPanelRows(layers);
    expect(rows.map((r) => r.layer.id)).toEqual(["g1", "g2", "deep", "root"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 0]);
  });
});

describe("Store: addGroup", () => {
  it("adds a group layer to the document", () => {
    let groupId: string;
    act(() => {
      groupId = useSketchStore.getState().addGroup("Test Group");
    });
    const { layers } = useSketchStore.getState().document;
    const group = layers.find((l) => l.id === groupId!);
    expect(group).toBeDefined();
    expect(group!.type).toBe("group");
    expect(group!.name).toBe("Test Group");
    expect(group!.collapsed).toBe(false);
  });

  it("makes the new group the active layer", () => {
    let groupId: string;
    act(() => {
      groupId = useSketchStore.getState().addGroup();
    });
    expect(useSketchStore.getState().document.activeLayerId).toBe(groupId!);
  });

  it("generates a default name if none provided", () => {
    act(() => {
      useSketchStore.getState().addGroup();
    });
    const { layers } = useSketchStore.getState().document;
    const group = layers.find((l) => l.type === "group");
    expect(group).toBeDefined();
    expect(group!.name).toMatch(/^Group \d+$/);
  });
});

describe("Store: toggleGroupCollapsed", () => {
  it("toggles collapsed state of a group", () => {
    let groupId: string;
    act(() => {
      groupId = useSketchStore.getState().addGroup("Test Group");
    });

    const before = useSketchStore.getState().document.layers.find((l) => l.id === groupId!)!;
    expect(before.collapsed).toBe(false);

    act(() => {
      useSketchStore.getState().toggleGroupCollapsed(groupId!);
    });

    const after = useSketchStore.getState().document.layers.find((l) => l.id === groupId!)!;
    expect(after.collapsed).toBe(true);

    act(() => {
      useSketchStore.getState().toggleGroupCollapsed(groupId!);
    });

    const final = useSketchStore.getState().document.layers.find((l) => l.id === groupId!)!;
    expect(final.collapsed).toBe(false);
  });

  it("does nothing for non-group layers", () => {
    const state = useSketchStore.getState();
    const layerId = state.document.layers[0].id;
    const layerBefore = state.document.layers[0];

    act(() => {
      useSketchStore.getState().toggleGroupCollapsed(layerId);
    });

    const layerAfter = useSketchStore.getState().document.layers[0];
    expect(layerAfter.collapsed).toBe(layerBefore.collapsed);
  });
});

describe("Store: moveLayerToGroup", () => {
  it("moves a layer into a group by setting parentId", () => {
    let groupId: string;
    act(() => {
      groupId = useSketchStore.getState().addGroup("Group");
    });

    const state = useSketchStore.getState();
    const bgLayer = state.document.layers[0];

    act(() => {
      useSketchStore.getState().moveLayerToGroup(bgLayer.id, groupId!);
    });

    const moved = useSketchStore.getState().document.layers.find((l) => l.id === bgLayer.id);
    expect(moved?.parentId).toBe(groupId!);
  });

  it("moves a layer out of a group to root by setting parentId to null", () => {
    let groupId: string;
    act(() => {
      groupId = useSketchStore.getState().addGroup("Group");
    });
    const state = useSketchStore.getState();
    const bgLayer = state.document.layers[0];

    act(() => {
      useSketchStore.getState().moveLayerToGroup(bgLayer.id, groupId!);
    });

    act(() => {
      useSketchStore.getState().moveLayerToGroup(bgLayer.id, null);
    });

    const moved = useSketchStore.getState().document.layers.find((l) => l.id === bgLayer.id);
    expect(moved?.parentId).toBeUndefined();
  });

  it("prevents moving a group into itself", () => {
    let groupId: string;
    act(() => {
      groupId = useSketchStore.getState().addGroup("Group");
    });

    act(() => {
      useSketchStore.getState().moveLayerToGroup(groupId!, groupId!);
    });

    const group = useSketchStore.getState().document.layers.find((l) => l.id === groupId!);
    expect(group?.parentId).toBeUndefined();
  });

  it("prevents moving a group into its own descendant", () => {
    let groupId: string;
    let subgroupId: string;
    act(() => {
      groupId = useSketchStore.getState().addGroup("Parent Group");
    });
    act(() => {
      subgroupId = useSketchStore.getState().addGroup("Sub Group");
    });
    act(() => {
      useSketchStore.getState().moveLayerToGroup(subgroupId!, groupId!);
    });

    // Now try moving the parent group into the sub group (should be blocked)
    act(() => {
      useSketchStore.getState().moveLayerToGroup(groupId!, subgroupId!);
    });

    const parent = useSketchStore.getState().document.layers.find((l) => l.id === groupId!);
    expect(parent?.parentId).toBeUndefined();
  });
});

describe("Store: ungroupLayer", () => {
  it("removes the group and re-parents children to root", () => {
    let groupId: string;
    act(() => {
      groupId = useSketchStore.getState().addGroup("Group");
    });
    const bgLayerId = useSketchStore.getState().document.layers[0].id;

    act(() => {
      useSketchStore.getState().moveLayerToGroup(bgLayerId, groupId!);
    });

    act(() => {
      useSketchStore.getState().ungroupLayer(groupId!);
    });

    const state = useSketchStore.getState();
    expect(state.document.layers.find((l) => l.id === groupId!)).toBeUndefined();
    const bgLayer = state.document.layers.find((l) => l.id === bgLayerId);
    expect(bgLayer?.parentId).toBeUndefined();
  });

  it("does nothing for non-group layers", () => {
    const bgLayerId = useSketchStore.getState().document.layers[0].id;
    const layersBefore = useSketchStore.getState().document.layers.length;

    act(() => {
      useSketchStore.getState().ungroupLayer(bgLayerId);
    });

    expect(useSketchStore.getState().document.layers.length).toBe(layersBefore);
  });
});

describe("Store: removeLayer with groups", () => {
  it("removes a group and all its descendants", () => {
    let groupId: string;
    let childId: string;
    act(() => {
      groupId = useSketchStore.getState().addGroup("Group");
    });
    act(() => {
      childId = useSketchStore.getState().addLayer("Child");
    });
    act(() => {
      useSketchStore.getState().moveLayerToGroup(childId!, groupId!);
    });

    act(() => {
      useSketchStore.getState().removeLayer(groupId!);
    });

    const layers = useSketchStore.getState().document.layers;
    expect(layers.find((l) => l.id === groupId!)).toBeUndefined();
    expect(layers.find((l) => l.id === childId!)).toBeUndefined();
    expect(layers.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Backward Compatibility", () => {
  it("normalizeSketchDocument handles layers without parentId", () => {
    const doc = createDefaultDocument(512, 512);
    // Old document has no parentId on layers
    const layer = doc.layers[0];
    expect(layer.parentId).toBeUndefined();
    expect(layer.collapsed).toBeUndefined();

    // Set document (which normalizes)
    act(() => {
      useSketchStore.getState().setDocument(doc);
    });

    const normalized = useSketchStore.getState().document;
    expect(normalized.layers[0].collapsed).toBe(false);
  });
});

describe("Tree-aware drag-and-drop", () => {
  it("buildVisibleLayerTree shows nested groups with correct depths", () => {
    const layers: Layer[] = [
      {
        id: "root", name: "Root", type: "raster", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 100, height: 100 }
      },
      {
        id: "g1", name: "Group 1", type: "group", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 0, height: 0 },
        collapsed: false
      },
      {
        id: "g2", name: "Sub Group", type: "group", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 0, height: 0 },
        parentId: "g1", collapsed: false
      },
      {
        id: "deep", name: "Deep", type: "raster", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 100, height: 100 },
        parentId: "g2"
      }
    ];
    const tree = buildVisibleLayerTree(layers);
    expect(tree).toHaveLength(4);
    expect(tree[0].depth).toBe(0); // root
    expect(tree[1].depth).toBe(0); // g1
    expect(tree[2].depth).toBe(1); // g2 inside g1
    expect(tree[3].depth).toBe(2); // deep inside g2
  });

  it("collapsing a parent group hides all nested descendants", () => {
    const layers: Layer[] = [
      {
        id: "g1", name: "Group 1", type: "group", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 0, height: 0 },
        collapsed: true
      },
      {
        id: "g2", name: "Sub Group", type: "group", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 0, height: 0 },
        parentId: "g1", collapsed: false
      },
      {
        id: "deep", name: "Deep", type: "raster", visible: true, opacity: 1,
        locked: false, alphaLock: false, blendMode: "normal", data: null,
        transform: { x: 0, y: 0 }, contentBounds: { x: 0, y: 0, width: 100, height: 100 },
        parentId: "g2"
      }
    ];
    const tree = buildVisibleLayerTree(layers);
    // Only g1 should be visible; children and grandchildren hidden
    expect(tree).toHaveLength(1);
    expect(tree[0].layer.id).toBe("g1");
  });

  it("moveLayerToGroup moves layer between groups", () => {
    let g1Id: string;
    let g2Id: string;
    let childId: string;
    act(() => {
      g1Id = useSketchStore.getState().addGroup("Group 1");
    });
    act(() => {
      g2Id = useSketchStore.getState().addGroup("Group 2");
    });
    act(() => {
      childId = useSketchStore.getState().addLayer("Child");
    });
    // Move child into group 1
    act(() => {
      useSketchStore.getState().moveLayerToGroup(childId!, g1Id!);
    });
    expect(useSketchStore.getState().document.layers.find((l) => l.id === childId!)?.parentId).toBe(g1Id!);

    // Move child from group 1 to group 2
    act(() => {
      useSketchStore.getState().moveLayerToGroup(childId!, g2Id!);
    });
    expect(useSketchStore.getState().document.layers.find((l) => l.id === childId!)?.parentId).toBe(g2Id!);
  });

  it("reorderLayers moves layers in the flat array", () => {
    act(() => {
      useSketchStore.getState().addLayer("Layer A");
    });
    act(() => {
      useSketchStore.getState().addLayer("Layer B");
    });
    const layers = useSketchStore.getState().document.layers;
    const ids = layers.map((l) => l.id);
    // Move last layer to first position
    act(() => {
      useSketchStore.getState().reorderLayers(layers.length - 1, 0);
    });
    const newIds = useSketchStore.getState().document.layers.map((l) => l.id);
    expect(newIds[0]).toBe(ids[ids.length - 1]);
  });
});
