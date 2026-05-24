/**
 * @jest-environment node
 */
import {
  mergeTransformPreview,
  applyTransformPreviews,
  createMovePreview,
  isCompleteTransform,
} from "../transformPreview";
import {
  makeAffineTransform,
  makeSingleQuadTransform,
  IDENTITY_AFFINE,
} from "../../types";
import type { LayerTransform } from "../../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(layers: Array<{ id: string; transform: LayerTransform }>) {
  return {
    version: 1,
    canvas: { width: 100, height: 100, backgroundColor: "#ffffff" },
    layers,
    activeLayerId: layers[0]?.id ?? "",
    maskLayerId: null,
    toolSettings: {},
    metadata: { createdAt: "", updatedAt: "" },
  } as any;
}

function makeLayer(
  id: string,
  transform: LayerTransform
): { id: string; transform: LayerTransform } {
  return { id, transform } as any;
}

const unitQuad: [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

// ---------------------------------------------------------------------------
// mergeTransformPreview
// ---------------------------------------------------------------------------

describe("mergeTransformPreview", () => {
  it("returns a clone of the update (affine)", () => {
    const base = makeAffineTransform({ x: 1, y: 2, scaleX: 3 });
    const update = makeAffineTransform({ x: 10, y: 20, scaleX: 0.5 });
    const result = mergeTransformPreview(base, update);

    expect(result).toEqual(update);
    expect(result).not.toBe(update);
  });

  it("returns a clone of the update (quad)", () => {
    const base = makeAffineTransform({ x: 5, y: 5 });
    const update = makeSingleQuadTransform("distort", unitQuad);
    const result = mergeTransformPreview(base, update);

    expect(result).toEqual(update);
    expect(result).not.toBe(update);
  });

  it("ignores the base transform entirely", () => {
    const base = makeAffineTransform({ x: 99, y: 99, scaleX: 10, rotation: 3 });
    const update = makeAffineTransform({ x: 0, y: 0 });
    const result = mergeTransformPreview(base, update);

    expect(result).toEqual(update);
    expect((result as any).scaleX).toBe(1); // defaults, not base's 10
  });

  it("deep-clones quad data so mutations do not propagate", () => {
    const quad: typeof unitQuad = [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
      { x: 70, y: 80 },
    ];
    const update = makeSingleQuadTransform("perspective", quad);
    const base = makeAffineTransform();
    const result = mergeTransformPreview(base, update);

    // Mutate the original quad's point
    quad[0].x = 999;

    expect(result.kind).toBe("quad");
    if (result.kind === "quad") {
      expect(result.quad[0].x).not.toBe(999);
    }
  });
});

// ---------------------------------------------------------------------------
// applyTransformPreviews
// ---------------------------------------------------------------------------

describe("applyTransformPreviews", () => {
  const layer1 = makeLayer("layer-1", makeAffineTransform({ x: 10, y: 20 }));
  const layer2 = makeLayer(
    "layer-2",
    makeAffineTransform({ x: 30, y: 40, scaleX: 2 })
  );

  it("returns null when previewByLayerId is empty", () => {
    const doc = makeDoc([layer1, layer2]);
    const result = applyTransformPreviews(doc, {});
    expect(result).toBeNull();
  });

  it("returns a shallow clone of doc with updated layers", () => {
    const doc = makeDoc([layer1, layer2]);
    const preview = makeAffineTransform({ x: 50, y: 60 });
    const result = applyTransformPreviews(doc, { "layer-1": preview });

    expect(result).not.toBeNull();
    expect(result).not.toBe(doc);
    expect(result!.canvas).toBe(doc.canvas); // shallow — same reference
  });

  it("replaces the transform of layers with a preview", () => {
    const doc = makeDoc([layer1, layer2]);
    const preview = makeAffineTransform({ x: 100, y: 200, scaleX: 5 });
    const result = applyTransformPreviews(doc, { "layer-1": preview })!;

    expect(result.layers[0].transform).toEqual(preview);
    // Clone, not same reference
    expect(result.layers[0].transform).not.toBe(preview);
  });

  it("leaves layers without a preview unchanged (same reference)", () => {
    const doc = makeDoc([layer1, layer2]);
    const preview = makeAffineTransform({ x: 100, y: 200 });
    const result = applyTransformPreviews(doc, { "layer-1": preview })!;

    expect(result.layers[1]).toBe(layer2); // reused by reference
  });

  it("applies previews to multiple layers simultaneously", () => {
    const doc = makeDoc([layer1, layer2]);
    const p1 = makeAffineTransform({ x: 1, y: 1 });
    const p2 = makeAffineTransform({ x: 2, y: 2 });
    const result = applyTransformPreviews(doc, {
      "layer-1": p1,
      "layer-2": p2,
    })!;

    expect(result.layers[0].transform).toEqual(p1);
    expect(result.layers[1].transform).toEqual(p2);
  });

  it("falls back to IDENTITY_AFFINE for layers with undefined transform", () => {
    const noTransformLayer = { id: "no-tf" } as any;
    const doc = makeDoc([noTransformLayer]);
    const preview = makeAffineTransform({ x: 5, y: 5 });
    const result = applyTransformPreviews(doc, { "no-tf": preview })!;

    // The result should have the preview transform (mergeTransformPreview
    // ignores base anyway), but the function should not throw when
    // layer.transform is undefined.
    expect(result.layers[0].transform).toEqual(preview);
  });

  it("does not modify the original document's layers array", () => {
    const doc = makeDoc([layer1, layer2]);
    const originalLayers = [...doc.layers];
    applyTransformPreviews(doc, {
      "layer-1": makeAffineTransform({ x: 999, y: 999 }),
    });

    expect(doc.layers).toEqual(originalLayers);
    expect(doc.layers[0].transform).toEqual(layer1.transform);
  });
});

// ---------------------------------------------------------------------------
// createMovePreview
// ---------------------------------------------------------------------------

describe("createMovePreview", () => {
  it("returns an affine transform with updated x/y for affine layers", () => {
    const layer = makeLayer(
      "test",
      makeAffineTransform({ x: 10, y: 20, scaleX: 2, rotation: 0.5 })
    );
    const result = createMovePreview(layer as any, 50, 60);

    expect(result.kind).toBe("affine");
    if (result.kind === "affine") {
      expect(result.x).toBe(50);
      expect(result.y).toBe(60);
    }
  });

  it("preserves scale and rotation from the original affine transform", () => {
    const layer = makeLayer(
      "test",
      makeAffineTransform({ x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 1.5 })
    );
    const result = createMovePreview(layer as any, 0, 0);

    expect(result.kind).toBe("affine");
    if (result.kind === "affine") {
      expect(result.scaleX).toBe(2);
      expect(result.scaleY).toBe(3);
      expect(result.rotation).toBe(1.5);
    }
  });

  it("returns a default affine with x/y for quad layers", () => {
    const layer = makeLayer(
      "test",
      makeSingleQuadTransform("distort", unitQuad)
    );
    const result = createMovePreview(layer as any, 100, 200);

    expect(result.kind).toBe("affine");
    if (result.kind === "affine") {
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
      expect(result.scaleX).toBe(1);
      expect(result.scaleY).toBe(1);
      expect(result.rotation).toBe(0);
    }
  });

  it("does not mutate the original layer transform", () => {
    const original = makeAffineTransform({ x: 10, y: 20, scaleX: 2 });
    const layer = makeLayer("test", original);
    createMovePreview(layer as any, 50, 60);

    expect(layer.transform).toEqual(original);
    if (layer.transform.kind === "affine") {
      expect(layer.transform.x).toBe(10);
      expect(layer.transform.y).toBe(20);
    }
  });
});

// ---------------------------------------------------------------------------
// isCompleteTransform
// ---------------------------------------------------------------------------

describe("isCompleteTransform", () => {
  it("returns true for affine transforms", () => {
    expect(isCompleteTransform(makeAffineTransform())).toBe(true);
  });

  it("returns true for quad transforms", () => {
    expect(
      isCompleteTransform(makeSingleQuadTransform("distort", unitQuad))
    ).toBe(true);
  });

  it("returns true for all quad modes", () => {
    const modes = ["distort", "skew", "perspective", "mesh-warp"] as const;
    for (const mode of modes) {
      expect(
        isCompleteTransform(makeSingleQuadTransform(mode, unitQuad))
      ).toBe(true);
    }
  });

  it("returns false for an object with an unknown kind", () => {
    const bogus = { kind: "unknown" } as any;
    expect(isCompleteTransform(bogus)).toBe(false);
  });
});
