/**
 * Tests for transformTargetSet and opaquePixelBounds modules.
 *
 * Covers:
 *   - resolveTransformTargetLayerIds: seeds, group expansion, eligibility
 *   - TransformTargetSet: single-target replace/clear/has semantics
 *   - pickTopmostTransformableLayer: visibility, lock, hit-test
 *   - computeOpaquePixelBounds: empty, full, partial canvas
 *   - getVisualBounds: tight pixel bounds for canvas-sized layers
 */

import {
  TransformTargetSet,
  pickTopmostTransformableLayer,
  resolveTransformTargetLayerIds
} from "../tools/transformTargetSet";
import {
  computeOpaquePixelBounds,
  computeLayerOpaquePixelBounds
} from "../painting/opaquePixelBounds";
import { getVisualBounds } from "../transform/geometry/layerGeometry";
import type {
  Layer,
  LayerContentBounds,
  LayerTransform,
  LayerType,
  SketchDocument
} from "../types";
import { createDefaultDocument } from "../types";
import { setCanvasRasterBounds } from "../transform/geometry/layerGeometry";

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeBounds(
  x = 0,
  y = 0,
  width = 100,
  height = 100
): LayerContentBounds {
  return { x, y, width, height };
}

function makeTransform(x = 0, y = 0): LayerTransform {
  return { kind: "affine", x, y, scaleX: 1, scaleY: 1, rotation: 0 };
}

function makeLayer(overrides?: Partial<Layer>): Layer {
  return {
    id: `layer-${Math.random().toString(36).slice(2, 8)}`,
    name: "Test Layer",
    type: "raster",
    visible: true,
    opacity: 1,
    locked: false,
    alphaLock: false,
    blendMode: "normal",
    data: null,
    transform: makeTransform(),
    contentBounds: makeBounds(),
    exposedAsInput: false,
    exposedAsOutput: false,
    effects: [],
    ...overrides
  };
}

/**
 * Create a test canvas with specific opaque pixel regions.
 * The canvas has `willReadFrequently` set for getImageData compatibility.
 */
function makeCanvasWithPixels(
  width: number,
  height: number,
  opaqueRegions: Array<{ x: number; y: number; w: number; h: number }>
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  // Start fully transparent
  ctx.clearRect(0, 0, width, height);
  // Paint opaque regions
  ctx.fillStyle = "rgba(255, 0, 0, 1)";
  for (const r of opaqueRegions) {
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  return canvas;
}

// ─── resolveTransformTargetLayerIds ──────────────────────────────────────────

interface LayerSpec {
  id: string;
  type?: LayerType;
  parentId?: string | null;
  locked?: boolean;
  /** Locked-but-transformable: an external image ref keeps move/scale legal. */
  imageRef?: boolean;
  /** A quad transform — single-target only, never part of a union. */
  quad?: boolean;
}

const QUAD_CORNERS = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 }
] as const;

function makeDocument(specs: LayerSpec[]): SketchDocument {
  const doc = createDefaultDocument(64, 64);
  doc.layers = specs.map((spec) =>
    makeLayer({
      id: spec.id,
      type: spec.type ?? "raster",
      parentId: spec.parentId ?? null,
      locked: spec.locked ?? false,
      imageReference: spec.imageRef
        ? {
            uri: "asset://ref",
            naturalWidth: 10,
            naturalHeight: 10,
            objectFit: "contain"
          }
        : null,
      transform: spec.quad
        ? { kind: "quad", mode: "distort", quad: QUAD_CORNERS }
        : makeTransform()
    })
  );
  return doc;
}

interface TargetCase {
  name: string;
  layers: LayerSpec[];
  selected: string[];
  active: string | null;
  expected: string[];
}

