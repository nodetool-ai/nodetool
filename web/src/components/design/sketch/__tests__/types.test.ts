/**
 * Tests for Sketch file format integration
 */

import {
  hexToSketchColor,
  sketchColorToHex,
  generateSketchUUID,
  formatPointString,
  parsePointString
} from "../types";

describe("Sketch types utilities", () => {
  describe("hexToSketchColor", () => {
    it("converts hex color to Sketch RGBA", () => {
      const result = hexToSketchColor("#ff0000");
      expect(result.red).toBeCloseTo(1);
      expect(result.green).toBeCloseTo(0);
      expect(result.blue).toBeCloseTo(0);
      expect(result.alpha).toBeCloseTo(1);
    });

    it("handles short hex format", () => {
      const result = hexToSketchColor("#fff");
      expect(result.red).toBeCloseTo(1);
      expect(result.green).toBeCloseTo(1);
      expect(result.blue).toBeCloseTo(1);
    });

    it("handles hex without #", () => {
      const result = hexToSketchColor("00ff00");
      expect(result.green).toBeCloseTo(1);
      expect(result.red).toBeCloseTo(0);
      expect(result.blue).toBeCloseTo(0);
    });

    it("handles hex with alpha", () => {
      const result = hexToSketchColor("#ff000080");
      expect(result.red).toBeCloseTo(1);
      expect(result.alpha).toBeCloseTo(0.5, 1);
    });
  });

  describe("sketchColorToHex", () => {
    it("converts Sketch RGBA to hex", () => {
      const result = sketchColorToHex({ red: 1, green: 0, blue: 0, alpha: 1 });
      expect(result).toBe("#ff0000");
    });

    it("handles intermediate values", () => {
      const result = sketchColorToHex({
        red: 0.5,
        green: 0.5,
        blue: 0.5,
        alpha: 1
      });
      expect(result).toBe("#808080");
    });
  });

  describe("generateSketchUUID", () => {
    it("generates a valid UUID format", () => {
      const uuid = generateSketchUUID();
      expect(uuid).toMatch(
        /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i
      );
    });

    it("generates unique UUIDs", () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateSketchUUID());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe("formatPointString", () => {
    it("formats point as Sketch PointString", () => {
      expect(formatPointString(100, 200)).toBe("{100, 200}");
    });

    it("handles decimal values", () => {
      expect(formatPointString(1.5, 2.5)).toBe("{1.5, 2.5}");
    });
  });

  describe("parsePointString", () => {
    it("parses Sketch PointString format", () => {
      const result = parsePointString("{100, 200}");
      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
    });

    it("handles decimal values", () => {
      const result = parsePointString("{1.5, 2.5}");
      expect(result.x).toBeCloseTo(1.5);
      expect(result.y).toBeCloseTo(2.5);
    });

    it("handles invalid format gracefully", () => {
      const result = parsePointString("invalid");
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });
  });
});
