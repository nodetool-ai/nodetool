import { Node, Rect, getNodesBounds } from "@xyflow/react";
import { getChildNodes } from "./getChildNodes";
import { NodeData } from "../../stores/NodeData";

interface GroupBounds {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export function getGroupBounds(
  allNodes: Node<NodeData>[],
  parentNode: Node<NodeData>,
  paddingXParam?: number,
  paddingYParam?: number
): GroupBounds | null {
  const paddingX = paddingXParam ?? 20;
  const paddingY = paddingYParam ?? 20;
  const FALLBACK_WIDTH = 100;
  const FALLBACK_HEIGHT = 50;

  if (!parentNode || !parentNode.id) {
    return null;
  }

  const children = getChildNodes(allNodes, parentNode.id);

  if (children.length === 0) {
    return {
      width: paddingX * 2,
      height: paddingY * 2,
      offsetX: 0,
      offsetY: 0
    };
  }

  const childrenForBounds = children.map((child) => ({
    ...child,
    id: child.id,
    position: child.position ?? { x: 0, y: 0 },
    width: child.width ?? child.measured?.width ?? FALLBACK_WIDTH,
    height: child.height ?? child.measured?.height ?? FALLBACK_HEIGHT,
    data: child.data ?? {},
    type: child.type ?? "default"
  }));

  const boundsRect: Rect = getNodesBounds(childrenForBounds as Node[]);
  const calculatedWidth = boundsRect.x + boundsRect.width + paddingX;
  const calculatedHeight = boundsRect.y + boundsRect.height + paddingY;
  const finalWidth = Math.max(calculatedWidth, paddingX * 2);
  const finalHeight = Math.max(calculatedHeight, paddingY * 2);
  const result = {
    width: finalWidth,
    height: finalHeight,
    offsetX: boundsRect.x,
    offsetY: boundsRect.y
  };
  return result;
}
