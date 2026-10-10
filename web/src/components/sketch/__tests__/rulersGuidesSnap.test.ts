/**
 * Rulers, guides and move snapping: the pure snap and ruler math, the guide
 * store actions, and snapping inside a real MoveTool drag.
 */

import type { Layer, LayerContentBounds } from "../types";
import { stub } from "../../../test-utils/doubles";
import {
  buildSnapTargets,
  snapMoveDelta,
  snapValue
} from "../snapping/moveSnap";
import { rulerTickSpacing, docToViewport, viewportToDoc } from "../guides/rulerMath";
import { useSketchStore } from "../state/useSketchStore";
import { createDefaultDocument } from "../types";
import { MoveTool } from "../tools/MoveTool";
import type { ToolContext, ToolPointerEvent } from "../tools/types";
import { makeToolContext } from "./_toolContextFixture";
import { aff, fxEnsureTransform } from "./_transformFixtures";

describe("snapMoveDelta", () => {
  const canvasTargets = buildSnapTargets({ width: 1000, height: 800 }, [], []);

  it("snaps the nearest edge to a canvas edge within the threshold", () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    // Left edge would land at 4 → snaps to 0.
    const r = snapMoveDelta(rect, -96, 0, canvasTargets, 6);
    expect(r.dx).toBe(-100);
    expect(r.snappedX).toBe(0);
    expect(r.snappedY).toBeNull();
  });

  it("snaps the rect center to the canvas center", () => {
    const rect = { x: 0, y: 0, width: 200, height: 100 };
    // The center lands at (497, 397) → snaps to the canvas center (500, 400).
    const r = snapMoveDelta(rect, 397, 347, canvasTargets, 6);
    expect(r.dx).toBe(400);
    expect(r.dy).toBe(350);
    expect(r.snappedX).toBe(500);
    expect(r.snappedY).toBe(400);
  });

  it("leaves the delta alone when nothing is close", () => {
    const rect = { x: 100, y: 100, width: 50, height: 50 };
    const r = snapMoveDelta(rect, 37, 41, canvasTargets, 6);
    expect(r).toEqual({ dx: 37, dy: 41, snappedX: null, snappedY: null });
  });

  it("snaps to guides and other layer edges", () => {
    const targets = buildSnapTargets(
      { width: 1000, height: 800 },
      [
        { id: "g1", orientation: "vertical", position: 333 },
        { id: "g2", orientation: "horizontal", position: 222 }
      ],
      [{ x: 600, y: 600, width: 100, height: 100 }]
    );
    const rect = { x: 0, y: 0, width: 50, height: 50 };
    const toGuide = snapMoveDelta(rect, 331, 220, targets, 6);
    expect(toGuide.snappedX).toBe(333);
    expect(toGuide.snappedY).toBe(222);
    // Right edge of rect (50 + dx) next to the other layer's left edge (600).
    const toLayer = snapMoveDelta(rect, 548, 0, targets, 6);
    expect(toLayer.dx).toBe(550);
    expect(toLayer.snappedX).toBe(600);
  });

  it("picks the closest target when several are within reach", () => {
    const targets = { x: [100, 104], y: [] };
    const r = snapMoveDelta({ x: 0, y: 0, width: 10, height: 10 }, 103, 0, targets, 6);
    expect(r.snappedX).toBe(104);
    expect(r.dx).toBe(104);
  });
});

describe("snapValue", () => {
  it("snaps to the nearest target within the threshold", () => {
    expect(snapValue(497, [0, 500, 1000], 6)).toBe(500);
    expect(snapValue(490, [0, 500, 1000], 6)).toBe(490);
  });
});

