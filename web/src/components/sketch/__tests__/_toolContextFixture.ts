/**
 * Shared `ToolContext` fixture for the sketch tool suites.
 *
 * The fixture wires up every capability a suite might exercise rather than the
 * minimum each one needs, so a suite that starts driving the gizmo or reading
 * layer pixels does not have to fork the factory again.
 */

import { stub } from "../../../test-utils/doubles";
import type { ToolContext } from "../tools/types";
import { createDefaultDocument } from "../types";

const CANVAS_SIZE = 64;
const CONTAINER_WIDTH = 800;
const CONTAINER_HEIGHT = 600;

function makeContainer(): HTMLDivElement {
  const container = window.document.createElement("div");
  container.getBoundingClientRect = (): DOMRect =>
    new DOMRect(0, 0, CONTAINER_WIDTH, CONTAINER_HEIGHT);
  return container;
}

/** Invokes the callback, so the gizmo drawing code under test actually runs. */
function makeGizmoDrawer(): ToolContext["drawGizmo"] {
  return jest.fn((cb) => {
    const gc = stub<CanvasRenderingContext2D>({
      save: jest.fn(),
      restore: jest.fn(),
      translate: jest.fn(),
      rotate: jest.fn(),
      scale: jest.fn(),
      setTransform: jest.fn(),
      clearRect: jest.fn(),
      strokeRect: jest.fn(),
      fillRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      arc: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(),
      setLineDash: jest.fn(),
      set strokeStyle(_: string) {
        /* noop */
      },
      set fillStyle(_: string) {
        /* noop */
      },
      set lineWidth(_: number) {
        /* noop */
      },
      set lineDashOffset(_: number) {
        /* noop */
      }
    });
    cb(gc, 1, CONTAINER_WIDTH, CONTAINER_HEIGHT);
  });
}

/**
 * `getOrCreateLayerCanvas` is memoized through `layerCanvasesRef`, matching
 * production: pixels and raster-bounds tags written during a stroke are still
 * there when the stroke commits.
 */
export function makeToolContext(overrides?: Partial<ToolContext>): ToolContext {
  const doc = createDefaultDocument(CANVAS_SIZE, CANVAS_SIZE);
  const layerCanvases = new Map<string, HTMLCanvasElement>();
  const getOrCreateLayerCanvas = (layerId: string): HTMLCanvasElement => {
    const existing = layerCanvases.get(layerId);
    if (existing) {
      return existing;
    }
    const canvas = window.document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    layerCanvases.set(layerId, canvas);
    return canvas;
  };
  getOrCreateLayerCanvas(doc.layers[0].id);

  return {
    doc,
    activeTool: "brush",
    zoom: 1,
    pan: { x: 0, y: 0 },
    mirrorX: false,
    mirrorY: false,
    symmetryMode: "off",
    symmetryRays: 6,
    selection: null,
    displayCanvasRef: { current: null },
    overlayCanvasRef: { current: null },
    gizmoCanvasRef: { current: null },
    cursorCanvasRef: { current: null },
    containerRef: { current: makeContainer() },
    layerCanvasesRef: { current: layerCanvases },
    mousePositionRef: { current: { x: 0, y: 0 } },
    activeStrokeRef: { current: null },
    getOrCreateLayerCanvas: jest.fn(getOrCreateLayerCanvas),
    redraw: jest.fn(),
    redrawDirty: jest.fn(),
    requestRedraw: jest.fn(),
    requestDirtyRedraw: jest.fn(),
    clearOverlay: jest.fn(),
    drawSelectionOverlay: jest.fn(),
    drawOverlayShape: jest.fn(),
    drawOverlayGradient: jest.fn(),
    drawOverlayCrop: jest.fn(),
    drawOverlayLassoPreview: jest.fn(),
    drawOverlaySelection: jest.fn(),
    drawCursor: jest.fn(),
    clearGizmo: jest.fn(),
    drawGizmo: makeGizmoDrawer(),
    onZoomChange: jest.fn(),
    onPanChange: jest.fn(),
    onStrokeStart: jest.fn(),
    onStrokeEnd: jest.fn(),
    onLayerTransformChange: jest.fn(),
    setLayerTransformPreview: jest.fn(),
    clearLayerTransformPreview: jest.fn(),
    onLayerContentBoundsChange: jest.fn(),
    onBrushSizeChange: jest.fn(),
    onContextMenu: jest.fn(),
    onCropComplete: jest.fn(),
    onEyedropperPick: jest.fn(),
    onSelectionChange: jest.fn(),
    onAutoPickLayer: jest.fn(),
    screenToCanvas: jest.fn((x: number, y: number) => ({ x, y })),
    shiftHeldRef: { current: false },
    altHeldRef: { current: false },
    withMirror: jest.fn((ctx, drawFn, from, to) => {
      drawFn(from, to, ctx, 0);
    }),
    ...overrides
  };
}

// Every file under __tests__/ is a suite (see jest.config.ts `testRegex`).
describe("tool context fixture sanity", () => {
  it("returns a stable canvas per layer id", () => {
    const ctx = makeToolContext();
    const layerId = ctx.doc.layers[0].id;
    expect(ctx.getOrCreateLayerCanvas(layerId)).toBe(
      ctx.getOrCreateLayerCanvas(layerId)
    );
    expect(ctx.layerCanvasesRef.current.get(layerId)).toBeDefined();
  });

  it("reports an 800x600 container", () => {
    const rect = makeToolContext().containerRef.current?.getBoundingClientRect();
    expect(rect?.width).toBe(CONTAINER_WIDTH);
    expect(rect?.height).toBe(CONTAINER_HEIGHT);
  });
});
