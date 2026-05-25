/**
 * @jest-environment node
 */
import type { Layer } from "../document";
import {
  generateLayerId,
  createDefaultLayer,
  createDefaultDocument,
  getChildLayers,
  getLayerDepth,
  getDescendantIds,
  findMergeDownTargetIndex,
  isLayerCompositeVisible,
  layerAllowsTransformWhilePixelLocked,
} from "../document";

// ---------------------------------------------------------------------------
// Helper: build a minimal Layer with sensible defaults for tree-test purposes
// ---------------------------------------------------------------------------
function makeLayer(
  overrides: Partial<Layer> & { id: string }
): Layer {
  return {
    name: overrides.id,
    type: "raster",
    visible: true,
    opacity: 1,
    locked: false,
    alphaLock: false,
    blendMode: "normal",
    data: null,
    transform: { tag: "affine", tx: 0, ty: 0, sx: 1, sy: 1, rotation: 0 },
    contentBounds: { x: 0, y: 0, width: 64, height: 64 },
    effects: [],
    ...overrides,
  } as Layer;
}

// ─── generateLayerId ─────────────────────────────────────────────────────────

describe("generateLayerId", () => {
  it("returns a non-empty string", () => {
    const id = generateLayerId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("returns unique IDs on successive calls", () => {
    const a = generateLayerId();
    const b = generateLayerId();
    expect(a).not.toBe(b);
  });

  it("starts with 'layer_' prefix", () => {
    expect(generateLayerId()).toMatch(/^layer_/);
  });
});

// ─── createDefaultLayer ──────────────────────────────────────────────────────

describe("createDefaultLayer", () => {
  it("creates a layer with expected defaults", () => {
    const layer = createDefaultLayer("Test Layer", "raster", 200, 100);
    expect(layer.name).toBe("Test Layer");
    expect(layer.type).toBe("raster");
    expect(layer.visible).toBe(true);
    expect(layer.opacity).toBe(1);
    expect(layer.blendMode).toBe("normal");
    expect(layer.locked).toBe(false);
    expect(layer.alphaLock).toBe(false);
    expect(layer.data).toBeNull();
    expect(layer.effects).toEqual([]);
  });

  it("sets contentBounds from canvas dimensions", () => {
    const layer = createDefaultLayer("L", "raster", 300, 150);
    expect(layer.contentBounds.width).toBe(300);
    expect(layer.contentBounds.height).toBe(150);
  });

  it("generates a unique id", () => {
    const a = createDefaultLayer("A");
    const b = createDefaultLayer("B");
    expect(a.id).not.toBe(b.id);
  });

  it("defaults canvas dimensions to 0 when omitted", () => {
    const layer = createDefaultLayer("L");
    expect(layer.contentBounds.width).toBe(0);
    expect(layer.contentBounds.height).toBe(0);
  });
});

// ─── createDefaultDocument ───────────────────────────────────────────────────

describe("createDefaultDocument", () => {
  it("creates a document with the given dimensions", () => {
    const doc = createDefaultDocument(800, 600);
    expect(doc.canvas.width).toBe(800);
    expect(doc.canvas.height).toBe(600);
  });

  it("contains one layer", () => {
    const doc = createDefaultDocument();
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0].name).toBe("Background");
  });

  it("sets activeLayerId to the background layer", () => {
    const doc = createDefaultDocument();
    expect(doc.activeLayerId).toBe(doc.layers[0].id);
  });

  it("defaults to 512x512 when no dimensions given", () => {
    const doc = createDefaultDocument();
    expect(doc.canvas.width).toBe(512);
    expect(doc.canvas.height).toBe(512);
  });

  it("sets metadata timestamps", () => {
    const doc = createDefaultDocument();
    expect(doc.metadata.createdAt).toBeTruthy();
    expect(doc.metadata.updatedAt).toBeTruthy();
  });
});

// ─── getChildLayers ──────────────────────────────────────────────────────────

describe("getChildLayers", () => {
  const layers: Layer[] = [
    makeLayer({ id: "root1" }),
    makeLayer({ id: "root2" }),
    makeLayer({ id: "child1", parentId: "root1" }),
    makeLayer({ id: "child2", parentId: "root1" }),
    makeLayer({ id: "child3", parentId: "root2" }),
  ];

  it("returns root-level layers when parentId is null", () => {
    const roots = getChildLayers(layers, null);
    expect(roots.map((l) => l.id)).toEqual(["root1", "root2"]);
  });

  it("returns root-level layers when parentId is undefined", () => {
    const roots = getChildLayers(layers, undefined);
    expect(roots.map((l) => l.id)).toEqual(["root1", "root2"]);
  });

  it("returns children of a specific parent", () => {
    const children = getChildLayers(layers, "root1");
    expect(children.map((l) => l.id)).toEqual(["child1", "child2"]);
  });

  it("returns empty array when parent has no children", () => {
    const children = getChildLayers(layers, "child1");
    expect(children).toEqual([]);
  });

  it("returns empty array for non-existent parent", () => {
    const children = getChildLayers(layers, "doesNotExist");
    expect(children).toEqual([]);
  });

  it("handles empty layers array", () => {
    expect(getChildLayers([], null)).toEqual([]);
    expect(getChildLayers([], "any")).toEqual([]);
  });
});

