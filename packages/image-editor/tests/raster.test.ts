import { describe, expect, it } from "vitest";
import {
  adjustImage,
  combineSelections,
  ellipseSelection,
  fillRegion,
  hasSelectionPixels,
  pickPixel,
  polygonSelection,
  rectSelection,
  type RasterImageData
} from "../src/raster/index.js";

function solid(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255
): RasterImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width, height, data };
}

function at(
  image: RasterImageData,
  x: number,
  y: number
): [number, number, number, number] {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

describe("fillRegion", () => {
  it("flood-fills a connected region and leaves a separated patch", () => {
    const image = solid(8, 4, 255, 255, 255);
    // Isolated black pixel at (7, 0)
    image.data[7 * 4] = 0;
    image.data[7 * 4 + 1] = 0;
    image.data[7 * 4 + 2] = 0;
    fillRegion(image, 0, 0, { color: "#ff0000", tolerance: 0, contiguous: true });
    expect(at(image, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(at(image, 3, 2)).toEqual([255, 0, 0, 255]);
    expect(at(image, 7, 0)).toEqual([0, 0, 0, 255]);
  });

  it("replaces every matching pixel when contiguous is false", () => {
    const image = solid(4, 2, 255, 255, 255);
    image.data[7 * 4] = 0;
    image.data[7 * 4 + 1] = 0;
    image.data[7 * 4 + 2] = 0;
    fillRegion(image, 0, 0, {
      color: "#00ff00",
      tolerance: 0,
      contiguous: false
    });
    expect(at(image, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(at(image, 3, 1)).toEqual([0, 0, 0, 255]);
  });
});

describe("adjustImage", () => {
  it("raises brightness of a mid-grey pixel", () => {
    const image = solid(2, 2, 128, 128, 128);
    adjustImage(image, { brightness: 0.2 });
    expect(at(image, 0, 0)[0]).toBeGreaterThan(128);
  });

  it("desaturates a red pixel toward grey", () => {
    const image = solid(1, 1, 255, 0, 0);
    adjustImage(image, { saturation: -1 });
    const [r, g, b] = at(image, 0, 0);
    expect(Math.abs(r - g)).toBeLessThan(2);
    expect(Math.abs(g - b)).toBeLessThan(2);
  });
});

describe("pickPixel", () => {
  it("returns the hex and rgba of a pixel", () => {
    const image = solid(2, 2, 16, 32, 48);
    const sample = pickPixel(image, 1, 1);
    expect(sample.color).toBe("#102030");
    expect(sample.rgba).toEqual({ r: 16, g: 32, b: 48, a: 255 });
  });
});

describe("selection masks", () => {
  it("builds a rect and an ellipse that do not cover the same pixels", () => {
    const rect = rectSelection(16, 16, 0, 0, 8, 8);
    const ellipse = ellipseSelection(16, 16, 0, 0, 8, 8);
    expect(hasSelectionPixels(rect)).toBe(true);
    expect(hasSelectionPixels(ellipse)).toBe(true);
    expect(rect.data.length).toBeGreaterThan(ellipse.data.filter((v) => v).length);
  });

  it("builds a triangle polygon and combines with subtract", () => {
    const poly = polygonSelection(10, 10, [
      { x: 1, y: 1 },
      { x: 8, y: 1 },
      { x: 4, y: 8 }
    ]);
    expect(hasSelectionPixels(poly)).toBe(true);
    const cleared = combineSelections(poly, poly, "subtract");
    expect(hasSelectionPixels(cleared)).toBe(false);
  });
});
