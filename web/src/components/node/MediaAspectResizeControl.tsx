/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useReactFlow } from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Box, MOTION } from "../ui_primitives";
import { useNodes } from "../../contexts/NodeContext";
import type { NodeStoreState } from "../../stores/NodeStore";
import {
  computeAspectResize,
  computeFreeResize,
  type MediaBox,
  type ResizeResult
} from "./mediaAspectResize";
import { measureNodeMedia } from "./measureNodeMedia";

interface MediaAspectResizeControlProps {
  nodeId: string;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
}

interface DragState {
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  zoom: number;
  /** Measured media box, or null when the node holds no decoded media. */
  box: MediaBox | null;
}

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    zIndex: 100,
    right: 0,
    bottom: 0,
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
      cursor: "nwse-resize",
      opacity: 0.6,
      transition: MOTION.all,
      "&:hover": {
        opacity: 1
      },
      "& svg": {
        width: "20px",
        height: "20px",
        color: theme.vars.palette.grey[100],
        transform: "rotate(-45deg)",
        transition: `color ${MOTION.normal}`
      }
    }
  });

/**
 * Corner resize handle that keeps the node's media (image / video) aspect ratio
 * while treating the surrounding chrome (header, sliders, output handles) as a
 * fixed offset. When the node holds no media it falls back to a free resize, so
 * the same handle is correct for nodes that only sometimes show an image.
 *
 * Unlike React Flow's `NodeResizeControl`, this drives the geometry directly:
 * the built-in control applies its own width *and* height before `onResize`
 * runs, leaving no way to derive height from width without fighting it.
 */
const MediaAspectResizeControl = memo(function MediaAspectResizeControl({
  nodeId,
  minWidth,
  minHeight,
  maxWidth
}: MediaAspectResizeControlProps) {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const reactFlow = useReactFlow();
  const updateNode = useNodes((state: NodeStoreState) => state.updateNode);

  const dragRef = useRef<DragState | null>(null);
  const pendingRef = useRef<ResizeResult | null>(null);
  const rafRef = useRef<number | null>(null);

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
    },
    []
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

      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startWidth,
        startHeight,
        zoom,
        box: measureNodeMedia(nodeEl, zoom, startWidth, startHeight)
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [reactFlow]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      const delta = {
        startWidth: drag.startWidth,
        startHeight: drag.startHeight,
        deltaX: (event.clientX - drag.startX) / drag.zoom,
        deltaY: (event.clientY - drag.startY) / drag.zoom
      };
      const bounds = { minWidth, maxWidth, minHeight };
      pendingRef.current = drag.box
        ? computeAspectResize(delta, drag.box, bounds)
        : computeFreeResize(delta, bounds);

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    },
    [flush, minWidth, maxWidth, minHeight]
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!dragRef.current) {
        return;
      }
      dragRef.current = null;
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
    <Box className="node-resize-handle media-aspect-resize-handle" css={cssStyles}>
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
