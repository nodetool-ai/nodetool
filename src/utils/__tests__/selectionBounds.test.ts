import { getSelectionRect, SelectionRect } from "../selectionBounds";
import { XYPosition } from "@xyflow/react";

describe("selectionBounds utilities", () => {
  describe("getSelectionRect", () => {
    it("returns null for null start position", () => {
      const end: XYPosition = { x: 100, y: 100 };
      const result = getSelectionRect(null, end);
      expect(result).toBeNull();
    });

    it("returns null for null end position", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const result = getSelectionRect(start, null);
      expect(result).toBeNull();
    });

    it("returns null for both null positions", () => {
      const result = getSelectionRect(null, null);
      expect(result).toBeNull();
    });

    it("returns null for selection smaller than minimum size", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 2, y: 2 }; // width=2, height=2 < MIN_SELECTION_SIZE(4)
      const result = getSelectionRect(start, end);
      expect(result).toBeNull();
    });

    it("returns valid rect for larger selection", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 100, y: 100 };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    });

    it("handles reverse order (end before start)", () => {
      const start: XYPosition = { x: 100, y: 100 };
      const end: XYPosition = { x: 0, y: 0 };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    });

    it("handles negative coordinates", () => {
      const start: XYPosition = { x: -100, y: -100 };
      const end: XYPosition = { x: 0, y: 0 };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result).toEqual({ x: -100, y: -100, width: 100, height: 100 });
    });

    it("handles large coordinates", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 1000000, y: 1000000 };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result).toEqual({ x: 0, y: 0, width: 1000000, height: 1000000 });
    });

    it("uses custom minimum size when provided", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 10, y: 10 };
      const result = getSelectionRect(start, end, 20); // custom min size of 20
      expect(result).toBeNull();
    });

    it("returns null for zero-width selection", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 0, y: 100 };
      const result = getSelectionRect(start, end);
      expect(result).toBeNull();
    });

    it("returns null for zero-height selection", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 100, y: 0 };
      const result = getSelectionRect(start, end);
      expect(result).toBeNull();
    });

    it("returns exact minimum size selection", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 4, y: 4 }; // exactly MIN_SELECTION_SIZE
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result).toEqual({ x: 0, y: 0, width: 4, height: 4 });
    });

    it("correctly calculates width and height with swapped coordinates", () => {
      const start: XYPosition = { x: 200, y: 300 };
      const end: XYPosition = { x: 50, y: 100 };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result).toEqual({ x: 50, y: 100, width: 150, height: 200 });
    });
  });
});
