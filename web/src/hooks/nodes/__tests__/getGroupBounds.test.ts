import { getGroupBounds } from "../getGroupBounds";
import { getChildNodes } from "../getChildNodes";
import { Node, getNodesBounds } from "@xyflow/react";
import { NodeData } from "../../../stores/NodeData";

// Mock dependencies
jest.mock("@xyflow/react", () => ({
  getNodesBounds: jest.fn()
}));

jest.mock("../getChildNodes", () => ({
  getChildNodes: jest.fn()
}));

const mockGetNodesBounds = getNodesBounds as jest.MockedFunction<typeof getNodesBounds>;
const mockGetChildNodes = getChildNodes as jest.MockedFunction<typeof getChildNodes>;

describe("getGroupBounds", () => {
  const createMockNode = (
    id: string,
    position: { x: number; y: number },
    width?: number,
    height?: number,
    measured?: { width?: number; height?: number }
  ): Node<NodeData> => ({
    id,
    type: "default",
    position,
    width,
    height,
    measured,
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "test-workflow"
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNodesBounds.mockImplementation((nodes: any[]) => {
      if (nodes.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach((node) => {
        const x = node.position?.x || 0;
        const y = node.position?.y || 0;
        const w = node.width || node.measured?.width || 100;
        const h = node.height || node.measured?.height || 50;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
      });
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      };
    });
  });

  it("returns null when parentNode is undefined", () => {
    const result = getGroupBounds([], undefined as any);
    expect(result).toBeNull();
  });

  it("returns null when parentNode has no id", () => {
    const parentNode = { id: undefined, position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "test" } } as unknown as Node<NodeData>;
    const result = getGroupBounds([], parentNode);
    expect(result).toBeNull();
  });

  it("returns padded dimensions when no children exist", () => {
    const parentNode = createMockNode("parent-1", { x: 0, y: 0 });
    mockGetChildNodes.mockReturnValue([]);

    const result = getGroupBounds([], parentNode);

    expect(result).toEqual({
      width: 40,
      height: 40,
      offsetX: 0,
      offsetY: 0
    });
  });

  it("uses custom padding when provided", () => {
    const parentNode = createMockNode("parent-1", { x: 0, y: 0 });
    mockGetChildNodes.mockReturnValue([]);

    const result = getGroupBounds([], parentNode, 30, 40);

    expect(result).toEqual({
      width: 60,
      height: 80,
      offsetX: 0,
      offsetY: 0
    });
  });

  it("calculates bounds from children with width/height", () => {
    const parentNode = createMockNode("parent-1", { x: 0, y: 0 });
    const children = [
      createMockNode("child-1", { x: 10, y: 20 }, 100, 50),
      createMockNode("child-2", { x: 150, y: 80 }, 80, 40)
    ];
    mockGetChildNodes.mockReturnValue(children);

    const result = getGroupBounds([], parentNode);

    // Bounds should encompass all children with padding
    expect(result).not.toBeNull();
    expect(result!.width).toBeGreaterThan(0);
    expect(result!.height).toBeGreaterThan(0);
    expect(result!.offsetX).toBeLessThanOrEqual(10);
    expect(result!.offsetY).toBeLessThanOrEqual(20);
  });

  it("uses measured dimensions when width/height not set", () => {
    const parentNode = createMockNode("parent-1", { x: 0, y: 0 });
    const children = [
      createMockNode("child-1", { x: 10, y: 20 }, undefined, undefined, { width: 100, height: 50 })
    ];
    mockGetChildNodes.mockReturnValue(children);

    const result = getGroupBounds([], parentNode);

    expect(result).not.toBeNull();
    expect(result!.width).toBeGreaterThan(0);
  });

  it("uses fallback dimensions when neither width/height nor measured available", () => {
    const parentNode = createMockNode("parent-1", { x: 0, y: 0 });
    const children = [
      createMockNode("child-1", { x: 10, y: 20 }, undefined, undefined, {})
    ];
    mockGetChildNodes.mockReturnValue(children);

    const result = getGroupBounds([], parentNode);

    expect(result).not.toBeNull();
    expect(result!.width).toBeGreaterThan(0);
  });

  it("handles single child node", () => {
    const parentNode = createMockNode("parent-1", { x: 0, y: 0 });
    const children = [
      createMockNode("child-1", { x: 50, y: 50 }, 100, 100)
    ];
    mockGetChildNodes.mockReturnValue(children);

    const result = getGroupBounds([], parentNode);

    expect(result).not.toBeNull();
    expect(result!.width).toBeGreaterThanOrEqual(100);
    expect(result!.height).toBeGreaterThanOrEqual(100);
  });

  it("calculates correct offset based on child positions", () => {
    const parentNode = createMockNode("parent-1", { x: 100, y: 100 });
    const children = [
      createMockNode("child-1", { x: 150, y: 200 }, 100, 50)
    ];
    mockGetChildNodes.mockReturnValue(children);

    const result = getGroupBounds([], parentNode);

    expect(result).not.toBeNull();
    expect(result!.offsetX).toBe(150);
    expect(result!.offsetY).toBe(200);
  });

  it("calls getChildNodes with correct parameters", () => {
    const parentNode = createMockNode("parent-1", { x: 0, y: 0 });
    const allNodes: Node<NodeData>[] = [
      createMockNode("other-1", { x: 0, y: 0 })
    ];
    mockGetChildNodes.mockReturnValue([]);

    getGroupBounds(allNodes, parentNode, 25, 50);

    expect(mockGetChildNodes).toHaveBeenCalledWith(allNodes, "parent-1");
  });
});