describe("ruler math", () => {
  it("chooses wider major ticks as the zoom drops", () => {
    expect(rulerTickSpacing(1).major).toBe(100);
    expect(rulerTickSpacing(0.25).major).toBe(250);
    expect(rulerTickSpacing(8).major).toBe(10);
    expect(rulerTickSpacing(56).major).toBe(1);
  });

  it("keeps minor ticks an integer fraction of the major step", () => {
    for (const zoom of [0.1, 0.33, 1, 2.7, 8, 56]) {
      const { major, minor } = rulerTickSpacing(zoom);
      expect(Number.isInteger(major / minor)).toBe(true);
      expect(minor * zoom).toBeGreaterThanOrEqual(5);
    }
  });

  it("maps document and viewport coordinates round-trip with the canvas pan/zoom model", () => {
    // Doc 1000 wide, viewport 800 wide, zoom 0.5, pan 30: doc center sits at 430.
    expect(docToViewport(500, 1000, 800, 0.5, 30)).toBe(430);
    expect(viewportToDoc(430, 1000, 800, 0.5, 30)).toBe(500);
    expect(viewportToDoc(docToViewport(123, 1000, 800, 2.5, -40), 1000, 800, 2.5, -40)).toBeCloseTo(123);
  });
});

describe("guide store actions", () => {
  beforeEach(() => {
    useSketchStore.getState().setDocument(createDefaultDocument(400, 300));
  });

  it("adds, moves, removes and clears guides with integer positions", () => {
    const store = useSketchStore.getState();
    const id = store.addGuide("vertical", 120.6);
    expect(useSketchStore.getState().document.guides).toEqual([
      { id, orientation: "vertical", position: 121 }
    ]);
    useSketchStore.getState().moveGuide(id, 40.2);
    expect(useSketchStore.getState().document.guides?.[0]?.position).toBe(40);
    const second = useSketchStore.getState().addGuide("horizontal", 10);
    useSketchStore.getState().removeGuide(id);
    expect(useSketchStore.getState().document.guides?.map((g) => g.id)).toEqual([second]);
    useSketchStore.getState().clearGuides();
    expect(useSketchStore.getState().document.guides).toEqual([]);
  });

  it("does not replace the document when a guide move changes nothing", () => {
    const id = useSketchStore.getState().addGuide("horizontal", 50);
    const before = useSketchStore.getState().document;
    useSketchStore.getState().moveGuide(id, 50.2);
    useSketchStore.getState().removeGuide("missing");
    expect(useSketchStore.getState().document).toBe(before);
  });

  it("records each guide edit as one undo step", () => {
    useSketchStore.getState().pushHistory("open", undefined, { timing: "before" });
    const id = useSketchStore.getState().addGuide("vertical", 120);
    useSketchStore.getState().moveGuide(id, 200);
    useSketchStore.getState().undo();
    expect(useSketchStore.getState().document.guides?.[0]?.position).toBe(120);
    useSketchStore.getState().undo();
    expect(useSketchStore.getState().document.guides).toEqual([]);
    useSketchStore.getState().redo();
    useSketchStore.getState().redo();
    expect(useSketchStore.getState().document.guides?.[0]?.position).toBe(200);
  });

  it("keeps guides across a setDocument normalization", () => {
    const doc = { ...createDefaultDocument(200, 200), guides: [{ id: "g", orientation: "vertical" as const, position: 5 }] };
    useSketchStore.getState().setDocument(doc);
    expect(useSketchStore.getState().document.guides).toEqual(doc.guides);
  });
});

// ─── MoveTool integration ────────────────────────────────────────────────────

function makeLayer(bounds: LayerContentBounds): Layer {
  return {
    id: "moving",
    name: "Moving",
    type: "raster",
    visible: true,
    opacity: 1,
    locked: false,
    blendMode: "normal",
    data: null,
    effects: [],
    transform: fxEnsureTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }),
    contentBounds: bounds
  } as unknown as Layer;
}

function makeCtx(layer: Layer, guides: ToolContext["doc"]["guides"] = []): ToolContext {
  const layerCanvasesRef = { current: new Map<string, HTMLCanvasElement>() };
  return makeToolContext({
    doc: stub<ToolContext["doc"]>({
      canvas: { width: 1000, height: 1000 },
      activeLayerId: layer.id,
      layers: [layer],
      guides,
      toolSettings: {} as ToolContext["doc"]["toolSettings"]
    }),
    activeTool: "move",
    layerCanvasesRef,
    getOrCreateLayerCanvas: jest.fn((layerId: string) => {
      const existing = layerCanvasesRef.current.get(layerId);
      if (existing) {
        return existing;
      }
      const canvas = window.document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 1000;
      layerCanvasesRef.current.set(layerId, canvas);
      return canvas;
    })
  });
}

