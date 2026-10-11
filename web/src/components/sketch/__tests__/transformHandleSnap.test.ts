/**
 * Transform handle snapping: a flipped layer snaps the edge its handle drags,
 * and a proportional corner drag does not show lines its edges never reach.
 */

import { act } from "@testing-library/react";
import { stub } from "../../../test-utils/doubles";
import { useSketchStore } from "../state/useSketchStore";
import type { ToolPointerEvent } from "../tools";
import { TransformTool } from "../tools/TransformTool";
import { computeTransformedExtents } from "../transform/geometry/layerGeometry";
import { makeAffineTransform } from "../types";
import type { LayerTransform } from "../types";
import { makeToolContext } from "./_toolContextFixture";

function pointer(x: number, y: number, shiftKey = false): ToolPointerEvent {
  return {
    point: { x, y },
    pressure: 0.5,
    nativeEvent: stub<React.PointerEvent>({
      altKey: false,
      shiftKey,
      ctrlKey: false,
      metaKey: false,
      button: 0,
      clientX: x,
      clientY: y,
      pointerId: 1
    })
  };
}

beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
    useSketchStore.setState({ snapEnabled: true, activeSnapLines: null });
  });
});

function setup(transform: LayerTransform) {
  const ctx = makeToolContext({ activeTool: "transform" });
  const layer = ctx.doc.layers[0];
  layer.transform = transform;
  layer.contentBounds = { x: 0, y: 0, width: 20, height: 20 };
  const canvas = ctx.getOrCreateLayerCanvas(layer.id);
  canvas.width = 20;
  canvas.height = 20;
  const tool = new TransformTool();
  tool.onActivate?.(ctx);
  const last = (): LayerTransform => {
    const calls = (ctx.setLayerTransformPreview as jest.Mock).mock.calls;
    return calls[calls.length - 1][1];
  };
  const extents = () => computeTransformedExtents(last(), layer.contentBounds);
  return { ctx, tool, extents };
}

describe("TransformTool handle snapping", () => {
  it("snaps the dragged edge of a horizontally flipped layer", () => {
    const { ctx, tool, extents } = setup(makeAffineTransform({ x: 10, y: 10, scaleX: -1 }));
    const start = computeTransformedExtents(ctx.doc.layers[0].transform, ctx.doc.layers[0].contentBounds);
    const right = start.x + start.width;
    const midY = start.y + start.height / 2;
    tool.onDown(ctx, pointer(right, midY));
    tool.onMove(ctx, pointer(30, midY));
    const box = extents();
    expect(box.x + box.width).toBe(32);
    expect(useSketchStore.getState().activeSnapLines).toEqual({ x: 32, y: null });
  });

  it("shows no snap line for a proportional corner drag", () => {
    const { ctx, tool } = setup(makeAffineTransform({ x: 10, y: 10 }));
    const start = computeTransformedExtents(ctx.doc.layers[0].transform, ctx.doc.layers[0].contentBounds);
    tool.onDown(ctx, pointer(start.x + start.width, start.y + start.height));
    tool.onMove(ctx, pointer(31, 40));
    expect(useSketchStore.getState().activeSnapLines).toBeNull();
  });
});
