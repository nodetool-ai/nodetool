import { useEffect, useRef } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { useRightPanelStore } from "../stores/RightPanelStore";

/** One node's box in canvas pixels, relative to the canvas left edge. */
export interface ScreenRect {
  left: number;
  right: number;
}

/** Gap kept between the rightmost node and the inspector. */
const INSPECTOR_CLEARANCE_PX = 16;

/**
 * How far to pan the canvas left (a negative number, or 0) so no node sits
 * under the inspector. The pan stops before the leftmost protected node would
 * leave the canvas, so a node the user is working with is never pushed out of
 * view to make room.
 */
export function inspectorClearancePan(
  nodes: ScreenRect[],
  protectedNodes: ScreenRect[],
  canvasWidth: number,
  inspectorWidth: number
): number {
  if (nodes.length === 0 || inspectorWidth <= 0) {
    return 0;
  }
  const limit = canvasWidth - inspectorWidth - INSPECTOR_CLEARANCE_PX;
  const inspectorLeft = canvasWidth - inspectorWidth;
  const hidden = nodes.filter((rect) => rect.right > inspectorLeft);
  if (hidden.length === 0) {
    return 0;
  }
  const wanted = Math.max(...hidden.map((rect) => rect.right)) - limit;
  const keep = protectedNodes.length > 0 ? protectedNodes : nodes;
  const room = Math.min(...keep.map((rect) => rect.left)) - INSPECTOR_CLEARANCE_PX;
  const pan = Math.min(wanted, Math.max(room, 0));
  return pan > 0 ? -pan : 0;
}

/**
 * Opening the inspector slides it over the canvas. When it opens on top of
 * nodes, pan the canvas so they stay visible beside it.
 */
export function useClearInspectorOverlap(active: boolean): void {
  const flow = useReactFlow();
  const canvasWidth = useStore((state) => state.width);
  const isVisible = useRightPanelStore((state) => state.panel.isVisible);
  const panelSize = useRightPanelStore((state) => state.panel.panelSize);
  const wasVisible = useRef(false);
  const widthRef = useRef(canvasWidth);
  widthRef.current = canvasWidth;

  useEffect(() => {
    const opened = isVisible && !wasVisible.current;
    wasVisible.current = isVisible;
    if (!opened || !active) {
      return;
    }
    const viewport = flow.getViewport();
    const toRect = (node: { id: string; measured?: { width?: number } }) => {
      const internal = flow.getInternalNode(node.id);
      const x = internal?.internals.positionAbsolute.x ?? 0;
      const width = node.measured?.width ?? internal?.measured.width ?? 0;
      return {
        left: x * viewport.zoom + viewport.x,
        right: (x + width) * viewport.zoom + viewport.x
      };
    };
    const nodes = flow.getNodes();
    const dx = inspectorClearancePan(
      nodes.map(toRect),
      nodes.filter((node) => node.selected).map(toRect),
      widthRef.current,
      panelSize
    );
    if (dx !== 0) {
      void flow.setViewport(
        { x: viewport.x + dx, y: viewport.y, zoom: viewport.zoom },
        { duration: 200 }
      );
    }
  }, [active, isVisible, panelSize, flow]);
}
