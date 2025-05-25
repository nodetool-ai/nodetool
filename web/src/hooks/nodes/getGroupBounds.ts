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

  console.log(
    "[getGroupBounds] Inputs: parentNode ID:",
    parentNode?.id,
    "paddingX:",
    paddingX,
    "paddingY:",
    paddingY
  );
  if (!parentNode || !parentNode.id) {
    console.warn("[getGroupBounds] Parent node or parent node ID is missing.");
    return null;
  }
  console.log("[getGroupBounds] parentNode.position:", parentNode.position);

  const children = getChildNodes(allNodes, parentNode.id);
  console.log("[getGroupBounds] Number of children found:", children.length);
  if (children.length > 0) {
    console.log(
      "[getGroupBounds] Children details:",
      children.map((c) => ({
        id: c.id,
        pos: c.position,
        w: c.width,
        h: c.height,
        measuredW: c.measured?.width,
        measuredH: c.measured?.height
      }))
    );
  }

  if (children.length === 0) {
    console.log(
      "[getGroupBounds] No children found. Returning default padding bounds."
    );
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

  console.log(
    "[getGroupBounds] childrenForBounds:",
    childrenForBounds.map((c) => ({
      id: c.id,
      pos: c.position,
      w: c.width,
      h: c.height
    }))
  );

  const boundsRect: Rect = getNodesBounds(childrenForBounds as Node[]);
  console.log("[getGroupBounds] boundsRect from getNodesBounds:", boundsRect);

  const calculatedWidth = boundsRect.x + boundsRect.width + paddingX;
  const calculatedHeight = boundsRect.y + boundsRect.height + paddingY;
  console.log(
    "[getGroupBounds] calculatedWidth (boundsRect.x + boundsRect.width + paddingX):",
    calculatedWidth
  );
  console.log(
    "[getGroupBounds] calculatedHeight (boundsRect.y + boundsRect.height + paddingY):",
    calculatedHeight
  );

  const finalWidth = Math.max(calculatedWidth, paddingX * 2);
  const finalHeight = Math.max(calculatedHeight, paddingY * 2);
  console.log(
    "[getGroupBounds] finalWidth (Math.max with paddingX*2):",
    finalWidth
  );
  console.log(
    "[getGroupBounds] finalHeight (Math.max with paddingY*2):",
    finalHeight
  );

  const result = {
    width: finalWidth,
    height: finalHeight,
    offsetX: boundsRect.x,
    offsetY: boundsRect.y
  };
  console.log("[getGroupBounds] Returning:", result);
  return result;
}
