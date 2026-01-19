import { getSelectionRect } from "../selectionBounds";
import { XYPosition } from "@xyflow/react";

describe("selectionBounds", () => {
  describe("getSelectionRect", () => {
    it("returns null when start is null", () => {
      const end: XYPosition = { x: 100, y: 100 };
      const result = getSelectionRect(null, end);
      expect(result).toBeNull();
    });

    it("returns null when end is null", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const result = getSelectionRect(start, null);
      expect(result).toBeNull();
    });

    it("returns null when both are null", () => {
      const result = getSelectionRect(null, null);
      expect(result).toBeNull();
    });

    it("returns null when selection is too small horizontally", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 2, y: 100 };
      const result = getSelectionRect(start, end, 4);
      expect(result).toBeNull();
    });

    it("returns null when selection is too small vertically", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 100, y: 2 };
      const result = getSelectionRect(start, end, 4);
      expect(result).toBeNull();
    });

    it("returns null when selection is too small in both dimensions", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 2, y: 2 };
      const result = getSelectionRect(start, end, 4);
      expect(result).toBeNull();
    });

    it("returns rect with correct dimensions for normal selection", () => {
      const start: XYPosition = { x: 10, y: 20 };
      const end: XYPosition = { x: 110, y: 120 };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(10);
      expect(result!.y).toBe(20);
      expect(result!.width).toBe(100);
      expect(result!.height).toBe(100);
    });

    it("handles start after end (negative dimensions)", () => {
      const start: XYPosition = { x: 110, y: 120 };
      const end: XYPosition = { x: 10, y: 20 };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(10);
      expect(result!.y).toBe(20);
      expect(result!.width).toBe(100);
      expect(result!.height).toBe(100);
    });

    it("handles start with larger x but smaller y", () => {
      const start: XYPosition = { x: 110, y: 20 };
      const end: XYPosition = { x: 10, y: 120 };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(10);
      expect(result!.y).toBe(20);
      expect(result!.width).toBe(100);
      expect(result!.height).toBe(100);
    });

    it("handles start with smaller x but larger y", () => {
      const start: XYPosition = { x: 10, y: 120 };
      const end: XYPosition = { x: 110, y: 20 };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(10);
      expect(result!.y).toBe(20);
      expect(result!.width).toBe(100);
      expect(result!.height).toBe(100);
    });

    it("returns exact size when selection equals minSize", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 4, y: 4 };
      const result = getSelectionRect(start, end, 4);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(0);
      expect(result!.y).toBe(0);
      expect(result!.width).toBe(4);
      expect(result!.height).toBe(4);
    });

    it("uses custom minSize parameter", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 5, y: 5 };
      const result = getSelectionRect(start, end, 10);
      expect(result).toBeNull();
    });

    it("handles zero-width selection", () => {
      const start: XYPosition = { x: 50, y: 0 };
      const end: XYPosition = { x: 50, y: 100 };
      const result = getSelectionRect(start, end, 4);
      expect(result).toBeNull();
    });

    it("handles zero-height selection", () => {
      const start: XYPosition = { x: 0, y: 50 };
      const end: XYPosition = { x: 100, y: 50 };
      const result = getSelectionRect(start, end, 4);
      expect(result).toBeNull();
    });

    it("handles negative coordinates", () => {
      const start: XYPosition = { x: -100, y: -100 };
      const end: XYPosition = { x: 100, y: 100 };
      const result = getSelectionRect(start, end, 4);
      expect(result).not.toBeNull();
      expect(result!.x).toBe(-100);
      expect(result!.y).toBe(-100);
      expect(result!.width).toBe(200);
      expect(result!.height).toBe(200);
    });
  });
});
