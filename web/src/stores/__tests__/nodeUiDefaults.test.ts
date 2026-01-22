import { DEFAULT_NODE_WIDTH, NodeUIProperties } from "../nodeUiDefaults";
import { XYPosition } from "@xyflow/react";

describe("nodeUiDefaults", () => {
  describe("DEFAULT_NODE_WIDTH", () => {
    it("should have a positive numeric value", () => {
      expect(typeof DEFAULT_NODE_WIDTH).toBe("number");
      expect(DEFAULT_NODE_WIDTH).toBeGreaterThan(0);
    });

    it("should equal 280 pixels", () => {
      expect(DEFAULT_NODE_WIDTH).toBe(280);
    });
  });

  describe("NodeUIProperties type", () => {
    it("should accept valid UI properties object", () => {
      const validProps: NodeUIProperties = {
        selected: true,
        selectable: true,
        position: { x: 100, y: 200 },
        width: 300,
        height: 150,
        zIndex: 10,
        title: "Test Node",
        color: "#ff0000",
        bypassed: false
      };

      expect(validProps.position).toEqual({ x: 100, y: 200 });
      expect(validProps.width).toBe(300);
      expect(validProps.height).toBe(150);
    });

    it("should accept minimal UI properties", () => {
      const minimalProps: NodeUIProperties = {
        position: { x: 0, y: 0 }
      };

      expect(minimalProps.position).toEqual({ x: 0, y: 0 });
      expect(minimalProps.width).toBeUndefined();
      expect(minimalProps.height).toBeUndefined();
    });

    it("should handle optional boolean properties", () => {
      const withBooleans: NodeUIProperties = {
        position: { x: 50, y: 50 },
        selected: false,
        selectable: false,
        bypassed: true
      };

      expect(withBooleans.selected).toBe(false);
      expect(withBooleans.selectable).toBe(false);
      expect(withBooleans.bypassed).toBe(true);
    });

    it("should handle color property", () => {
      const withColor: NodeUIProperties = {
        position: { x: 0, y: 0 },
        color: "primary.main"
      };

      expect(withColor.color).toBe("primary.main");
    });

    it("should handle title property", () => {
      const withTitle: NodeUIProperties = {
        position: { x: 0, y: 0 },
        title: "My Custom Node"
      };

      expect(withTitle.title).toBe("My Custom Node");
    });

    it("should handle zIndex property", () => {
      const withZIndex: NodeUIProperties = {
        position: { x: 0, y: 0 },
        zIndex: 100
      };

      expect(withZIndex.zIndex).toBe(100);
    });

    it("should handle zero position values", () => {
      const zeroPosition: NodeUIProperties = {
        position: { x: 0, y: 0 }
      };

      expect(zeroPosition.position.x).toBe(0);
      expect(zeroPosition.position.y).toBe(0);
    });

    it("should handle negative position values", () => {
      const negativePosition: NodeUIProperties = {
        position: { x: -100, y: -50 }
      };

      expect(negativePosition.position.x).toBe(-100);
      expect(negativePosition.position.y).toBe(-50);
    });

    it("should handle decimal position values", () => {
      const decimalPosition: NodeUIProperties = {
        position: { x: 123.456, y: 789.012 }
      };

      expect(decimalPosition.position.x).toBe(123.456);
      expect(decimalPosition.position.y).toBe(789.012);
    });

    it("should handle large position values", () => {
      const largePosition: NodeUIProperties = {
        position: { x: 1000000, y: 2000000 }
      };

      expect(largePosition.position.x).toBe(1000000);
      expect(largePosition.position.y).toBe(2000000);
    });

    it("should be compatible with XYPosition type", () => {
      const xyPos: XYPosition = { x: 10, y: 20 };
      const uiProps: NodeUIProperties = {
        position: xyPos
      };

      expect(uiProps.position).toBe(xyPos);
    });
  });
});
