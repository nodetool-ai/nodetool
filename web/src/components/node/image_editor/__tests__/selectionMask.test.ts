import {
  createMask,
  createFullMask,
  isMaskEmpty,
  combineMasks,
  invertMask,
  fillRect,
  fillEllipse,
  fillPolygon,
  magicWandSelect,
  blurMask,
  featherMask,
  smoothMaskBorders,
  selectAll
} from "../selectionMask";

describe("selectionMask", () => {
  describe("createMask", () => {
    it("creates an all-zero mask of the given dimensions", () => {
      const mask = createMask(10, 5);
      expect(mask.length).toBe(50);
      expect(mask.every((v) => v === 0)).toBe(true);
    });
  });

  describe("createFullMask", () => {
    it("creates an all-255 mask", () => {
      const mask = createFullMask(4, 3);
      expect(mask.length).toBe(12);
      expect(mask.every((v) => v === 255)).toBe(true);
    });
  });

  describe("isMaskEmpty", () => {
    it("returns true for an empty mask", () => {
      expect(isMaskEmpty(createMask(4, 4))).toBe(true);
    });

    it("returns false for a non-empty mask", () => {
      const mask = createMask(4, 4);
      mask[5] = 1;
      expect(isMaskEmpty(mask)).toBe(false);
    });
  });

  describe("combineMasks", () => {
    it("replaces existing with incoming when mode is replace", () => {
      const existing = new Uint8Array([100, 200, 50, 0]);
      const incoming = new Uint8Array([0, 0, 255, 255]);
      const result = combineMasks(existing, incoming, "replace");
      expect(Array.from(result)).toEqual([0, 0, 255, 255]);
    });

    it("adds masks clamped at 255 when mode is add", () => {
      const existing = new Uint8Array([100, 200, 50, 0]);
      const incoming = new Uint8Array([200, 100, 100, 0]);
      const result = combineMasks(existing, incoming, "add");
      expect(result[0]).toBe(255); // 100+200 clamped
      expect(result[1]).toBe(255); // 200+100 clamped
      expect(result[2]).toBe(150);
      expect(result[3]).toBe(0);
    });

    it("subtracts masks clamped at 0 when mode is subtract", () => {
      const existing = new Uint8Array([100, 200, 50, 0]);
      const incoming = new Uint8Array([200, 100, 100, 0]);
      const result = combineMasks(existing, incoming, "subtract");
      expect(result[0]).toBe(0); // 100-200 clamped
      expect(result[1]).toBe(100);
      expect(result[2]).toBe(0); // 50-100 clamped
      expect(result[3]).toBe(0);
    });

    it("takes min of both masks when mode is intersect", () => {
      const existing = new Uint8Array([100, 200, 50, 0]);
      const incoming = new Uint8Array([200, 100, 100, 255]);
      const result = combineMasks(existing, incoming, "intersect");
      expect(Array.from(result)).toEqual([100, 100, 50, 0]);
    });
  });

  describe("invertMask", () => {
    it("inverts every value", () => {
      const mask = new Uint8Array([0, 255, 100, 128]);
      const result = invertMask(mask);
      expect(Array.from(result)).toEqual([255, 0, 155, 127]);
    });
  });

  describe("fillRect", () => {
    it("fills a rectangle region on the mask", () => {
      const mask = fillRect(10, 10, 2, 3, 5, 6);
      // Check inside
      expect(mask[3 * 10 + 2]).toBe(255);
      expect(mask[6 * 10 + 5]).toBe(255);
      // Check outside
      expect(mask[0]).toBe(0);
      expect(mask[7 * 10 + 5]).toBe(0);
    });

    it("handles inverted coordinates", () => {
      const mask = fillRect(10, 10, 5, 6, 2, 3);
      expect(mask[3 * 10 + 2]).toBe(255);
      expect(mask[6 * 10 + 5]).toBe(255);
    });
  });

  describe("fillEllipse", () => {
    it("fills an ellipse region", () => {
      const mask = fillEllipse(20, 20, 5, 5, 15, 15);
      // Center should be selected
      expect(mask[10 * 20 + 10]).toBe(255);
      // Corner should not be selected
      expect(mask[0]).toBe(0);
      expect(mask[19 * 20 + 19]).toBe(0);
    });

    it("returns empty mask for zero-radius ellipse", () => {
      const mask = fillEllipse(10, 10, 5, 5, 5, 5);
      expect(isMaskEmpty(mask)).toBe(true);
    });
  });

  describe("fillPolygon", () => {
    it("fills a triangle", () => {
      const points = [
        { x: 5, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ];
      const mask = fillPolygon(11, 11, points);
      // Center of triangle should be selected
      expect(mask[7 * 11 + 5]).toBe(255);
      // Far outside should not be selected
      expect(mask[0]).toBe(0);
    });

    it("returns empty mask for fewer than 3 points", () => {
      const mask = fillPolygon(10, 10, [{ x: 0, y: 0 }, { x: 5, y: 5 }]);
      expect(isMaskEmpty(mask)).toBe(true);
    });
  });

  describe("magicWandSelect", () => {
    it("selects contiguous pixels of similar colour", () => {
      // Create a 5x5 uniform red image
      const w = 5;
      const h = 5;
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        data[i * 4] = 200;     // R
        data[i * 4 + 1] = 0;   // G
        data[i * 4 + 2] = 0;   // B
        data[i * 4 + 3] = 255; // A
      }
      // Make one pixel different
      data[12 * 4] = 0;      // pixel (2,2) is black-ish
      data[12 * 4 + 1] = 0;
      data[12 * 4 + 2] = 0;

      const imageData = { data, width: w, height: h } as unknown as ImageData;
      const mask = magicWandSelect(imageData, 0, 0, 32);

      // (0,0) should be selected since it's the seed
      expect(mask[0]).toBe(255);
      // (2,2) should NOT be selected (different colour)
      expect(mask[12]).toBe(0);
    });

    it("returns empty for out-of-bounds seed", () => {
      const data = new Uint8ClampedArray(16);
      const imageData = { data, width: 2, height: 2 } as unknown as ImageData;
      const mask = magicWandSelect(imageData, -1, 0, 32);
      expect(isMaskEmpty(mask)).toBe(true);
    });
  });

  describe("blurMask", () => {
    it("returns a copy for radius 0", () => {
      const mask = new Uint8Array([0, 255, 0, 255]);
      const result = blurMask(mask, 2, 2, 0);
      expect(Array.from(result)).toEqual([0, 255, 0, 255]);
    });

    it("blurs a single bright pixel", () => {
      // 5x5 mask with center pixel set
      const mask = createMask(5, 5);
      mask[12] = 255; // center
      const result = blurMask(mask, 5, 5, 1);
      // The center should be less than 255 after blur
      expect(result[12]).toBeLessThan(255);
      // Neighbours should be > 0
      expect(result[11]).toBeGreaterThan(0); // left
      expect(result[13]).toBeGreaterThan(0); // right
      expect(result[7]).toBeGreaterThan(0);  // top
      expect(result[17]).toBeGreaterThan(0); // bottom
    });
  });

  describe("featherMask", () => {
    it("is equivalent to blurMask", () => {
      const mask = createMask(5, 5);
      mask[12] = 255;
      const feathered = featherMask(mask, 5, 5, 1);
      const blurred = blurMask(mask, 5, 5, 1);
      expect(Array.from(feathered)).toEqual(Array.from(blurred));
    });
  });

  describe("smoothMaskBorders", () => {
    it("re-thresholds the blurred mask to hard edges", () => {
      const mask = createMask(5, 5);
      mask[12] = 255;
      const smoothed = smoothMaskBorders(mask, 5, 5, 1);
      // Every value should be 0 or 255
      for (let i = 0; i < smoothed.length; i++) {
        expect(smoothed[i] === 0 || smoothed[i] === 255).toBe(true);
      }
    });

    it("returns a copy for radius 0", () => {
      const mask = new Uint8Array([0, 255, 128, 0]);
      const result = smoothMaskBorders(mask, 2, 2, 0);
      expect(Array.from(result)).toEqual([0, 255, 128, 0]);
    });
  });

  describe("selectAll", () => {
    it("creates a fully-selected mask", () => {
      const mask = selectAll(3, 3);
      expect(mask.length).toBe(9);
      expect(mask.every((v) => v === 255)).toBe(true);
    });
  });
});
