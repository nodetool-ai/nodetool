import {
  MAX_MEDIA_RATIO,
  MIN_MEDIA_RATIO,
  clampedMediaRatio,
  fitNodeHeight,
  mediaDimensionsFromRef
} from "../mediaNodeFit";

const box = { sidePad: 0, chrome: 40 };

const fitFromRef = (ref: unknown, nodeWidth: number): number => {
  const dims = mediaDimensionsFromRef(ref);
  if (!dims) {
    throw new Error("no dimensions");
  }
  const ratio = clampedMediaRatio(dims);
  if (ratio === null) {
    throw new Error("no ratio");
  }
  return fitNodeHeight(nodeWidth, ratio, box, 0);
};

describe("mediaNodeFit", () => {
  it("makes a 9:16 image a portrait media box from asset metadata", () => {
    const ref = { type: "image", uri: "x", metadata: { width: 1080, height: 1920 } };
    const height = fitFromRef(ref, 270);
    expect(height - box.chrome).toBe(480);
  });

  it("makes a 4:3 image a 4:3 media box from ref dimensions", () => {
    const ref = { type: "image", uri: "x", width: 800, height: 600 };
    const height = fitFromRef(ref, 300);
    expect(height - box.chrome).toBe(225);
  });

  it("keeps the node width and subtracts the side padding", () => {
    expect(fitNodeHeight(320, 4 / 3, { sidePad: 20, chrome: 40 }, 0)).toBe(265);
  });

  it("clamps extreme ratios", () => {
    expect(clampedMediaRatio({ width: 100, height: 10000 })).toBe(MIN_MEDIA_RATIO);
    expect(clampedMediaRatio({ width: 10000, height: 10 })).toBe(MAX_MEDIA_RATIO);
  });

  it("returns null for missing or invalid dimensions", () => {
    expect(mediaDimensionsFromRef({ type: "image", uri: "x" })).toBeNull();
    expect(mediaDimensionsFromRef(null)).toBeNull();
    expect(clampedMediaRatio({ width: 0, height: 10 })).toBeNull();
  });

  it("respects the minimum height", () => {
    expect(fitNodeHeight(300, 3, box, 200)).toBe(200);
  });
});
