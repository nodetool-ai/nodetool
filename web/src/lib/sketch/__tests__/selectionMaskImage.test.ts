/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import { selectionToMaskDataUrl } from "../selectionMaskImage";

const makeSelection = (
  width: number,
  height: number,
  fill: number,
  originX = 0,
  originY = 0
) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height).fill(fill),
  originX,
  originY
});

describe("selectionToMaskDataUrl", () => {
  it("returns a data URL for a non-empty selection", () => {
    const url = selectionToMaskDataUrl(makeSelection(2, 2, 200), 4, 4);
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null when the selection has no active pixels", () => {
    const url = selectionToMaskDataUrl(makeSelection(2, 2, 0), 4, 4);
    expect(url).toBeNull();
  });

  it("returns null when canvas dimensions are degenerate", () => {
    expect(selectionToMaskDataUrl(makeSelection(2, 2, 200), 0, 0)).toBeNull();
  });

  it("clips selection cells outside the canvas without throwing", () => {
    // selection origin pushes most cells off-canvas
    const url = selectionToMaskDataUrl(
      makeSelection(4, 4, 200, -3, -3),
      2,
      2
    );
    // Only the (3,3) cell of the selection lands at (0,0) of the canvas.
    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});
