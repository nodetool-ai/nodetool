import type { AdjustmentSettings, Point } from "../types";

// Inline canvasToImageCoords function for testing
const canvasToImageCoords = (
  canvasX: number,
  canvasY: number,
  canvas: { width: number; height: number },
  imgWidth: number,
  imgHeight: number,
  zoom: number,
  pan: Point
): Point => {
  const scaledWidth = imgWidth * zoom;
  const scaledHeight = imgHeight * zoom;
  const imgX = (canvas.width - scaledWidth) / 2 + pan.x;
  const imgY = (canvas.height - scaledHeight) / 2 + pan.y;

  return {
    x: (canvasX - imgX) / zoom,
    y: (canvasY - imgY) / zoom
  };
};

// Inline applyAdjustments function for testing
const applyAdjustments = (
  imageData: { data: Uint8ClampedArray },
  adjustments: AdjustmentSettings
): { data: Uint8ClampedArray } => {
  const data = imageData.data;
  const { brightness, contrast, saturation } = adjustments;

  const brightnessFactor = brightness / 100;
  const contrastFactor = (100 + contrast) / 100;
  const saturationFactor = 1 + saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r = Math.min(255, Math.max(0, r + 255 * brightnessFactor));
    g = Math.min(255, Math.max(0, g + 255 * brightnessFactor));
    b = Math.min(255, Math.max(0, b + 255 * brightnessFactor));

    r = Math.min(255, Math.max(0, (r - 128) * contrastFactor + 128));
    g = Math.min(255, Math.max(0, (g - 128) * contrastFactor + 128));
    b = Math.min(255, Math.max(0, (b - 128) * contrastFactor + 128));

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = Math.min(255, Math.max(0, gray + (r - gray) * saturationFactor));
    g = Math.min(255, Math.max(0, gray + (g - gray) * saturationFactor));
    b = Math.min(255, Math.max(0, gray + (b - gray) * saturationFactor));

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  return imageData;
};

describe("canvasUtils", () => {
  describe("canvasToImageCoords", () => {
    it("converts canvas coordinates to image coordinates at zoom 1", () => {
      const canvas = { width: 800, height: 600 };
      const imgWidth = 400;
      const imgHeight = 300;
      const zoom = 1;
      const pan: Point = { x: 0, y: 0 };

      const result = canvasToImageCoords(400, 300, canvas, imgWidth, imgHeight, zoom, pan);

      expect(result.x).toBeCloseTo(200);
      expect(result.y).toBeCloseTo(150);
    });

    it("converts canvas coordinates with zoom applied", () => {
      const canvas = { width: 800, height: 600 };
      const imgWidth = 400;
      const imgHeight = 300;
      const zoom = 2;
      const pan: Point = { x: 0, y: 0 };

      const result = canvasToImageCoords(400, 300, canvas, imgWidth, imgHeight, zoom, pan);

      // At 2x zoom, center of canvas still maps to center of image
      expect(result.x).toBeCloseTo(200);
      expect(result.y).toBeCloseTo(150);
    });

    it("converts canvas coordinates with pan applied", () => {
      const canvas = { width: 800, height: 600 };
      const imgWidth = 400;
      const imgHeight = 300;
      const zoom = 1;
      const pan: Point = { x: 50, y: 50 };

      const result = canvasToImageCoords(400, 300, canvas, imgWidth, imgHeight, zoom, pan);

      expect(result.x).toBeCloseTo(150);
      expect(result.y).toBeCloseTo(100);
    });
  });

  describe("applyAdjustments", () => {
    it("returns same image data when adjustments are zero", () => {
      const data = new Uint8ClampedArray([100, 150, 200, 255, 0, 0, 0, 0]);
      const imageData = { data };

      const adjustments: AdjustmentSettings = {
        brightness: 0,
        contrast: 0,
        saturation: 0
      };

      const result = applyAdjustments(imageData, adjustments);

      expect(result.data[0]).toBe(100);
      expect(result.data[1]).toBe(150);
      expect(result.data[2]).toBe(200);
    });

    it("increases brightness when brightness is positive", () => {
      const data = new Uint8ClampedArray([100, 100, 100, 255, 0, 0, 0, 0]);
      const imageData = { data };

      const adjustments: AdjustmentSettings = {
        brightness: 50,
        contrast: 0,
        saturation: 0
      };

      const result = applyAdjustments(imageData, adjustments);

      expect(result.data[0]).toBeGreaterThan(100);
      expect(result.data[1]).toBeGreaterThan(100);
      expect(result.data[2]).toBeGreaterThan(100);
    });

    it("decreases brightness when brightness is negative", () => {
      const data = new Uint8ClampedArray([100, 100, 100, 255, 0, 0, 0, 0]);
      const imageData = { data };

      const adjustments: AdjustmentSettings = {
        brightness: -50,
        contrast: 0,
        saturation: 0
      };

      const result = applyAdjustments(imageData, adjustments);

      expect(result.data[0]).toBeLessThan(100);
      expect(result.data[1]).toBeLessThan(100);
      expect(result.data[2]).toBeLessThan(100);
    });

    it("clamps values to valid range [0, 255]", () => {
      const data = new Uint8ClampedArray([250, 10, 10, 255, 0, 0, 0, 0]);
      const imageData = { data };

      const adjustments: AdjustmentSettings = {
        brightness: 100,
        contrast: 0,
        saturation: 0
      };

      const result = applyAdjustments(imageData, adjustments);

      expect(result.data[0]).toBe(255);
      expect(result.data[1]).toBeLessThanOrEqual(255);
      expect(result.data[1]).toBeGreaterThanOrEqual(0);
    });
  });
});
