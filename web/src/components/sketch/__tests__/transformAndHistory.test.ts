/**
 * Tests for Phase 1.7 (Harden transform model) and Phase 1.8 (Harden history
 * and serialization) of the sketch editor roadmap.
 */

import {
  composeAffineMatrix,
  decomposeAffineMatrix,
  ensureTransformMatrix,
  type AffineMatrix,
  type LayerTransform
} from "../types";
import { CoordinateMapper } from "../painting/CoordinateMapper";
import { resolveLayerData } from "../state/slices/historySlice";
import type { HistoryEntry, LayerStructureSnapshot } from "../types";
import {
  createDefaultDocument,
  createDefaultLayer
} from "../types";
import { serializeDocument, deserializeDocument } from "../serialization";

// ─── Helper: verify two matrices produce the same visual transform ───────────
// Two decompose results are "visually equivalent" when recomposing each yields
// the same 6-element affine matrix (within tolerance).
function matricesVisuallyEqual(
  a: AffineMatrix,
  b: AffineMatrix,
  precision = 5
): void {
  for (let i = 0; i < 6; i++) {
    expect(a[i]).toBeCloseTo(b[i], precision);
  }
}

// ─── Helper: build a minimal LayerStructureSnapshot ─────────────────────────
function makeLayerStructure(
  id: string,
  name = id
): LayerStructureSnapshot {
  return {
    id,
    name,
    type: "raster",
    visible: true,
    opacity: 1,
    locked: false,
    alphaLock: false,
    blendMode: "normal",
    transform: { x: 0, y: 0 },
    contentBounds: { x: 0, y: 0, width: 512, height: 512 },
    effects: []
  };
}

