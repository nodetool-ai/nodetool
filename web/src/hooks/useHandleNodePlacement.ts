import { useCallback } from "react";
import { useReactFlow, type XYPosition } from "@xyflow/react";

import { useShallow } from "zustand/react/shallow";

import { useNodes } from "../contexts/NodeContext";
import {
  ESTIMATED_INPUT_HANDLE_OFFSET_Y,
  HANDLE_GAP_X,
  placeAtAnchor,
  resolveVerticalOverlap,
  type PlacementRect
} from "../utils/nodePlacement";

/**
 * Placement for a node created from a handle menu.
 *
 * The anchor is the handle itself, never the menu row the user clicked: the
 * menu is a floating list, so its rows sit tens to hundreds of pixels away
 * from the handle and flip side when the menu meets a viewport edge.
 *
 * A node's first input handle sits anywhere from ~10px to ~100px below its top
 * edge depending on its header and body, and none of that is known until the
 * node renders. So creation uses an estimate and `alignNodeToAnchor` corrects
 * it on the next frames, once the real handle can be measured.
 */
export const useHandleNodePlacement = () => {
  const { screenToFlowPosition } = useReactFlow();
  const { findNode, updateNode } = useNodes(
    useShallow((state) => ({
      findNode: state.findNode,
      updateNode: state.updateNode
    }))
  );

  const flowRect = useCallback(
    (element: Element): PlacementRect => {
      const rect = element.getBoundingClientRect();
      const topLeft = screenToFlowPosition({ x: rect.x, y: rect.y });
      const bottomRight = screenToFlowPosition({
        x: rect.right,
        y: rect.bottom
      });
      return {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y
      };
    },
    [screenToFlowPosition]
  );

  /** Flow-space centre of a node's handle, or null when it is not rendered. */
  const handleAnchor = useCallback(
    (
      nodeId: string,
      handleId: string | null,
      kind: "source" | "target"
    ): XYPosition | null => {
      const node = document.querySelector(
        `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
      );
      if (!node) {
        return null;
      }
      const handle =
        (handleId &&
          node.querySelector(
            `.react-flow__handle.${kind}[data-handleid="${CSS.escape(handleId)}"]`
          )) ||
        node.querySelector(`.react-flow__handle.${kind}`);
      if (!handle) {
        return null;
      }
      const rect = handle.getBoundingClientRect();
      return screenToFlowPosition({
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2
      });
    },
    [screenToFlowPosition]
  );

  /** Where to create a node connected to `anchor`, before it can be measured. */
  const initialPosition = useCallback(
    (anchor: XYPosition): XYPosition =>
      placeAtAnchor(anchor, ESTIMATED_INPUT_HANDLE_OFFSET_Y, HANDLE_GAP_X),
    []
  );

  /**
   * Once `nodeId` has rendered, move it so its input handle is level with
   * `anchor` and it clears the nodes already on the canvas.
   */
  const alignNodeToAnchor = useCallback(
    (nodeId: string, anchor: XYPosition, targetHandle: string | null) => {
      let frames = 0;
      const attempt = () => {
        const element = document.querySelector(
          `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
        );
        // ReactFlow mounts a node before it measures it; an unmeasured node
        // reports height 0, which would align against nothing.
        if (
          (!element || element.getBoundingClientRect().height === 0) &&
          frames++ < 5
        ) {
          requestAnimationFrame(attempt);
          return;
        }
        if (!element) {
          return;
        }
        const rect = flowRect(element);
        const inputAnchor = handleAnchor(nodeId, targetHandle, "target");
        const offsetY = inputAnchor
          ? inputAnchor.y - rect.y
          : ESTIMATED_INPUT_HANDLE_OFFSET_Y;

        const obstacles = Array.from(
          document.querySelectorAll(".react-flow__node")
        )
          .filter((other) => other !== element)
          .map(flowRect)
          // A group or comment the node sits inside is a backdrop, not an
          // obstacle — pushing clear of it would eject the node from the
          // group. Strict containment, so a node of the same size still
          // counts as something to avoid.
          .filter(
            (other) =>
              !(
                other.x < rect.x &&
                other.y < rect.y &&
                other.x + other.width > rect.x + rect.width &&
                other.y + other.height > rect.y + rect.height
              )
          );

        const desired = { ...rect, y: anchor.y - offsetY };
        const correction = resolveVerticalOverlap(desired, obstacles) - rect.y;
        // Shift the stored position by the measured correction rather than
        // writing the absolute one: a node inside a group stores its position
        // relative to the group.
        const stored = findNode(nodeId);
        if (!stored || correction === 0) {
          return;
        }
        updateNode(nodeId, {
          position: {
            x: stored.position.x,
            y: stored.position.y + correction
          }
        });
      };
      requestAnimationFrame(attempt);
    },
    [findNode, flowRect, handleAnchor, updateNode]
  );

  return { handleAnchor, initialPosition, alignNodeToAnchor };
};