function pointer(x: number, y: number, mods: Partial<Record<"ctrlKey" | "shiftKey", boolean>> = {}): ToolPointerEvent {
  return {
    point: { x, y },
    pressure: 0.5,
    nativeEvent: stub<React.PointerEvent>({
      clientX: 0,
      clientY: 0,
      ctrlKey: mods.ctrlKey ?? false,
      metaKey: false,
      altKey: false,
      shiftKey: mods.shiftKey ?? false,
      pointerId: 1,
      pointerType: "mouse"
    })
  };
}

describe("MoveTool snapping", () => {
  const initialSnap = useSketchStore.getState().snapEnabled;
  const initialGuides = useSketchStore.getState().guidesVisible;

  beforeEach(() => {
    useSketchStore.setState({
      snapEnabled: true,
      guidesVisible: true,
      activeTool: "move",
      document: createDefaultDocument(1000, 1000)
    });
  });

  afterAll(() => {
    useSketchStore.setState({ snapEnabled: initialSnap, guidesVisible: initialGuides });
  });

  function drag(
    ctx: ToolContext,
    from: { x: number; y: number },
    to: { x: number; y: number },
    mods: Partial<Record<"ctrlKey" | "shiftKey", boolean>> = {}
  ): { x: number; y: number } {
    const tool = new MoveTool();
    tool.onActivate!(ctx);
    tool.onDown!(ctx, pointer(from.x, from.y));
    tool.onMove!(ctx, pointer(to.x, to.y, mods), []);
    const current = aff(tool.getPreviewSession().state.currentTransform);
    tool.onUp!(ctx, pointer(to.x, to.y, mods));
    return { x: current.x, y: current.y };
  }

  it("snaps a dragged layer's edge onto a guide and commits the snapped position", () => {
    const layer = makeLayer({ x: 100, y: 100, width: 50, height: 50 });
    const ctx = makeCtx(layer, [{ id: "g", orientation: "vertical", position: 300 }]);
    // Left edge lands at 297 → snaps to the guide at 300.
    const result = drag(ctx, { x: 120, y: 120 }, { x: 317, y: 160 });
    expect(result.x).toBe(200);
    expect(result.y).toBe(40);
    const committed = (ctx.onLayerTransformChange as jest.Mock).mock.calls.at(-1)?.[1];
    expect(aff(committed).x).toBe(200);
  });

  it("does not snap while Ctrl is held on the Move tool", () => {
    const layer = makeLayer({ x: 100, y: 100, width: 50, height: 50 });
    const ctx = makeCtx(layer, [{ id: "g", orientation: "vertical", position: 300 }]);
    const result = drag(ctx, { x: 120, y: 120 }, { x: 317, y: 160 }, { ctrlKey: true });
    expect(result.x).toBe(197);
  });

  it("does not snap when snapping is off", () => {
    useSketchStore.setState({ snapEnabled: false });
    const layer = makeLayer({ x: 100, y: 100, width: 50, height: 50 });
    const ctx = makeCtx(layer, [{ id: "g", orientation: "vertical", position: 300 }]);
    expect(drag(ctx, { x: 120, y: 120 }, { x: 317, y: 160 }).x).toBe(197);
  });

  it("ignores hidden guides", () => {
    useSketchStore.setState({ guidesVisible: false });
    const layer = makeLayer({ x: 100, y: 100, width: 50, height: 50 });
    const ctx = makeCtx(layer, [{ id: "g", orientation: "vertical", position: 300 }]);
    expect(drag(ctx, { x: 120, y: 120 }, { x: 317, y: 160 }).x).toBe(197);
  });

  it("locks the move to the dominant axis with Shift", () => {
    const layer = makeLayer({ x: 100, y: 100, width: 50, height: 50 });
    const ctx = makeCtx(layer);
    const result = drag(ctx, { x: 120, y: 120 }, { x: 237, y: 131 }, { shiftKey: true });
    expect(result.x).toBe(117);
    expect(result.y).toBe(0);
  });
});