// ─── Helper: build a HistoryEntry ───────────────────────────────────────────
function makeEntry(
  snapshots: Record<string, string | null>,
  structures: LayerStructureSnapshot[],
  action: string,
  activeLayerId = structures[0]?.id ?? "L1"
): HistoryEntry {
  return {
    changedLayerIds: Object.keys(snapshots),
    layerSnapshots: snapshots,
    layerStructure: structures,
    activeLayerId,
    maskLayerId: null,
    restoreMode: "full",
    action,
    timestamp: Date.now()
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1.7 — Transform Model Hardening
// ═══════════════════════════════════════════════════════════════════════════════

describe("transform model hardening", () => {
  // ─── Negative scale (horizontal flip) round-trip ──────────────────────────
  describe("negative scale (flip) round-trip", () => {
    it("composeAffineMatrix(0,0,-1,1,0) → decompose preserves the visual transform", () => {
      const original = composeAffineMatrix(0, 0, -1, 1, 0);
      const d = decomposeAffineMatrix(original);

      // Recompose from the decomposed values
      const reconstructed = composeAffineMatrix(
        d.x,
        d.y,
        d.scaleX,
        d.scaleY,
        d.rotation
      );

      // The 6-element matrix must match the original, proving the visual
      // transform is preserved even though decomposition may redistribute
      // the flip between scaleY and rotation.
      matricesVisuallyEqual(original, reconstructed);
    });

    it("decompose detects negative determinant for horizontal flip", () => {
      const m = composeAffineMatrix(0, 0, -1, 1, 0);
      const d = decomposeAffineMatrix(m);

      // det = a*d - b*c = (-1)(1) - (0)(0) = -1 → scaleY is negated
      expect(d.scaleY).toBeLessThan(0);
    });
  });

  // ─── Non-uniform scale with negative ─────────────────────────────────────
  describe("non-uniform scale with negative round-trip", () => {
    it("composeAffineMatrix(0,0,-2,3,0) → decompose → recompose yields same matrix", () => {
      const original = composeAffineMatrix(0, 0, -2, 3, 0);
      const d = decomposeAffineMatrix(original);
      const reconstructed = composeAffineMatrix(
        d.x,
        d.y,
        d.scaleX,
        d.scaleY,
        d.rotation
      );
      matricesVisuallyEqual(original, reconstructed);
    });

    it("preserves scale magnitudes through round-trip", () => {
      const m = composeAffineMatrix(0, 0, -2, 3, 0);
      const d = decomposeAffineMatrix(m);

      // scaleX is always positive (magnitude of column vector)
      expect(d.scaleX).toBeCloseTo(2, 5);
      // scaleY magnitude should be 3 (sign depends on determinant)
      expect(Math.abs(d.scaleY)).toBeCloseTo(3, 5);
    });

    it("negative scale with translation round-trips correctly", () => {
      const original = composeAffineMatrix(15, -20, -2, 3, 0);
      const d = decomposeAffineMatrix(original);
      const reconstructed = composeAffineMatrix(
        d.x,
        d.y,
        d.scaleX,
        d.scaleY,
        d.rotation
      );
      matricesVisuallyEqual(original, reconstructed);
    });

    it("negative scale with rotation round-trips correctly", () => {
      const original = composeAffineMatrix(0, 0, -2, 3, Math.PI / 6);
      const d = decomposeAffineMatrix(original);
      const reconstructed = composeAffineMatrix(
        d.x,
        d.y,
        d.scaleX,
        d.scaleY,
        d.rotation
      );
      matricesVisuallyEqual(original, reconstructed);
    });
  });

  // ─── ensureTransformMatrix with only x/y (no scale/rotation) ─────────────
  describe("ensureTransformMatrix with only x/y", () => {
    it("produces a pure translation matrix [1,0,0,1,x,y]", () => {
      const t: LayerTransform = { x: 42, y: -17 };
      const result = ensureTransformMatrix(t);

      expect(result.matrix).toBeDefined();
      expect(result.matrix![0]).toBeCloseTo(1); // a
      expect(result.matrix![1]).toBeCloseTo(0); // b
      expect(result.matrix![2]).toBeCloseTo(0); // c
      expect(result.matrix![3]).toBeCloseTo(1); // d
      expect(result.matrix![4]).toBe(42);       // e = x
      expect(result.matrix![5]).toBe(-17);      // f = y
    });

    it("CoordinateMapper treats x/y-only and explicit identity+translate the same", () => {
      const x = 30;
      const y = -10;

      // Transform with only x/y — let ensureTransformMatrix compute the matrix
      const minimal: LayerTransform = { x, y };
      const enriched = ensureTransformMatrix(minimal);

      // Explicit matrix
      const explicit: LayerTransform = {
        x,
        y,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        matrix: composeAffineMatrix(x, y, 1, 1, 0)
      };

      const mapperMin = new CoordinateMapper({
        layerTransform: enriched
      });
      const mapperExplicit = new CoordinateMapper({
        layerTransform: explicit
      });

      const docPt = { x: 100, y: 200 };

      const a = mapperMin.docToLayer(docPt);
      const b = mapperExplicit.docToLayer(docPt);
      expect(a.x).toBeCloseTo(b.x, 5);
      expect(a.y).toBeCloseTo(b.y, 5);

      const rtA = mapperMin.layerToDoc(a);
      const rtB = mapperExplicit.layerToDoc(b);
      expect(rtA.x).toBeCloseTo(rtB.x, 5);
      expect(rtA.y).toBeCloseTo(rtB.y, 5);
    });

    it("round-trips through CoordinateMapper with only x/y transform", () => {
      const t = ensureTransformMatrix({ x: 50, y: 75 });
      const mapper = new CoordinateMapper({ layerTransform: t });

      const original = { x: 200, y: 300 };
      const layer = mapper.docToLayer(original);
      const roundTrip = mapper.layerToDoc(layer);

      expect(roundTrip.x).toBeCloseTo(original.x, 5);
      expect(roundTrip.y).toBeCloseTo(original.y, 5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1.8 — History Delta Correctness
// ═══════════════════════════════════════════════════════════════════════════════

describe("history delta correctness", () => {
  const structA = makeLayerStructure("L-A");
  const structB = makeLayerStructure("L-B");
  const structC = makeLayerStructure("L-C");
  const allStructures = [structA, structB, structC];

  // ─── Three entries, one layer changes each time ───────────────────────────
  describe("three entries, different layers change each time", () => {
    const history: HistoryEntry[] = [
      // Entry 0 — baseline: all layers present
      makeEntry(
        { "L-A": "dataA-v0", "L-B": "dataB-v0", "L-C": "dataC-v0" },
        allStructures,
        "initial"
      ),
      // Entry 1 — only L-A changes
      makeEntry({ "L-A": "dataA-v1" }, allStructures, "paint L-A"),
      // Entry 2 — only L-B changes
      makeEntry({ "L-B": "dataB-v2" }, allStructures, "paint L-B")
    ];

    it("resolves correct data at index 0 (baseline)", () => {
      expect(resolveLayerData(history, 0, "L-A")).toBe("dataA-v0");
      expect(resolveLayerData(history, 0, "L-B")).toBe("dataB-v0");
      expect(resolveLayerData(history, 0, "L-C")).toBe("dataC-v0");
    });

    it("resolves correct data at index 1 (L-A updated)", () => {
      expect(resolveLayerData(history, 1, "L-A")).toBe("dataA-v1");
      expect(resolveLayerData(history, 1, "L-B")).toBe("dataB-v0");
      expect(resolveLayerData(history, 1, "L-C")).toBe("dataC-v0");
    });

    it("resolves correct data at index 2 (L-B updated)", () => {
      expect(resolveLayerData(history, 2, "L-A")).toBe("dataA-v1");
      expect(resolveLayerData(history, 2, "L-B")).toBe("dataB-v2");
      expect(resolveLayerData(history, 2, "L-C")).toBe("dataC-v0");
    });
  });

  // ─── Layer with no snapshot returns null ───────────────────────────────────
  describe("layer with no snapshot", () => {
    it("returns null for a layer that was never in any snapshot", () => {
      const history: HistoryEntry[] = [
        makeEntry(
          { "L-A": "dataA-v0", "L-B": "dataB-v0" },
          [structA, structB],
          "initial"
        )
      ];
      expect(resolveLayerData(history, 0, "L-UNKNOWN")).toBeNull();
    });

    it("returns null when searching beyond available entries", () => {
      const history: HistoryEntry[] = [
        makeEntry({ "L-A": "dataA-v0" }, [structA], "initial")
      ];
      expect(resolveLayerData(history, 0, "L-B")).toBeNull();
    });
  });

  // ─── Delta entry inherits from baseline ───────────────────────────────────
  describe("delta entry inherits from baseline", () => {
    it("layer-A at index 1 returns baseline when only layer-B changed", () => {
      const history: HistoryEntry[] = [
        // Baseline: all layers
        makeEntry(
          { "L-A": "dataA-baseline", "L-B": "dataB-baseline" },
          [structA, structB],
          "initial"
        ),
        // Delta: only L-B changes
        makeEntry({ "L-B": "dataB-updated" }, [structA, structB], "paint L-B")
      ];

      // L-A was not in entry 1's snapshots, so resolveLayerData walks back
      // to entry 0 and returns the baseline data.
      expect(resolveLayerData(history, 1, "L-A")).toBe("dataA-baseline");
      // L-B should return the updated value
      expect(resolveLayerData(history, 1, "L-B")).toBe("dataB-updated");
    });
  });

  // ─── Undo should resolve to previous data ─────────────────────────────────
  describe("undo resolves to previous data", () => {
    it("at index 0 after undo, layer data is the baseline value", () => {
      const history: HistoryEntry[] = [
        makeEntry(
          { "L-A": "dataA-original", "L-B": "dataB-original" },
          [structA, structB],
          "initial"
        ),
        makeEntry(
          { "L-A": "dataA-modified" },
          [structA, structB],
          "paint L-A"
        )
      ];

      // Simulate undo: resolve at index 0 (before the paint action)
      expect(resolveLayerData(history, 0, "L-A")).toBe("dataA-original");
      expect(resolveLayerData(history, 0, "L-B")).toBe("dataB-original");

      // At index 1 (tip), L-A has the modified value
      expect(resolveLayerData(history, 1, "L-A")).toBe("dataA-modified");
    });

    it("handles null snapshot values (deleted/empty layer data)", () => {
      const history: HistoryEntry[] = [
        makeEntry(
          { "L-A": "dataA-original" },
          [structA],
          "initial"
        ),
        makeEntry(
          { "L-A": null },
          [structA],
          "clear L-A"
        )
      ];

      // After clearing, resolve at tip returns null
      expect(resolveLayerData(history, 1, "L-A")).toBeNull();
      // Undo (index 0) returns original data
      expect(resolveLayerData(history, 0, "L-A")).toBe("dataA-original");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1.8 — Serialization Round-Trip with Bounds and Transform
// ═══════════════════════════════════════════════════════════════════════════════

describe("serialization round-trip with bounds and transform", () => {
  it("preserves contentBounds and transform through serialize/deserialize", () => {
    const doc = createDefaultDocument(800, 600);

    // Modify the default layer with non-trivial transform and bounds
    const layer = doc.layers[0];
    layer.transform = {
      x: 25,
      y: -10,
      scaleX: 1.5,
      scaleY: 0.8,
      rotation: 0.3,
      matrix: composeAffineMatrix(25, -10, 1.5, 0.8, 0.3)
    };
    layer.contentBounds = { x: 10, y: 20, width: 400, height: 300 };

    // Add a second layer with different transform
    const layer2 = createDefaultLayer("Overlay", "raster", 800, 600);
    layer2.transform = {
      x: -5,
      y: 100,
      scaleX: 2,
      scaleY: 2,
      rotation: Math.PI / 4,
      matrix: composeAffineMatrix(-5, 100, 2, 2, Math.PI / 4)
    };
    layer2.contentBounds = { x: -50, y: -50, width: 200, height: 150 };
    doc.layers.push(layer2);

    // Serialize and deserialize
    const json = serializeDocument(doc);
    const restored = deserializeDocument(json);

    expect(restored).not.toBeNull();
    expect(restored!.layers).toHaveLength(2);

    // Verify first layer
    const r1 = restored!.layers[0];
    expect(r1.transform.x).toBe(25);
    expect(r1.transform.y).toBe(-10);
    expect(r1.transform.scaleX).toBeCloseTo(1.5);
    expect(r1.transform.scaleY).toBeCloseTo(0.8);
    expect(r1.transform.rotation).toBeCloseTo(0.3);
    expect(r1.transform.matrix).toBeDefined();
    matricesVisuallyEqual(
      r1.transform.matrix!,
      composeAffineMatrix(25, -10, 1.5, 0.8, 0.3)
    );
    expect(r1.contentBounds).toEqual({ x: 10, y: 20, width: 400, height: 300 });

    // Verify second layer
    const r2 = restored!.layers[1];
    expect(r2.transform.x).toBe(-5);
    expect(r2.transform.y).toBe(100);
    expect(r2.transform.scaleX).toBeCloseTo(2);
    expect(r2.transform.scaleY).toBeCloseTo(2);
    expect(r2.transform.rotation).toBeCloseTo(Math.PI / 4);
    expect(r2.transform.matrix).toBeDefined();
    matricesVisuallyEqual(
      r2.transform.matrix!,
      composeAffineMatrix(-5, 100, 2, 2, Math.PI / 4)
    );
    expect(r2.contentBounds).toEqual({
      x: -50,
      y: -50,
      width: 200,
      height: 150
    });
  });

  it("deserializing a serialized document preserves canvas dimensions", () => {
    const doc = createDefaultDocument(1024, 768);
    const json = serializeDocument(doc);
    const restored = deserializeDocument(json);

    expect(restored).not.toBeNull();
    expect(restored!.canvas.width).toBe(1024);
    expect(restored!.canvas.height).toBe(768);
  });

  it("returns null for invalid JSON input", () => {
    expect(deserializeDocument(null)).toBeNull();
    expect(deserializeDocument(undefined)).toBeNull();
    expect(deserializeDocument("")).toBeNull();
    expect(deserializeDocument("{bad json")).toBeNull();
  });
});
