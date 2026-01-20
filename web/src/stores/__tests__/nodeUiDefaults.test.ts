import { DEFAULT_NODE_WIDTH, NodeUIProperties } from "../nodeUiDefaults";
import { XYPosition } from "@xyflow/react";

describe("nodeUiDefaults", () => {
  describe("DEFAULT_NODE_WIDTH", () => {
    it("should be a positive number", () => {
      expect(DEFAULT_NODE_WIDTH).toBeGreaterThan(0);
    });

    it("should be equal to 280", () => {
      expect(DEFAULT_NODE_WIDTH).toBe(280);
    });

    it("should be a number type", () => {
      expect(typeof DEFAULT_NODE_WIDTH).toBe("number");
    });
  });

  describe("NodeUIProperties type", () => {
    it("should accept valid position object", () => {
      const position: XYPosition = { x: 100, y: 200 };
      const uiProperties: NodeUIProperties = {
        position,
      };

      expect(uiProperties.position).toEqual({ x: 100, y: 200 });
    });

    it("should accept all optional properties", () => {
      const position: XYPosition = { x: 100, y: 200 };
      const uiProperties: NodeUIProperties = {
        position,
        selected: true,
        selectable: true,
        width: 280,
        height: 100,
        zIndex: 1,
        title: "Test Node",
        color: "#ff0000",
        bypassed: false,
      };

      expect(uiProperties.selected).toBe(true);
      expect(uiProperties.selectable).toBe(true);
      expect(uiProperties.width).toBe(280);
      expect(uiProperties.height).toBe(100);
      expect(uiProperties.zIndex).toBe(1);
      expect(uiProperties.title).toBe("Test Node");
      expect(uiProperties.color).toBe("#ff0000");
      expect(uiProperties.bypassed).toBe(false);
    });

    it("should accept partial optional properties", () => {
      const position: XYPosition = { x: 0, y: 0 };
      const uiProperties: NodeUIProperties = {
        position,
        selected: true,
      };

      expect(uiProperties.position).toEqual({ x: 0, y: 0 });
      expect(uiProperties.selected).toBe(true);
      expect(uiProperties.width).toBeUndefined();
      expect(uiProperties.height).toBeUndefined();
    });

    it("should handle position with zero values", () => {
      const position: XYPosition = { x: 0, y: 0 };
      const uiProperties: NodeUIProperties = {
        position,
      };

      expect(uiProperties.position.x).toBe(0);
      expect(uiProperties.position.y).toBe(0);
    });

    it("should handle negative position values", () => {
      const position: XYPosition = { x: -100, y: -50 };
      const uiProperties: NodeUIProperties = {
        position,
      };

      expect(uiProperties.position.x).toBe(-100);
      expect(uiProperties.position.y).toBe(-50);
    });

    it("should handle large position values", () => {
      const position: XYPosition = { x: 10000, y: 20000 };
      const uiProperties: NodeUIProperties = {
        position,
      };

      expect(uiProperties.position.x).toBe(10000);
      expect(uiProperties.position.y).toBe(20000);
    });
  });
});
