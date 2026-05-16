/**
 * @jest-environment jsdom
 */
import { getCanvasRasterBounds, setCanvasRasterBounds } from "../transform/geometry/layerGeometry";
import {
  compositeSelectionOverBase,
  prepareSelectionFreeTransformCanvases,
  transformSelectionMask
} from "../selection/selectionFreeTransform";
import { getSelectionBounds } from "../selection";
import type { Layer, Selection } from "../types";
import { makeAffineTransform } from "../types";

function createMask(
  width: number,
  height: number,
  fill: Array<[number, number]>
): Selection {
  const data = new Uint8ClampedArray(width * height);
  for (const [x, y] of fill) {
    data[y * width + x] = 255;
  }
  return { width, height, data, originX: 0, originY: 0 };
}

function getAlpha(canvas: HTMLCanvasElement, x: number, y: number): number {
  return canvas.getContext("2d")!.getImageData(x, y, 1, 1).data[3];
}

describe("selection free transform helpers", () => {
  it("isolates selected pixels and clears them from the base snapshot", () => {
    const snapshot = document.createElement("canvas");
    snapshot.width = 4;
    snapshot.height = 4;
    setCanvasRasterBounds(snapshot, { x: 0, y: 0, width: 4, height: 4 });
    const ctx = snapshot.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 4, 4);

    const selection = createMask(4, 4, [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2]
    ]);
    const layer = {
      id: "layer-1",
      name: "Layer 1",
      type: "raster",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      data: null,
      transform: makeAffineTransform({ x: 0, y: 0 }),
      contentBounds: { x: 0, y: 0, width: 4, height: 4 }
    } as Layer;

    const prepared = prepareSelectionFreeTransformCanvases({
      snapshot,
      layer,
      documentCanvasWidth: 4,
      documentCanvasHeight: 4,
      selection
    });

    expect(prepared).not.toBeNull();
    expect(prepared!.selectionCanvas.width).toBe(2);
    expect(prepared!.selectionCanvas.height).toBe(2);
    expect(getCanvasRasterBounds(prepared!.selectionCanvas)).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 2
    });
    expect(getAlpha(prepared!.selectionCanvas, 0, 0)).toBe(255);
    expect(getAlpha(prepared!.baseCanvas, 1, 1)).toBe(0);
    expect(getAlpha(prepared!.baseCanvas, 0, 0)).toBe(255);
  });

  it("translates the selection mask with the same transform used for selected pixels", () => {
    const selection = createMask(4, 4, [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2]
    ]);

    const transformed = transformSelectionMask(
      selection,
      { x: 1, y: 1, width: 2, height: 2 },
      { kind: "affine", x: 3, y: 2, scaleX: 1, scaleY: 1, rotation: 0 }
    );

    expect(getSelectionBounds(transformed)).toEqual({
      x: 4,
      y: 3,
      width: 2,
      height: 2
    });
  });

  it("composites transformed selection pixels onto the cleared base using union bounds", () => {
    const base = document.createElement("canvas");
    base.width = 4;
    base.height = 4;
    setCanvasRasterBounds(base, { x: 10, y: 10, width: 4, height: 4 });
    const baseCtx = base.getContext("2d")!;
    baseCtx.fillStyle = "#00ff00";
    baseCtx.fillRect(0, 0, 1, 1);

    const transformed = document.createElement("canvas");
    transformed.width = 2;
    transformed.height = 2;
    setCanvasRasterBounds(transformed, { x: 15, y: 12, width: 2, height: 2 });
    const transformedCtx = transformed.getContext("2d")!;
    transformedCtx.fillStyle = "#ff0000";
    transformedCtx.fillRect(0, 0, 2, 2);

    const result = compositeSelectionOverBase(base, transformed);
    expect(getCanvasRasterBounds(result)).toEqual({
      x: 10,
      y: 10,
      width: 7,
      height: 4
    });
    expect(getAlpha(result, 0, 0)).toBe(255);
    expect(getAlpha(result, 5, 2)).toBe(255);
  });
});
