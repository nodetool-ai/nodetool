/**
 * Unique coverage for transformPreview helpers that are NOT exercised by
 * transformCorrectness.test.ts:
 *   - applyTransformPreviews (composite document builder)
 *   - isCompleteTransform (predicate)
 *
 * mergeTransformPreview / createMovePreview / resolveLayerGeometry /
 * getTransformedCorners / preview-vs-commit parity are all covered by
 * transformCorrectness.test.ts (and by transformTargetSet.test.ts for
 * gizmo bounds).
 */

import {
  mergeTransformPreview,
  applyTransformPreviews,
  isCompleteTransform
} from "../painting/transformPreview";
import type { LayerTransform, LayerContentBounds, SketchDocument, Layer } from "../types";

function makeTransform(overrides?: Partial<LayerTransform>): LayerTransform {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...overrides };
}

function makeBounds(overrides?: Partial<LayerContentBounds>): LayerContentBounds {
  return { x: 0, y: 0, width: 100, height: 100, ...overrides };
}

function makeLayer(overrides?: Partial<Layer>): Layer {
  return {
    id: "test-layer",
    name: "Test Layer",
    type: "paint",
    visible: true,
    opacity: 1,
    locked: false,
    blendMode: "normal",
    data: null,
    effects: [],
    transform: makeTransform(),
    contentBounds: makeBounds(),
    ...(overrides as Partial<Layer>)
  } as Layer;
}

function makeDoc(layers: Layer[]): SketchDocument {
  return {
    version: 3,
    canvas: { width: 512, height: 512, backgroundColor: "#ffffff" },
    layers,
    activeLayerId: layers[0]?.id ?? "",
    maskLayerId: null,
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    toolSettings: {} as SketchDocument["toolSettings"]
  } as SketchDocument;
}

describe("applyTransformPreviews", () => {
  it("returns null when no previews exist", () => {
    const layer = makeLayer();
    const doc = makeDoc([layer]);
    expect(applyTransformPreviews(doc, {})).toBeNull();
  });

  it("replaces layer transforms with merged previews", () => {
    const layer = makeLayer({
      transform: makeTransform({ x: 0, y: 0, scaleX: 2, scaleY: 2 })
    });
    const doc = makeDoc([layer]);
    const preview: Record<string, LayerTransform> = {
      [layer.id]: { x: 10, y: 20 }
    };

    const result = applyTransformPreviews(doc, preview);
    expect(result).not.toBeNull();
    const previewedLayer = result!.layers[0];
    expect(previewedLayer.transform.x).toBe(10);
    expect(previewedLayer.transform.y).toBe(20);
    // Scale preserved from the stored transform
    expect(previewedLayer.transform.scaleX).toBe(2);
    expect(previewedLayer.transform.scaleY).toBe(2);
  });

  it("does not mutate the original document", () => {
    const layer = makeLayer();
    const doc = makeDoc([layer]);
    const preview: Record<string, LayerTransform> = {
      [layer.id]: { x: 99, y: 99 }
    };

    applyTransformPreviews(doc, preview);
    expect(doc.layers[0].transform.x).toBe(0);
    expect(doc.layers[0].transform.y).toBe(0);
  });

  it("leaves non-previewed layers untouched (same reference)", () => {
    const layer1 = makeLayer({ id: "a" });
    const layer2 = makeLayer({ id: "b" });
    const doc = makeDoc([layer1, layer2]);
    const preview: Record<string, LayerTransform> = {
      a: { x: 10, y: 10 }
    };

    const result = applyTransformPreviews(doc, preview);
    expect(result!.layers[1]).toBe(layer2);
  });
});

describe("isCompleteTransform", () => {
  it("returns true for a complete transform", () => {
    expect(isCompleteTransform(makeTransform())).toBe(true);
  });

  it("returns false for translation-only transform", () => {
    expect(isCompleteTransform({ x: 10, y: 20 })).toBe(false);
  });

  it("returns true after mergeTransformPreview", () => {
    const result = mergeTransformPreview(makeTransform(), { x: 10, y: 20 });
    expect(isCompleteTransform(result)).toBe(true);
  });
});
