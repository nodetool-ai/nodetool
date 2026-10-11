/**
 * A layer image that finishes loading after the layer was cleared, restored
 * or deleted must not draw over it or bring it back.
 */

import { Canvas2DRuntime } from "../rendering/Canvas2DRuntime";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const BOUNDS = { x: 0, y: 0, width: 8, height: 8 };

class DeferredImage {
  static created: DeferredImage[] = [];
  onload: (() => void) | null = null;
  src = "";
  width = 8;
  height = 8;
  constructor() {
    DeferredImage.created.push(this);
  }
}

const RealImage = window.Image;

beforeEach(() => {
  DeferredImage.created = [];
  (window as unknown as { Image: unknown }).Image = DeferredImage;
});

afterEach(() => {
  window.Image = RealImage;
});

function finishLoads(): void {
  for (const img of DeferredImage.created) {
    img.onload?.();
  }
}

describe("Canvas2DRuntime pending image loads", () => {
  it("do not draw over a layer cleared since", () => {
    const runtime = new Canvas2DRuntime();
    runtime.setLayerData("a", PNG, BOUNDS);
    runtime.setLayerData("a", null, { x: 0, y: 0, width: 4, height: 4 });
    finishLoads();
    expect(runtime.getLayerCanvas("a")?.width).toBe(4);
  });

  it("do not draw over a canvas restored since", () => {
    const runtime = new Canvas2DRuntime();
    runtime.setLayerData("a", PNG, BOUNDS);
    const snapshot = document.createElement("canvas");
    snapshot.width = 3;
    snapshot.height = 3;
    runtime.restoreLayerCanvas("a", snapshot);
    finishLoads();
    expect(runtime.getLayerCanvas("a")?.width).toBe(3);
  });

  it("do not recreate a deleted layer", () => {
    const runtime = new Canvas2DRuntime();
    runtime.setLayerData("a", PNG, BOUNDS);
    runtime.deleteLayerCanvas("a");
    finishLoads();
    expect(runtime.getLayerCanvas("a")).toBeUndefined();
  });
});