const TARGET_CASES: TargetCase[] = [
  {
    name: "no selection and no active layer targets nothing",
    layers: [{ id: "a" }],
    selected: [],
    active: null,
    expected: []
  },
  {
    name: "the active layer seeds the target when nothing is selected",
    layers: [{ id: "a" }, { id: "b" }],
    selected: [],
    active: "b",
    expected: ["b"]
  },
  {
    name: "an active id that names no layer targets nothing",
    layers: [{ id: "a" }],
    selected: [],
    active: "gone",
    expected: []
  },
  {
    name: "the panel selection wins over the active layer",
    layers: [{ id: "a" }, { id: "b" }, { id: "c" }],
    selected: ["a", "c"],
    active: "b",
    expected: ["a", "c"]
  },
  {
    name: "a mask layer is transformable like a raster",
    layers: [{ id: "a", type: "mask" }],
    selected: [],
    active: "a",
    expected: ["a"]
  },
  {
    name: "a locked layer is dropped",
    layers: [{ id: "a", locked: true }, { id: "b" }],
    selected: ["a", "b"],
    active: null,
    expected: ["b"]
  },
  {
    name: "a locked layer with an image reference is kept",
    layers: [{ id: "a", locked: true, imageRef: true }, { id: "b" }],
    selected: ["a", "b"],
    active: null,
    expected: ["a", "b"]
  },
  {
    name: "a quad transform is targetable on its own",
    layers: [{ id: "a", quad: true }],
    selected: ["a"],
    active: null,
    expected: ["a"]
  },
  {
    name: "a quad transform is excluded from a multi-layer union",
    layers: [{ id: "a", quad: true }, { id: "b" }],
    selected: ["a", "b"],
    active: null,
    expected: ["b"]
  },
  {
    name: "a group seed expands to its eligible children, group excluded",
    layers: [
      { id: "g", type: "group" },
      { id: "a", parentId: "g" },
      { id: "b", parentId: "g" },
      { id: "outside" }
    ],
    selected: ["g"],
    active: null,
    expected: ["a", "b"]
  },
  {
    name: "group expansion is transitive through nested groups",
    layers: [
      { id: "g", type: "group" },
      { id: "inner", type: "group", parentId: "g" },
      { id: "deep", parentId: "inner" }
    ],
    selected: ["g"],
    active: null,
    expected: ["deep"]
  },
  {
    name: "group expansion drops quad-transformed children",
    layers: [
      { id: "g", type: "group" },
      { id: "a", parentId: "g", quad: true },
      { id: "b", parentId: "g" }
    ],
    selected: ["g"],
    active: null,
    expected: ["b"]
  },
  {
    name: "a group whose only child is quad-transformed targets nothing",
    layers: [
      { id: "g", type: "group" },
      { id: "a", parentId: "g", quad: true }
    ],
    selected: ["g"],
    active: null,
    expected: []
  },
  {
    name: "a locked group still expands — lock is per layer",
    layers: [
      { id: "g", type: "group", locked: true },
      { id: "a", parentId: "g" }
    ],
    selected: ["g"],
    active: null,
    expected: ["a"]
  },
  {
    name: "a group seeded as the active layer expands the same way",
    layers: [
      { id: "g", type: "group" },
      { id: "a", parentId: "g" }
    ],
    selected: [],
    active: "g",
    expected: ["a"]
  },
  {
    name: "selecting a group and its child yields the child once",
    layers: [
      { id: "g", type: "group" },
      { id: "a", parentId: "g" }
    ],
    selected: ["g", "a"],
    active: null,
    expected: ["a"]
  },
  {
    name: "a seed that names no layer is skipped",
    layers: [{ id: "a" }, { id: "b" }],
    selected: ["a", "gone", "b"],
    active: null,
    expected: ["a", "b"]
  },
  {
    name: "results follow document stack order, not selection order",
    layers: [{ id: "a" }, { id: "b" }, { id: "c" }],
    selected: ["c", "a", "b"],
    active: null,
    expected: ["a", "b", "c"]
  }
];

describe("resolveTransformTargetLayerIds", () => {
  it.each(TARGET_CASES)("$name", ({ layers, selected, active, expected }) => {
    const doc = makeDocument(layers);
    expect(resolveTransformTargetLayerIds(doc, selected, active)).toEqual(
      expected
    );
  });
});

// ─── TransformTargetSet ──────────────────────────────────────────────────────

