import { useEffect, useRef, useState } from "react";
import {
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Viewport
} from "@xyflow/react";

/** Gap kept between the graph and the canvas edges or the chat bar. */
const FIT_MARGIN_PX = 24;

type Px = `${number}px`;
type FitPadding = { top: Px; right: Px; bottom: Px; left: Px };

/**
 * Fit padding that keeps the graph out of the part of the canvas the floating
 * chat bar covers. Without a chat bar every edge gets the same margin.
 */
export function chatDockFitPadding(
  canvas: Pick<DOMRect, "bottom">,
  dock: Pick<DOMRect, "top"> | null
): FitPadding {
  const covered = dock ? Math.max(0, canvas.bottom - dock.top) : 0;
  const margin: Px = `${FIT_MARGIN_PX}px`;
  return {
    top: margin,
    right: margin,
    left: margin,
    bottom: `${covered + FIT_MARGIN_PX}px`
  };
}

/**
 * A workflow that opens with nodes and no saved viewport would otherwise show
 * at 100% from the origin, with the chat bar over its lower nodes. Fit it once,
 * never above 100%, into the area above the chat bar. A workflow that opens
 * blank is left alone, so its first node does not zoom the canvas.
 */
export function useInitialFitAboveChatDock(
  active: boolean,
  storedViewport: Viewport | null,
  nodeCount: number
): void {
  const flow = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const canvasWidth = useStore((state) => state.width);
  const domNode = useStore((state) => state.domNode);
  const [eligible] = useState(() => storedViewport === null && nodeCount > 0);
  const fittedRef = useRef(false);

  useEffect(() => {
    if (
      !eligible ||
      fittedRef.current ||
      !active ||
      !nodesInitialized ||
      canvasWidth <= 0 ||
      !domNode
    ) {
      return undefined;
    }
    // Wait a frame so the chat bar has its laid-out height.
    const frame = requestAnimationFrame(() => {
      fittedRef.current = true;
      // Every open workspace tab stays mounted, so skip the hidden docks.
      const dock =
        Array.from(document.querySelectorAll(".canvas-chat-dock"))
          .map((element) => element.getBoundingClientRect())
          .find((rect) => rect.height > 0) ?? null;
      void flow.fitView({
        maxZoom: 1,
        padding: chatDockFitPadding(domNode.getBoundingClientRect(), dock)
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [eligible, active, nodesInitialized, canvasWidth, domNode, flow]);
}
