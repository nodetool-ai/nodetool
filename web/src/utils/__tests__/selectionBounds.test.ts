import type { XYPosition } from "@xyflow/react";
import { getSelectionRect } from "../selectionBounds";

describe("selectionBounds", () => {
  describe("getSelectionRect", () => {
    const MIN_SELECTION_SIZE = 4;

    it("returns null when start is null", () => {
      const end: XYPosition = { x: 100, y: 100 };
      expect(getSelectionRect(null, end)).toBeNull();
    });

    it("returns null when end is null", () => {
      const start: XYPosition = { x: 0, y: 0 };
      expect(getSelectionRect(start, null)).toBeNull();
    });

    it("returns null when both are null", () => {
      expect(getSelectionRect(null, null)).toBeNull();
    });

    it("returns null when width is less than minSize", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 2, y: 100 };
      expect(getSelectionRect(start, end)).toBeNull();
    });

    it("returns null when height is less than minSize", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 100, y: 2 };
      expect(getSelectionRect(start, end)).toBeNull();
    });

    it("returns null when both dimensions are less than minSize", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 2, y: 2 };
      expect(getSelectionRect(start, end)).toBeNull();
    });

    it("returns rect when width equals minSize", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: MIN_SELECTION_SIZE, y: 100 };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result?.width).toBe(MIN_SELECTION_SIZE);
    });

    it("returns rect when height equals minSize", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 100, y: MIN_SELECTION_SIZE };
      const result = getSelectionRect(start, end);
      expect(result).not.toBeNull();
      expect(result?.height).toBe(MIN_SELECTION_SIZE);
    });

    it("returns correct rect when start is top-left", () => {
      const start: XYPosition = { x: 10, y: 20 };
      const end: XYPosition = { x: 110, y: 120 };
      const result = getSelectionRect(start, end);
      expect(result).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 100,
      });
    });

    it("returns correct rect when start is bottom-right", () => {
      const start: XYPosition = { x: 110, y: 120 };
      const end: XYPosition = { x: 10, y: 20 };
      const result = getSelectionRect(start, end);
      expect(result).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 100,
      });
    });

    it("returns correct rect with custom minSize", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 5, y: 5 };
      const result = getSelectionRect(start, end, 10);
      expect(result).toBeNull();
    });

    it("returns correct rect with custom minSize when valid", () => {
      const start: XYPosition = { x: 0, y: 0 };
      const end: XYPosition = { x: 10, y: 10 };
      const result = getSelectionRect(start, end, 10);
      expect(result).toEqual({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
    });

    it("handles negative coordinates correctly", () => {
      const start: XYPosition = { x: -100, y: -100 };
      const end: XYPosition = { x: 0, y: 0 };
      const result = getSelectionRect(start, end);
      expect(result).toEqual({
        x: -100,
        y: -100,
        width: 100,
        height: 100,
      });
    });

    it("handles large coordinates correctly", () => {
      const start: XYPosition = { x: 1000000, y: 1000000 };
      const end: XYPosition = { x: 1000100, y: 1000100 };
      const result = getSelectionRect(start, end);
      expect(result).toEqual({
        x: 1000000,
        y: 1000000,
        width: 100,
        height: 100,
      });
    });

    it("handles zero-width selection correctly", () => {
      const start: XYPosition = { x: 50, y: 0 };
      const end: XYPosition = { x: 50, y: 100 };
      expect(getSelectionRect(start, end)).toBeNull();
    });

    it("handles zero-height selection correctly", () => {
      const start: XYPosition = { x: 0, y: 50 };
      const end: XYPosition = { x: 100, y: 50 };
      expect(getSelectionRect(start, end)).toBeNull();
    });
  });
});
