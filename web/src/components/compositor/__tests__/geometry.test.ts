import {
  applyMove,
  applyScale,
  canvasToLayerTexel,
  layerCorners,
  layerTexelToCanvas,
  pointInLayer
} from "../geometry";
import type { LayerTransform2D } from "../types";

const W = 80;
const H = 40;

describe("compositor gizmo geometry", () => {
  it("layerTexelToCanvas and canvasToLayerTexel are inverses", () => {
    const t: LayerTransform2D = {
      x: 200,
      y: 120,
      scaleX: 1.5,
      scaleY: 0.8,
      rotation: 0.6
    };
    for (const [lx, ly] of [
      [0, 0],
      [W, 0],
      [W, H],
      [40, 20]
    ]) {
      const c = layerTexelToCanvas(t, W, H, lx, ly);
      const back = canvasToLayerTexel(t, W, H, c.x, c.y);
      expect(back.x).toBeCloseTo(lx, 4);
      expect(back.y).toBeCloseTo(ly, 4);
    }
  });

  it("default placement puts the top-left corner at the origin", () => {
    const t: LayerTransform2D = {
      x: W / 2,
      y: H / 2,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    const [tl, tr, br, bl] = layerCorners(t, W, H);
    expect(tl.x).toBeCloseTo(0);
    expect(tl.y).toBeCloseTo(0);
    expect(tr.x).toBeCloseTo(W);
    expect(br.y).toBeCloseTo(H);
    expect(bl.x).toBeCloseTo(0);
  });

  it("pointInLayer respects the placed (translated) quad", () => {
    const t: LayerTransform2D = {
      x: 300,
      y: 300,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    expect(pointInLayer(t, W, H, { x: 300, y: 300 })).toBe(true); // center
    expect(pointInLayer(t, W, H, { x: 0, y: 0 })).toBe(false); // far away
  });

  it("applyMove shifts the center", () => {
    const t: LayerTransform2D = {
      x: 10,
      y: 20,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    expect(applyMove(t, 5, -7)).toMatchObject({ x: 15, y: 13 });
  });

  it("dragging a corner handle scales about the center", () => {
    const t: LayerTransform2D = {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
    // Pull the bottom-right corner to twice its half-extent.
    const next = applyScale(t, W, H, "br", { x: W, y: H }, false);
    expect(next.scaleX).toBeCloseTo(2);
    expect(next.scaleY).toBeCloseTo(2);
  });
});