// ─── getLayerDepth ───────────────────────────────────────────────────────────

describe("getLayerDepth", () => {
  const layers: Layer[] = [
    makeLayer({ id: "root", type: "group" }),
    makeLayer({ id: "child", parentId: "root", type: "group" }),
    makeLayer({ id: "grandchild", parentId: "child" }),
  ];

  it("returns 0 for root layers", () => {
    expect(getLayerDepth(layers, "root")).toBe(0);
  });

  it("returns 1 for direct children", () => {
    expect(getLayerDepth(layers, "child")).toBe(1);
  });

  it("returns 2 for grandchildren", () => {
    expect(getLayerDepth(layers, "grandchild")).toBe(2);
  });

  it("returns 0 for non-existent layer", () => {
    expect(getLayerDepth(layers, "doesNotExist")).toBe(0);
  });

  it("returns 0 for empty layers array", () => {
    expect(getLayerDepth([], "any")).toBe(0);
  });

  it("handles deeply nested layers", () => {
    const deep: Layer[] = [];
    for (let i = 0; i < 10; i++) {
      deep.push(
        makeLayer({
          id: `d${i}`,
          type: "group",
          parentId: i > 0 ? `d${i - 1}` : undefined,
        })
      );
    }
    expect(getLayerDepth(deep, "d9")).toBe(9);
  });
});

// ─── getDescendantIds ────────────────────────────────────────────────────────

describe("getDescendantIds", () => {
  const layers: Layer[] = [
    makeLayer({ id: "g1", type: "group" }),
    makeLayer({ id: "c1", parentId: "g1" }),
    makeLayer({ id: "c2", parentId: "g1" }),
    makeLayer({ id: "g2", type: "group", parentId: "g1" }),
    makeLayer({ id: "gc1", parentId: "g2" }),
    makeLayer({ id: "standalone" }),
  ];

  it("returns all descendants of a group", () => {
    const ids = getDescendantIds(layers, "g1");
    expect(ids).toContain("c1");
    expect(ids).toContain("c2");
    expect(ids).toContain("g2");
    expect(ids).toContain("gc1");
  });

  it("does NOT include the group itself", () => {
    const ids = getDescendantIds(layers, "g1");
    expect(ids).not.toContain("g1");
  });

  it("does not include unrelated layers", () => {
    const ids = getDescendantIds(layers, "g1");
    expect(ids).not.toContain("standalone");
  });

  it("returns only direct descendants for a nested group", () => {
    const ids = getDescendantIds(layers, "g2");
    expect(ids).toEqual(["gc1"]);
  });

  it("returns empty array for a leaf layer", () => {
    expect(getDescendantIds(layers, "c1")).toEqual([]);
  });

  it("returns empty array for non-existent group", () => {
    expect(getDescendantIds(layers, "doesNotExist")).toEqual([]);
  });

  it("returns empty array for empty layers", () => {
    expect(getDescendantIds([], "any")).toEqual([]);
  });
});

// ─── findMergeDownTargetIndex ────────────────────────────────────────────────

