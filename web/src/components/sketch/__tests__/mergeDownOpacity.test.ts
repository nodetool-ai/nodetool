/**
 * Merge Down keeps the lower layer's opacity and blend mode on the layer, so
 * the merged pixels must not carry them as well, or a 50% layer shows at 25%.
 */

import { act } from "@testing-library/react";
import { Canvas2DRuntime } from "../rendering/Canvas2DRuntime";
import { useSketchStore } from "../state/useSketchStore";
import { createDefaultDocument, createDefaultLayer } from "../types";

function alphaAt(canvas: HTMLCanvasElement, x: number, y: number): number {
  return canvas.getContext("2d")!.getImageData(x, y, 1, 1).data[3];
}

function fill(canvas: HTMLCanvasElement, x: number, width: number): void {
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(x, 0, width, canvas.height);
}

describe("merge down", () => {
  it("bakes the upper layer's opacity but not the lower layer's", () => {
    const doc = createDefaultDocument(8, 8);
    const lower = { ...doc.layers[0], opacity: 0.5 };
    const upper = { ...createDefaultLayer("Upper", "raster", 8, 8), opacity: 0.5 };
    doc.layers = [lower, upper];

    const runtime = new Canvas2DRuntime();
    // Lower covers the left half, upper the right half.
    fill(runtime.getOrCreateLayerCanvas(lower.id, 8, 8), 0, 4);
    fill(runtime.getOrCreateLayerCanvas(upper.id, 8, 8), 4, 4);

    runtime.mergeLayerDown(upper.id, lower.id, doc);
    const merged = runtime.getLayerCanvas(lower.id)!;

    // The survivor keeps opacity 0.5, which applies on display.
    expect(alphaAt(merged, 1, 1)).toBe(255);
    expect(alphaAt(merged, 6, 1)).toBeGreaterThan(120);
    expect(alphaAt(merged, 6, 1)).toBeLessThan(135);
    runtime.dispose();
  });

  it("keeps the survivor's opacity and drops the effects baked into it", () => {
    const lowerId = useSketchStore.getState().document.layers[0].id;
    act(() => {
      const store = useSketchStore.getState();
      store.addLayer("Upper");
      store.setLayerOpacity(lowerId, 0.5);
      useSketchStore.setState((s) => ({
        document: {
          ...s.document,
          layers: s.document.layers.map((l) =>
            l.id === lowerId
              ? {
                  ...l,
                  effects: [
                    { type: "exposure", enabled: true, params: { exposureStops: 1 } },
                    { type: "exposure", enabled: false, params: { exposureStops: 2 } }
                  ]
                }
              : l
          )
        }
      }));
    });
    const upperId = useSketchStore.getState().document.layers[1].id;

    act(() => {
      useSketchStore.getState().mergeLayerDown(upperId);
    });

    const survivor = useSketchStore.getState().document.layers[0];
    expect(survivor.opacity).toBe(0.5);
    expect(survivor.effects).toEqual([
      { type: "exposure", enabled: false, params: { exposureStops: 2 } }
    ]);
  });
});