describe("TransformTargetSet", () => {
  let ts: TransformTargetSet;

  beforeEach(() => {
    ts = new TransformTargetSet();
  });

  it("starts empty", () => {
    expect(ts.size).toBe(0);
    expect(ts.getIds()).toEqual([]);
    expect(ts.getEntry()).toBeNull();
    expect(ts.has("any")).toBe(false);
  });

  it("setSingle replaces any previous target with one entry", () => {
    ts.setSingle("a", makeBounds(0, 0, 50, 50));
    ts.setSingle("c", makeBounds(20, 20, 70, 70));
    expect(ts.size).toBe(1);
    expect(ts.has("c")).toBe(true);
    expect(ts.has("a")).toBe(false);
    expect(ts.getIds()).toEqual(["c"]);
  });

  it("getEntry returns a defensive copy of the current target", () => {
    ts.setSingle("a", makeBounds(10, 20, 30, 40));
    const entry = ts.getEntry();
    expect(entry).toEqual({
      layerId: "a",
      bounds: { x: 10, y: 20, width: 30, height: 40 }
    });
    expect(entry).not.toBe(ts.getEntries()[0]);
  });

  it("clear removes the current target", () => {
    ts.setSingle("a", makeBounds());
    ts.clear();
    expect(ts.size).toBe(0);
    expect(ts.getIds()).toEqual([]);
  });

  it("getRasterBounds returns null when empty", () => {
    expect(ts.getRasterBounds()).toBeNull();
  });

  it("getRasterBounds returns current target bounds", () => {
    ts.setSingle("a", makeBounds(10, 20, 100, 200));
    const result = ts.getRasterBounds();
    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });

  it("computeTargetExtents returns null when empty", () => {
    expect(ts.computeTargetExtents(() => makeTransform())).toBeNull();
  });

  it("computeTargetExtents respects the targeted layer transform", () => {
    ts.setSingle("b", makeBounds(0, 0, 50, 50));
    const result = ts.computeTargetExtents(() => makeTransform(100, 100));
    expect(result).not.toBeNull();
    expect(result).toEqual({ x: 100, y: 100, width: 50, height: 50 });
  });
});

// ─── computeOpaquePixelBounds ────────────────────────────────────────────────

