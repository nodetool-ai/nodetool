import { XYPosition } from "@xyflow/react";
import { getSelectionRect, SelectionRect } from "../selectionBounds";

describe("selectionBounds", () => {
  describe("getSelectionRect", () => {
    describe("Basic Functionality", () => {
      it("should return selection rect for valid positions", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 100, y: 100 };
        const result = getSelectionRect(start, end);
        expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 });
      });

      it("should handle reversed positions", () => {
        const start: XYPosition = { x: 100, y: 100 };
        const end: XYPosition = { x: 0, y: 0 };
        const result = getSelectionRect(start, end);
        expect(result).toEqual({ x: 0, y: 0, width: 100, height: 100 });
      });

      it("should handle negative coordinates", () => {
        const start: XYPosition = { x: -100, y: -100 };
        const end: XYPosition = { x: 100, y: 100 };
        const result = getSelectionRect(start, end);
        expect(result).toEqual({ x: -100, y: -100, width: 200, height: 200 });
      });

      it("should handle partial negative coordinates", () => {
        const start: XYPosition = { x: -50, y: -50 };
        const end: XYPosition = { x: 50, y: 50 };
        const result = getSelectionRect(start, end);
        expect(result).toEqual({ x: -50, y: -50, width: 100, height: 100 });
      });
    });

    describe("Edge Cases", () => {
      it("should return null when start is null", () => {
        const end: XYPosition = { x: 100, y: 100 };
        const result = getSelectionRect(null, end);
        expect(result).toBeNull();
      });

      it("should return null when end is null", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const result = getSelectionRect(start, null);
        expect(result).toBeNull();
      });

      it("should return null when both are null", () => {
        const result = getSelectionRect(null, null);
        expect(result).toBeNull();
      });

      it("should return null for zero width selection", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 0, y: 100 };
        const result = getSelectionRect(start, end);
        expect(result).toBeNull();
      });

      it("should return null for zero height selection", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 100, y: 0 };
        const result = getSelectionRect(start, end);
        expect(result).toBeNull();
      });

      it("should return null for very small selection", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 2, y: 2 };
        const result = getSelectionRect(start, end);
        expect(result).toBeNull();
      });

      it("should return null for small width", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 3, y: 100 };
        const result = getSelectionRect(start, end);
        expect(result).toBeNull();
      });

      it("should return null for small height", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 100, y: 3 };
        const result = getSelectionRect(start, end);
        expect(result).toBeNull();
      });
    });

    describe("Custom Minimum Size", () => {
      it("should use custom minimum size", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 50, y: 50 };
        const result = getSelectionRect(start, end, 60);
        expect(result).toBeNull();
      });

      it("should accept selection at custom minimum", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 60, y: 60 };
        const result = getSelectionRect(start, end, 60);
        expect(result).toEqual({ x: 0, y: 0, width: 60, height: 60 });
      });

      it("should handle custom min size of zero", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 10, y: 10 };
        const result = getSelectionRect(start, end, 0);
        expect(result).toEqual({ x: 0, y: 0, width: 10, height: 10 });
      });

      it("should handle negative custom min size", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 1, y: 1 };
        const result = getSelectionRect(start, end, -10);
        expect(result).toEqual({ x: 0, y: 0, width: 1, height: 1 });
      });
    });

    describe("Rect Properties", () => {
      it("should have correct x and y for top-left selection", () => {
        const start: XYPosition = { x: 10, y: 20 };
        const end: XYPosition = { x: 110, y: 120 };
        const result = getSelectionRect(start, end);
        expect(result).toEqual({ x: 10, y: 20, width: 100, height: 100 });
      });

      it("should have correct x and y for bottom-right selection", () => {
        const start: XYPosition = { x: 110, y: 120 };
        const end: XYPosition = { x: 10, y: 20 };
        const result = getSelectionRect(start, end);
        expect(result).toEqual({ x: 10, y: 20, width: 100, height: 100 });
      });

      it("should calculate correct width and height", () => {
        const start: XYPosition = { x: 50, y: 75 };
        const end: XYPosition = { x: 150, y: 175 };
        const result = getSelectionRect(start, end);
        expect(result).toEqual({ x: 50, y: 75, width: 100, height: 100 });
      });

      it("should handle large selections", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 10000, y: 10000 };
        const result = getSelectionRect(start, end);
        expect(result).toEqual({ x: 0, y: 0, width: 10000, height: 10000 });
      });

      it("should handle decimal coordinates", () => {
        const start: XYPosition = { x: 10.5, y: 20.7 };
        const end: XYPosition = { x: 110.3, y: 120.9 };
        const result = getSelectionRect(start, end);
        expect(result).toEqual({ x: 10.5, y: 20.7, width: 99.8, height: 100.2 });
      });
    });

    describe("TypeScript Interface", () => {
      it("should return proper SelectionRect type", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 100, y: 100 };
        const result = getSelectionRect(start, end);
        
        expect(result).not.toBeNull();
        if (result) {
          expect(typeof result.x).toBe("number");
          expect(typeof result.y).toBe("number");
          expect(typeof result.width).toBe("number");
          expect(typeof result.height).toBe("number");
        }
      });

      it("should allow SelectionRect to be used in further calculations", () => {
        const start: XYPosition = { x: 0, y: 0 };
        const end: XYPosition = { x: 200, y: 150 };
        const rect = getSelectionRect(start, end);
        
        expect(rect).not.toBeNull();
        if (rect) {
          const area = rect.width * rect.height;
          expect(area).toBe(30000);
        }
      });
    });
  });
});
