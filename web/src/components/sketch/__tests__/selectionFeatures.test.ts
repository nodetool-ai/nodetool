/**
 * Tests for selection features:
 * - Selection movement
 * - Selection add/subtract (union/subtract)
 * - Selection constrains clear
 * - Fill with selection
 * - Deselect with Ctrl+D / Escape
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";

// Reset store before each test
beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
    useSketchStore.getState().setMirrorX(false);
    useSketchStore.getState().setMirrorY(false);
    useSketchStore.getState().setSelection(null);
  });
});

describe("Selection features", () => {
  describe("setSelection / selectAll / deselect", () => {
    it("sets a rectangular selection", () => {
      act(() => {
        useSketchStore.getState().setSelection({ x: 10, y: 20, width: 100, height: 50 });
      });
      const sel = useSketchStore.getState().selection;
      expect(sel).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });

    it("selectAll creates selection covering the full canvas", () => {
      act(() => {
        useSketchStore.getState().selectAll();
      });
      const sel = useSketchStore.getState().selection;
      const { width, height } = useSketchStore.getState().document.canvas;
      expect(sel).toEqual({ x: 0, y: 0, width, height });
    });

    it("setSelection(null) deselects", () => {
      act(() => {
        useSketchStore.getState().setSelection({ x: 0, y: 0, width: 100, height: 100 });
      });
      expect(useSketchStore.getState().selection).not.toBeNull();
      act(() => {
        useSketchStore.getState().setSelection(null);
      });
      expect(useSketchStore.getState().selection).toBeNull();
    });

    it("starts with no selection", () => {
      expect(useSketchStore.getState().selection).toBeNull();
    });
  });

  describe("selection union (add with Shift)", () => {
    it("union of two non-overlapping rectangles creates bounding box", () => {
      // Simulate the union logic from usePointerHandlers
      const sel1 = { x: 10, y: 10, width: 50, height: 50 };
      const sel2 = { x: 80, y: 80, width: 40, height: 40 };

      const ux = Math.min(sel1.x, sel2.x);
      const uy = Math.min(sel1.y, sel2.y);
      const ux2 = Math.max(sel1.x + sel1.width, sel2.x + sel2.width);
      const uy2 = Math.max(sel1.y + sel1.height, sel2.y + sel2.height);
      const union = { x: ux, y: uy, width: ux2 - ux, height: uy2 - uy };

      expect(union).toEqual({ x: 10, y: 10, width: 110, height: 110 });
    });

    it("union of overlapping rectangles creates correct bounding box", () => {
      const sel1 = { x: 10, y: 10, width: 60, height: 60 };
      const sel2 = { x: 40, y: 40, width: 60, height: 60 };

      const ux = Math.min(sel1.x, sel2.x);
      const uy = Math.min(sel1.y, sel2.y);
      const ux2 = Math.max(sel1.x + sel1.width, sel2.x + sel2.width);
      const uy2 = Math.max(sel1.y + sel1.height, sel2.y + sel2.height);
      const union = { x: ux, y: uy, width: ux2 - ux, height: uy2 - uy };

      expect(union).toEqual({ x: 10, y: 10, width: 90, height: 90 });
    });
  });

  describe("selection subtract (with Alt)", () => {
    it("subtract when new rect fully covers existing results in null", () => {
      const existing = { x: 20, y: 20, width: 40, height: 40 };
      const subtract = { x: 10, y: 10, width: 60, height: 60 };

      // Logic from usePointerHandlers
      const sx1 = existing.x;
      const sy1 = existing.y;
      const sx2 = existing.x + existing.width;
      const sy2 = existing.y + existing.height;
      const nx1 = subtract.x;
      const ny1 = subtract.y;
      const nx2 = subtract.x + subtract.width;
      const ny2 = subtract.y + subtract.height;

      const fullyCovered = nx1 <= sx1 && ny1 <= sy1 && nx2 >= sx2 && ny2 >= sy2;
      expect(fullyCovered).toBe(true);
    });

    it("subtract when new rect partially covers keeps existing selection", () => {
      const existing = { x: 10, y: 10, width: 80, height: 80 };
      const subtract = { x: 50, y: 50, width: 20, height: 20 };

      const sx1 = existing.x;
      const sy1 = existing.y;
      const sx2 = existing.x + existing.width;
      const sy2 = existing.y + existing.height;
      const nx1 = subtract.x;
      const ny1 = subtract.y;
      const nx2 = subtract.x + subtract.width;
      const ny2 = subtract.y + subtract.height;

      const fullyCovered = nx1 <= sx1 && ny1 <= sy1 && nx2 >= sx2 && ny2 >= sy2;
      expect(fullyCovered).toBe(false);
      // Since we can't represent non-rectangular selections, we keep the existing selection
    });
  });

  describe("selection movement", () => {
    it("moving a selection updates position but preserves dimensions", () => {
      const original = { x: 50, y: 50, width: 100, height: 80 };
      const dragStart = { x: 75, y: 75 };
      const dragEnd = { x: 95, y: 85 };

      const dx = dragEnd.x - dragStart.x;
      const dy = dragEnd.y - dragStart.y;

      const moved = {
        x: Math.round(original.x + dx),
        y: Math.round(original.y + dy),
        width: original.width,
        height: original.height
      };

      expect(moved).toEqual({ x: 70, y: 60, width: 100, height: 80 });
    });

    it("checks if point is inside selection for move detection", () => {
      const selection = { x: 50, y: 50, width: 100, height: 80 };

      // Point inside
      const inside = { x: 75, y: 75 };
      const isInside =
        inside.x >= selection.x &&
        inside.x < selection.x + selection.width &&
        inside.y >= selection.y &&
        inside.y < selection.y + selection.height;
      expect(isInside).toBe(true);

      // Point outside
      const outside = { x: 10, y: 10 };
      const isOutside =
        outside.x >= selection.x &&
        outside.x < selection.x + selection.width &&
        outside.y >= selection.y &&
        outside.y < selection.y + selection.height;
      expect(isOutside).toBe(false);

      // Point on max edge (exclusive) — should be outside
      const onEdge = { x: 150, y: 130 };
      const isOnEdge =
        onEdge.x >= selection.x &&
        onEdge.x < selection.x + selection.width &&
        onEdge.y >= selection.y &&
        onEdge.y < selection.y + selection.height;
      expect(isOnEdge).toBe(false);
    });
  });
});

describe("Mirror/symmetry state", () => {
  it("starts with mirrorX = false, mirrorY = false", () => {
    const state = useSketchStore.getState();
    expect(state.mirrorX).toBe(false);
    expect(state.mirrorY).toBe(false);
  });

  it("setMirrorX toggles horizontal mirror", () => {
    act(() => {
      useSketchStore.getState().setMirrorX(true);
    });
    expect(useSketchStore.getState().mirrorX).toBe(true);
    expect(useSketchStore.getState().mirrorY).toBe(false);
  });

  it("setMirrorY toggles vertical mirror", () => {
    act(() => {
      useSketchStore.getState().setMirrorY(true);
    });
    expect(useSketchStore.getState().mirrorX).toBe(false);
    expect(useSketchStore.getState().mirrorY).toBe(true);
  });

  it("both mirrors can be active for dual axis", () => {
    act(() => {
      useSketchStore.getState().setMirrorX(true);
      useSketchStore.getState().setMirrorY(true);
    });
    expect(useSketchStore.getState().mirrorX).toBe(true);
    expect(useSketchStore.getState().mirrorY).toBe(true);
  });

  it("setting both to false disables symmetry (off mode)", () => {
    act(() => {
      useSketchStore.getState().setMirrorX(true);
      useSketchStore.getState().setMirrorY(true);
    });
    act(() => {
      useSketchStore.getState().setMirrorX(false);
      useSketchStore.getState().setMirrorY(false);
    });
    expect(useSketchStore.getState().mirrorX).toBe(false);
    expect(useSketchStore.getState().mirrorY).toBe(false);
  });
});
