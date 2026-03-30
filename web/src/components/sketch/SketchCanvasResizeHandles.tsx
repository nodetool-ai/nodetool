/**
 * SketchCanvasResizeHandles
 *
 * Eight square handles (corners + edge midpoints) just outside the canvas for
 * drag-resize. Hold Alt to resize symmetrically from the canvas center (layers
 * shift so content stays visually centered).
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useRef, useState } from "react";

type ResizeEdge =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

interface SketchCanvasResizeHandlesProps {
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  pan: { x: number; y: number };
  onResizeStart?: () => void;
  onResize: (
    width: number,
    height: number,
    options?: { translateLayers?: { x: number; y: number } }
  ) => void;
  onResizeEnd?: () => void;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

/** Target size on screen (px) before zoom; handles sit outside the artboard by this much. */
const SCREEN_HANDLE_PX = 10;
const SCREEN_OUTSIDE_GAP_PX = 6;

const MIN_CANVAS_SIZE = 16;
const MAX_CANVAS_SIZE = 8192;

const CURSOR_MAP: Record<ResizeEdge, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
  sw: "nesw-resize"
};

const containerStyles = css({
  position: "absolute",
  pointerEvents: "none",
  zIndex: 6
});

const handleStyles = css({
  position: "absolute",
  pointerEvents: "auto",
  touchAction: "none",
  backgroundColor: "transparent",
  transition: "background-color 0.15s ease",
  boxSizing: "border-box",
  "&:hover, &.active": {
    backgroundColor: "rgba(66, 165, 245, 0.25)"
  }
});

const SketchCanvasResizeHandles: React.FC<SketchCanvasResizeHandlesProps> = ({
  canvasWidth,
  canvasHeight,
  zoom,
  pan,
  onResizeStart,
  onResize,
  onResizeEnd,
  minWidth = MIN_CANVAS_SIZE,
  minHeight = MIN_CANVAS_SIZE,
  maxWidth = MAX_CANVAS_SIZE,
  maxHeight = MAX_CANVAS_SIZE
}) => {
  const [activeEdge, setActiveEdge] = useState<ResizeEdge | null>(null);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    edge: ResizeEdge;
    resizeFromCenter: boolean;
  } | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);

  const clampSize = useCallback(
    (w: number, h: number): { width: number; height: number } => ({
      width: Math.round(Math.max(minWidth, Math.min(maxWidth, w))),
      height: Math.round(Math.max(minHeight, Math.min(maxHeight, h)))
    }),
    [minWidth, maxWidth, minHeight, maxHeight]
  );

  const computeNewSize = useCallback(
    (
      edge: ResizeEdge,
      dx: number,
      dy: number,
      origW: number,
      origH: number,
      fromCenter: boolean
    ) => {
      const m = fromCenter ? 2 : 1;
      const cDx = (dx / zoom) * m;
      const cDy = (dy / zoom) * m;

      let newW = origW;
      let newH = origH;

      if (edge === "e" || edge === "ne" || edge === "se") {
        newW = origW + cDx;
      }
      if (edge === "w" || edge === "nw" || edge === "sw") {
        newW = origW - cDx;
      }

      if (edge === "s" || edge === "se" || edge === "sw") {
        newH = origH + cDy;
      }
      if (edge === "n" || edge === "ne" || edge === "nw") {
        newH = origH - cDy;
      }

      return clampSize(newW, newH);
    },
    [zoom, clampSize]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, edge: ResizeEdge) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (typeof target.setPointerCapture === "function") {
        target.setPointerCapture(e.pointerId);
      }

      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: canvasWidth,
        height: canvasHeight,
        edge,
        resizeFromCenter: e.altKey
      };
      lastSizeRef.current = { width: canvasWidth, height: canvasHeight };
      setActiveEdge(edge);
      onResizeStart?.();
    },
    [canvasWidth, canvasHeight, onResizeStart]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragStartRef.current;
      if (!drag) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const newSize = computeNewSize(
        drag.edge,
        dx,
        dy,
        drag.width,
        drag.height,
        drag.resizeFromCenter
      );

      const last = lastSizeRef.current;
      if (
        last &&
        last.width === newSize.width &&
        last.height === newSize.height
      ) {
        return;
      }

      let translateLayers: { x: number; y: number } | undefined;
      if (drag.resizeFromCenter && last) {
        const dW = newSize.width - last.width;
        const dH = newSize.height - last.height;
        if (dW !== 0 || dH !== 0) {
          translateLayers = { x: dW / 2, y: dH / 2 };
        }
      }

      lastSizeRef.current = newSize;
      if (translateLayers) {
        onResize(newSize.width, newSize.height, { translateLayers });
      } else {
        onResize(newSize.width, newSize.height);
      }
    },
    [computeNewSize, onResize]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (typeof target.releasePointerCapture === "function") {
        target.releasePointerCapture(e.pointerId);
      }

      dragStartRef.current = null;
      lastSizeRef.current = null;
      setActiveEdge(null);
      onResizeEnd?.();
    },
    [onResizeEnd]
  );

  const gap = SCREEN_OUTSIDE_GAP_PX / zoom;
  const hs = SCREEN_HANDLE_PX / zoom;

  interface HandleDef {
    edge: ResizeEdge;
    style: React.CSSProperties;
  }

  const o = gap + hs;

  const handles: HandleDef[] = [
    {
      edge: "nw",
      style: {
        top: -o,
        left: -o,
        width: hs,
        height: hs,
        cursor: CURSOR_MAP.nw
      }
    },
    {
      edge: "ne",
      style: {
        top: -o,
        right: -o,
        width: hs,
        height: hs,
        cursor: CURSOR_MAP.ne
      }
    },
    {
      edge: "sw",
      style: {
        bottom: -o,
        left: -o,
        width: hs,
        height: hs,
        cursor: CURSOR_MAP.sw
      }
    },
    {
      edge: "se",
      style: {
        bottom: -o,
        right: -o,
        width: hs,
        height: hs,
        cursor: CURSOR_MAP.se
      }
    },
    {
      edge: "n",
      style: {
        top: -o,
        left: "50%",
        width: hs,
        height: hs,
        marginLeft: -hs / 2,
        cursor: CURSOR_MAP.n
      }
    },
    {
      edge: "s",
      style: {
        bottom: -o,
        left: "50%",
        width: hs,
        height: hs,
        marginLeft: -hs / 2,
        cursor: CURSOR_MAP.s
      }
    },
    {
      edge: "w",
      style: {
        left: -o,
        top: "50%",
        width: hs,
        height: hs,
        marginTop: -hs / 2,
        cursor: CURSOR_MAP.w
      }
    },
    {
      edge: "e",
      style: {
        right: -o,
        top: "50%",
        width: hs,
        height: hs,
        marginTop: -hs / 2,
        cursor: CURSOR_MAP.e
      }
    }
  ];

  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: canvasWidth,
    height: canvasHeight,
    transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: "center center",
    pointerEvents: "none"
  };

  return (
    <div
      className="sketch-canvas__resize-handles"
      css={containerStyles}
      style={wrapperStyle}
    >
      {handles.map(({ edge, style }) => (
        <div
          key={edge}
          className={`resize-handle resize-handle--${edge}${activeEdge === edge ? " active" : ""}`}
          css={handleStyles}
          style={style}
          onPointerDown={(e) => handlePointerDown(e, edge)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      ))}
    </div>
  );
};

export default memo(SketchCanvasResizeHandles);
