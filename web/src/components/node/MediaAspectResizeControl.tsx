/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useReactFlow } from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type { Node } from "@xyflow/react";
import { Box, MOTION, Z_INDEX } from "../ui_primitives";
import { useNodes } from "../../contexts/NodeContext";
import type { NodeStoreState } from "../../stores/NodeStore";
import type { NodeData } from "../../stores/NodeData";
import {
  computeAspectResize,
  computeFreeResize,
  type MediaBox,
  type ResizeResult
} from "./mediaAspectResize";
import { measureNodeMedia } from "./measureNodeMedia";

export type ResizeCorner =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

interface MediaAspectResizeControlProps {
  nodeId: string;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  /** Which corner this handle sits on. Defaults to bottom-right. */
  corner?: ResizeCorner;
}

interface DragState {
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  /** Node position (flow units) at drag start, to anchor the opposite corner. */
  startPosX: number;
  startPosY: number;
  zoom: number;
  /** Measured media box, or null when the node holds no decoded media. */
  box: MediaBox | null;
}

/** Per-corner geometry: which way the pointer grows the box, whether the node's
 *  origin moves, the placement of the grip, its cursor, and the icon rotation. */
const CORNERS: Record<
  ResizeCorner,
  {
    signX: number;
    signY: number;
    movesX: boolean;
    movesY: boolean;
    placement: { left?: number; right?: number; top?: number; bottom?: number };
    cursor: string;
    rotate: number;
  }
> = {
  "bottom-right": {
    signX: 1,
    signY: 1,
    movesX: false,
    movesY: false,
    placement: { right: 0, bottom: 0 },
    cursor: "nwse-resize",
    rotate: -45
  },
  "bottom-left": {
    signX: -1,
    signY: 1,
    movesX: true,
    movesY: false,
    placement: { left: 0, bottom: 0 },
    cursor: "nesw-resize",
    rotate: 45
  },
  "top-right": {
    signX: 1,
    signY: -1,
    movesX: false,
    movesY: true,
    placement: { right: 0, top: 0 },
    cursor: "nesw-resize",
    rotate: -135
  },
  "top-left": {
    signX: -1,
    signY: -1,
    movesX: true,
    movesY: true,
    placement: { left: 0, top: 0 },
    cursor: "nwse-resize",
    rotate: 135
  }
};

const styles = (theme: Theme, corner: ResizeCorner) => {
  const { placement, cursor, rotate } = CORNERS[corner];
  return css({
    position: "absolute",
    zIndex: Z_INDEX.overlay,
    ...placement,
    width: "25px",
    height: "25px",
    overflow: "hidden",
    ".resize-grip": {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "transparent",
      border: "none",
      padding: 0,
      pointerEvents: "all",
      cursor,
      transition: MOTION.all,
      "& svg": {
        width: "20px",
        height: "20px",
        color: theme.vars.palette.grey[100],
        transform: `rotate(${rotate}deg)`,
        transition: `color ${MOTION.normal}`
      }
    }
  });
};

/**
 * Corner resize handle that keeps the node's media (image / video) aspect ratio
 * while treating the surrounding chrome (header, sliders, output handles) as a
 * fixed offset. When the node holds no media it falls back to a free resize, so
 * the same handle is correct for nodes that only sometimes show an image.
 *
 * Works on any of the four corners: the pointer delta is converted to a growth
 * delta per corner, and the node's origin is shifted so the *opposite* corner
 * stays anchored — matching how the bottom-right handle behaves.
 *
 * Unlike React Flow's `NodeResizeControl`, this drives the geometry directly:
 * the built-in control applies its own width *and* height before `onResize`
 * runs, leaving no way to derive height from width without fighting it.
 */
const MediaAspectResizeControl = memo(function MediaAspectResizeControl({
  nodeId,
  minWidth,
  minHeight,
  maxWidth,
  corner = "bottom-right"
}: MediaAspectResizeControlProps) {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme, corner), [theme, corner]);
  const reactFlow = useReactFlow();
  const updateNode = useNodes((state: NodeStoreState) => state.updateNode);

  const dragRef = useRef<DragState | null>(null);
  const pendingRef = useRef<Partial<Node<NodeData>> | null>(null);
  const rafRef = useRef<number | null>(null);
  /** `.react-flow` container, classed during the drag to kill the transform tween. */
  const containerRef = useRef<Element | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current) {
      updateNode(nodeId, pendingRef.current);
      pendingRef.current = null;
    }
  }, [nodeId, updateNode]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      containerRef.current?.classList.remove("node-resizing");
    },
    []
  );

  const toUpdate = useCallback(
    (result: ResizeResult, drag: DragState): Partial<Node<NodeData>> => {
      const { movesX, movesY } = CORNERS[corner];
      const update: Partial<Node<NodeData>> = {
        width: result.width,
        height: result.height
      };
      if (movesX || movesY) {
        update.position = {
          x: movesX
            ? drag.startPosX + (drag.startWidth - result.width)
            : drag.startPosX,
          y: movesY
            ? drag.startPosY + (drag.startHeight - result.height)
            : drag.startPosY
        };
      }
      return update;
    },
    [corner]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }
      const nodeEl = event.currentTarget.closest<HTMLElement>(
        ".react-flow__node"
      );
      if (!nodeEl) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();

      const zoom = reactFlow.getViewport().zoom || 1;
      const rect = nodeEl.getBoundingClientRect();
      const startWidth = rect.width / zoom;
      const startHeight = rect.height / zoom;
      const position = reactFlow.getNode(nodeId)?.position ?? { x: 0, y: 0 };

      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startWidth,
        startHeight,
        startPosX: position.x,
        startPosY: position.y,
        zoom,
        box: measureNodeMedia(nodeEl, zoom, startWidth, startHeight)
      };
      // Moving-corner resizes shift the node origin every frame. React Flow only
      // adds `.dragging` when *it* drags the node, so the `:not(.dragging)`
      // transform transition stays live here and the node lags ~180ms behind,
      // snapping into place after release. Mirror the selection-drag fix and
      // suppress the tween on the container for the duration of the gesture.
      containerRef.current = nodeEl.closest(".react-flow");
      containerRef.current?.classList.add("node-resizing");
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [reactFlow, nodeId]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      const { signX, signY } = CORNERS[corner];
      const delta = {
        startWidth: drag.startWidth,
        startHeight: drag.startHeight,
        deltaX: (signX * (event.clientX - drag.startX)) / drag.zoom,
        deltaY: (signY * (event.clientY - drag.startY)) / drag.zoom
      };
      const bounds = { minWidth, maxWidth, minHeight };
      const result = drag.box
        ? computeAspectResize(delta, drag.box, bounds)
        : computeFreeResize(delta, bounds);
      pendingRef.current = toUpdate(result, drag);

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    },
    [flush, minWidth, maxWidth, minHeight, corner, toUpdate]
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current) {
        return;
      }
      dragRef.current = null;
      containerRef.current?.classList.remove("node-resizing");
      containerRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Commit the final position synchronously so a fast release isn't dropped.
      if (pendingRef.current) {
        updateNode(nodeId, pendingRef.current);
        pendingRef.current = null;
      }
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer was never captured (e.g. cancelled before move) — nothing to release.
      }
    },
    [nodeId, updateNode]
  );

  return (
    <Box
      className="node-resize-handle media-aspect-resize-handle"
      css={cssStyles}
    >
      <button
        type="button"
        className="resize-grip nodrag nopan"
        aria-label="Resize node, keeping image aspect ratio"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <KeyboardArrowDownIcon />
      </button>
    </Box>
  );
});

export default MediaAspectResizeControl;