describe("computeOpaquePixelBounds", () => {
  it("returns null for a fully transparent canvas", () => {
    const canvas = makeCanvasWithPixels(100, 100, []);
    expect(computeOpaquePixelBounds(canvas)).toBeNull();
  });

  it("returns full bounds for a fully opaque canvas", () => {
    const canvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const result = computeOpaquePixelBounds(canvas);
    expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it("computes tight bounds for a small opaque region", () => {
    const canvas = makeCanvasWithPixels(512, 512, [
      { x: 100, y: 200, w: 50, h: 30 }
    ]);
    const result = computeOpaquePixelBounds(canvas);
    expect(result).toEqual({ x: 100, y: 200, width: 50, height: 30 });
  });

  it("computes tight bounds for multiple opaque regions", () => {
    const canvas = makeCanvasWithPixels(512, 512, [
      { x: 10, y: 20, w: 30, h: 30 },
      { x: 400, y: 450, w: 20, h: 20 }
    ]);
    const result = computeOpaquePixelBounds(canvas);
    expect(result).not.toBeNull();
    expect(result!.x).toBe(10);
    expect(result!.y).toBe(20);
    // Right edge: 400 + 20 = 420, so width = 420 - 10 = 410
    expect(result!.width).toBe(410);
    // Bottom edge: 450 + 20 = 470, so height = 470 - 20 = 450
    expect(result!.height).toBe(450);
  });

  it("returns null for a zero-size canvas", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 0;
    canvas.height = 0;
    expect(computeOpaquePixelBounds(canvas)).toBeNull();
  });
});

describe("computeLayerOpaquePixelBounds", () => {
  it("offsets bounds by raster origin", () => {
    const canvas = makeCanvasWithPixels(100, 100, [
      { x: 10, y: 20, w: 30, h: 40 }
    ]);
    const result = computeLayerOpaquePixelBounds(
      canvas,
      { x: 50, y: 60 }
    );
    expect(result).toEqual({ x: 60, y: 80, width: 30, height: 40 });
  });

  it("works without raster origin", () => {
    const canvas = makeCanvasWithPixels(100, 100, [
      { x: 10, y: 20, w: 30, h: 40 }
    ]);
    const result = computeLayerOpaquePixelBounds(canvas);
    expect(result).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });
});

// ─── getVisualBounds with pixel bounds ────────────────────────────────────

describe("getVisualBounds (pixel bounds integration)", () => {
  it("returns tight pixel bounds when canvas is canvas-sized with small content", () => {
    // Layer with contentBounds matching canvas size (512x512)
    const layer = makeLayer({
      contentBounds: makeBounds(0, 0, 512, 512)
    });
    // Canvas is 512x512 but only has a small painted area
    const canvas = makeCanvasWithPixels(512, 512, [
      { x: 50, y: 50, w: 100, h: 100 }
    ]);
    setCanvasRasterBounds(canvas, { x: 0, y: 0, width: 512, height: 512 });

    const result = getVisualBounds(layer, canvas, { width: 512, height: 512 });
    // Should return tight pixel bounds, not full 512x512
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
  });

  it("returns contentBounds when they are smaller than raster bounds", () => {
    const layer = makeLayer({
      contentBounds: makeBounds(10, 10, 50, 50)
    });
    const canvas = makeCanvasWithPixels(512, 512, [
      { x: 0, y: 0, w: 512, h: 512 }
    ]);
    setCanvasRasterBounds(canvas, { x: 0, y: 0, width: 512, height: 512 });

    const result = getVisualBounds(layer, canvas, { width: 512, height: 512 });
    // contentBounds are smaller, so use them
    expect(result).toEqual({ x: 10, y: 10, width: 50, height: 50 });
  });

  it("returns raster bounds for a fully transparent canvas", () => {
    const layer = makeLayer({
      contentBounds: makeBounds(0, 0, 512, 512)
    });
    const canvas = makeCanvasWithPixels(512, 512, []);
    setCanvasRasterBounds(canvas, { x: 0, y: 0, width: 512, height: 512 });

    const result = getVisualBounds(layer, canvas, { width: 512, height: 512 });
    // No opaque pixels → fall back to raster bounds
    expect(result).toEqual({ x: 0, y: 0, width: 512, height: 512 });
  });
});

// ─── pickTopmostTransformableLayer ───────────────────────────────────────────

describe("pickTopmostTransformableLayer", () => {
  it("returns null when no layers have opaque pixels at the point", () => {
    const layer = makeLayer({ id: "a" });
    const canvas = makeCanvasWithPixels(100, 100, []);
    const canvases = new Map([["a", canvas]]);
    const result = pickTopmostTransformableLayer(
      [layer],
      canvases,
      { x: 50, y: 50 },
      null
    );
    expect(result).toBeNull();
  });

  it("picks the topmost visible layer with opaque pixels", () => {
    const bottom = makeLayer({ id: "bottom" });
    const top = makeLayer({ id: "top" });
    // Only the top layer has pixels at (50,50)
    const bottomCanvas = makeCanvasWithPixels(100, 100, []);
    const topCanvas = makeCanvasWithPixels(100, 100, [
      { x: 40, y: 40, w: 20, h: 20 }
    ]);
    const canvases = new Map([
      ["bottom", bottomCanvas],
      ["top", topCanvas]
    ]);
    const result = pickTopmostTransformableLayer(
      [bottom, top],
      canvases,
      { x: 50, y: 50 },
      null
    );
    expect(result?.id).toBe("top");
  });

  it("skips invisible layers", () => {
    const visible = makeLayer({ id: "visible" });
    const invisible = makeLayer({ id: "invisible", visible: false });
    const visibleCanvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const invisibleCanvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const canvases = new Map([
      ["visible", visibleCanvas],
      ["invisible", invisibleCanvas]
    ]);
    const result = pickTopmostTransformableLayer(
      [visible, invisible],
      canvases,
      { x: 50, y: 50 },
      null
    );
    // The invisible layer (higher index = top) is skipped
    expect(result?.id).toBe("visible");
  });

  it("skips locked layers", () => {
    const unlocked = makeLayer({ id: "unlocked" });
    const locked = makeLayer({ id: "locked", locked: true });
    const unlockedCanvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const lockedCanvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const canvases = new Map([
      ["unlocked", unlockedCanvas],
      ["locked", lockedCanvas]
    ]);
    const result = pickTopmostTransformableLayer(
      [unlocked, locked],
      canvases,
      { x: 50, y: 50 },
      null
    );
    expect(result?.id).toBe("unlocked");
  });

  it("skips group layers", () => {
    const raster = makeLayer({ id: "raster" });
    const group = makeLayer({ id: "group", type: "group" });
    const rasterCanvas = makeCanvasWithPixels(100, 100, [
      { x: 0, y: 0, w: 100, h: 100 }
    ]);
    const canvases = new Map([["raster", rasterCanvas]]);
    const result = pickTopmostTransformableLayer(
      [raster, group],
      canvases,
      { x: 50, y: 50 },
      null
    );
    expect(result?.id).toBe("raster");
  });
});
