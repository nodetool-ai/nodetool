import { getNodesBounds } from "../useFitView";
import { NodeData } from "../../stores/NodeData";
import { Node } from "@xyflow/react";

const createMockNodeData = (): NodeData => ({
  properties: {},
  selectable: true,
  dynamic_properties: {},
  workflow_id: "test-workflow"
});

describe("useFitView utilities", () => {
  describe("getNodesBounds", () => {
    const mockNodes: Node<NodeData>[] = [
      { 
        id: "node-1", 
        position: { x: 100, y: 200 },
        measured: { width: 150, height: 80 },
        data: createMockNodeData()
      },
      { 
        id: "node-2", 
        position: { x: 300, y: 400 },
        measured: { width: 200, height: 100 },
        data: createMockNodeData()
      }
    ];

    const nodesById: Record<string, { x: number; y: number }> = {
      "node-1": { x: 100, y: 200 },
      "node-2": { x: 300, y: 400 }
    };

    it("returns null for empty nodes array", () => {
      const result = getNodesBounds([], {});
      expect(result).toBeNull();
    });

    it("calculates bounds for single node", () => {
      const singleNode = [mockNodes[0]];
      const result = getNodesBounds(singleNode, nodesById);
      
      expect(result).not.toBeNull();
      expect(result!.xMin).toBe(100);
      expect(result!.xMax).toBe(250); // 100 + 150
      expect(result!.yMin).toBe(200);
      expect(result!.yMax).toBe(280); // 200 + 80
    });

    it("calculates bounds for multiple nodes", () => {
      const result = getNodesBounds(mockNodes, nodesById);
      
      expect(result).not.toBeNull();
      expect(result!.xMin).toBe(100);
      expect(result!.xMax).toBe(500); // 300 + 200
      expect(result!.yMin).toBe(200);
      expect(result!.yMax).toBe(500); // 400 + 100
    });

    it("handles nodes without measured dimensions", () => {
      const nodeWithoutMeasure: Node<NodeData>[] = [
        { 
          id: "node-1", 
          position: { x: 100, y: 200 },
          data: createMockNodeData()
        }
      ];
      
      const result = getNodesBounds(nodeWithoutMeasure, nodesById);
      
      expect(result).not.toBeNull();
      expect(result!.xMin).toBe(100);
      expect(result!.xMax).toBe(100); // width defaults to 0
      expect(result!.yMin).toBe(200);
      expect(result!.yMax).toBe(200); // height defaults to 0
    });

    it("handles parent node offsets", () => {
      const nodesWithParent: Node<NodeData>[] = [
        { 
          id: "child-1", 
          position: { x: 50, y: 50 },
          parentId: "parent-1",
          measured: { width: 100, height: 60 },
          data: createMockNodeData()
        }
      ];

      const nodesByIdWithParent = {
        "child-1": { x: 50, y: 50 },
        "parent-1": { x: 100, y: 100 }
      };

      const result = getNodesBounds(nodesWithParent, nodesByIdWithParent);
      
      expect(result).not.toBeNull();
      expect(result!.xMin).toBe(150); // 50 + 100 (parent x)
      expect(result!.xMax).toBe(250); // 150 + 100 (width)
      expect(result!.yMin).toBe(150); // 50 + 100 (parent y)
      expect(result!.yMax).toBe(210); // 150 + 60 (height)
    });

    it("handles negative positions", () => {
      const negativeNodes: Node<NodeData>[] = [
        { 
          id: "node-neg", 
          position: { x: -100, y: -200 },
          measured: { width: 50, height: 30 },
          data: createMockNodeData()
        }
      ];

      const result = getNodesBounds(negativeNodes, { "node-neg": { x: -100, y: -200 } });
      
      expect(result).not.toBeNull();
      expect(result!.xMin).toBe(-100);
      expect(result!.xMax).toBe(-50); // -100 + 50
      expect(result!.yMin).toBe(-200);
      expect(result!.yMax).toBe(-170); // -200 + 30
    });

    it("handles large coordinate values", () => {
      const largeNodes: Node<NodeData>[] = [
        { 
          id: "large-node", 
          position: { x: 10000, y: 20000 },
          measured: { width: 500, height: 300 },
          data: createMockNodeData()
        }
      ];

      const result = getNodesBounds(largeNodes, { "large-node": { x: 10000, y: 20000 } });
      
      expect(result).not.toBeNull();
      expect(result!.xMin).toBe(10000);
      expect(result!.xMax).toBe(10500);
      expect(result!.yMin).toBe(20000);
      expect(result!.yMax).toBe(20300);
    });
  });
});