describe("findMergeDownTargetIndex", () => {
  it("returns the previous sibling index when valid", () => {
    const layers: Layer[] = [
      makeLayer({ id: "a" }),
      makeLayer({ id: "b" }),
    ];
    expect(findMergeDownTargetIndex(layers, "b")).toBe(0);
  });

  it("returns -1 when layer is first in array", () => {
    const layers: Layer[] = [makeLayer({ id: "a" })];
    expect(findMergeDownTargetIndex(layers, "a")).toBe(-1);
  });

  it("returns -1 when active layer is not found", () => {
    const layers: Layer[] = [makeLayer({ id: "a" })];
    expect(findMergeDownTargetIndex(layers, "doesNotExist")).toBe(-1);
  });

  it("returns -1 when active layer is a group", () => {
    const layers: Layer[] = [
      makeLayer({ id: "a" }),
      makeLayer({ id: "g", type: "group" }),
    ];
    expect(findMergeDownTargetIndex(layers, "g")).toBe(-1);
  });

  it("returns -1 when previous layer is a group", () => {
    const layers: Layer[] = [
      makeLayer({ id: "g", type: "group" }),
      makeLayer({ id: "a" }),
    ];
    expect(findMergeDownTargetIndex(layers, "a")).toBe(-1);
  });

  it("returns -1 when previous layer is locked", () => {
    const layers: Layer[] = [
      makeLayer({ id: "a", locked: true }),
      makeLayer({ id: "b" }),
    ];
    expect(findMergeDownTargetIndex(layers, "b")).toBe(-1);
  });

  it("returns -1 when previous layer has different parent", () => {
    const layers: Layer[] = [
      makeLayer({ id: "a", parentId: "group1" }),
      makeLayer({ id: "b", parentId: "group2" }),
    ];
    expect(findMergeDownTargetIndex(layers, "b")).toBe(-1);
  });

  it("merges within the same parent group", () => {
    const layers: Layer[] = [
      makeLayer({ id: "a", parentId: "g" }),
      makeLayer({ id: "b", parentId: "g" }),
    ];
    expect(findMergeDownTargetIndex(layers, "b")).toBe(0);
  });

  it("returns -1 for empty array", () => {
    expect(findMergeDownTargetIndex([], "any")).toBe(-1);
  });
});

// ─── isLayerCompositeVisible ─────────────────────────────────────────────────

describe("isLayerCompositeVisible", () => {
  it("returns true for a visible root layer", () => {
    const layer = makeLayer({ id: "a", visible: true });
    expect(isLayerCompositeVisible([layer], layer, null)).toBe(true);
  });

  it("returns false for a hidden layer", () => {
    const layer = makeLayer({ id: "a", visible: false });
    expect(isLayerCompositeVisible([layer], layer, null)).toBe(false);
  });

  it("returns false when parent group is hidden", () => {
    const parent = makeLayer({ id: "g", type: "group", visible: false });
    const child = makeLayer({ id: "c", parentId: "g", visible: true });
    expect(isLayerCompositeVisible([parent, child], child, null)).toBe(false);
  });

  it("returns true when layer and all ancestors are visible", () => {
    const grandparent = makeLayer({ id: "gp", type: "group", visible: true });
    const parent = makeLayer({ id: "p", type: "group", parentId: "gp", visible: true });
    const child = makeLayer({ id: "c", parentId: "p", visible: true });
    const layers = [grandparent, parent, child];
    expect(isLayerCompositeVisible(layers, child, null)).toBe(true);
  });

  it("returns false when a grandparent is hidden", () => {
    const grandparent = makeLayer({ id: "gp", type: "group", visible: false });
    const parent = makeLayer({ id: "p", type: "group", parentId: "gp", visible: true });
    const child = makeLayer({ id: "c", parentId: "p", visible: true });
    const layers = [grandparent, parent, child];
    expect(isLayerCompositeVisible(layers, child, null)).toBe(false);
  });

  it("returns true for isolated layer even if hidden", () => {
    const layer = makeLayer({ id: "a", visible: false });
    expect(isLayerCompositeVisible([layer], layer, "a")).toBe(true);
  });

  it("returns true for isolated layer even if ancestor is hidden", () => {
    const parent = makeLayer({ id: "g", type: "group", visible: false });
    const child = makeLayer({ id: "c", parentId: "g", visible: true });
    expect(isLayerCompositeVisible([parent, child], child, "c")).toBe(true);
  });
});

// ─── layerAllowsTransformWhilePixelLocked ────────────────────────────────────

describe("layerAllowsTransformWhilePixelLocked", () => {
  it("returns true for a layer with an imageReference URI", () => {
    const layer = makeLayer({
      id: "img",
      locked: true,
      imageReference: {
        uri: "https://example.com/photo.png",
        naturalWidth: 100,
        naturalHeight: 100,
        objectFit: "cover",
      },
    });
    expect(layerAllowsTransformWhilePixelLocked(layer)).toBe(true);
  });

  it("returns false for a plain raster layer", () => {
    const layer = makeLayer({ id: "r", locked: true });
    expect(layerAllowsTransformWhilePixelLocked(layer)).toBe(false);
  });

  it("returns false when imageReference is null", () => {
    const layer = makeLayer({ id: "r", locked: true, imageReference: null });
    expect(layerAllowsTransformWhilePixelLocked(layer)).toBe(false);
  });

  it("returns false when imageReference has empty uri", () => {
    const layer = makeLayer({
      id: "r",
      locked: true,
      imageReference: {
        uri: "",
        naturalWidth: 100,
        naturalHeight: 100,
        objectFit: "fill",
      },
    });
    expect(layerAllowsTransformWhilePixelLocked(layer)).toBe(false);
  });
});
