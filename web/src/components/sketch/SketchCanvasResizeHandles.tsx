/**
 * SketchCanvasResizeHandles
 *
 * Renders interactive resize handles on the edges and corners of the sketch canvas.
 * Allows the user to drag to resize the canvas dimensions directly in the viewport.
 *
 * The handles are positioned using the same transform as the canvas itself so they
 * track position, zoom, and pan automatically.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  onResize: (width: number, height: number) => void;
  onResizeEnd?: () => void;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HANDLE_SIZE = 10; // px – hit area for corner handles
const EDGE_THICKNESS = 6; // px – hit area for edge handles
const MIN_CANVAS_SIZE = 16; // absolute minimum canvas dimension
const MAX_CANVAS_SIZE = 8192; // absolute maximum canvas dimension

// ─── Cursor mapping ──────────────────────────────────────────────────────────

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

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  "&:hover, &.active": {
    backgroundColor: "rgba(66, 165, 245, 0.25)"
  }
});

// ─── Component ───────────────────────────────────────────────────────────────

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
  } | null>(null);
  // Track the last committed size to apply live during drag
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);

  const clampSize = useCallback(
    (w: number, h: number): { width: number; height: number } => ({
      width: Math.round(Math.max(minWidth, Math.min(maxWidth, w))),
      height: Math.round(Math.max(minHeight, Math.min(maxHeight, h)))
    }),
    [minWidth, maxWidth, minHeight, maxHeight]
  );

  const computeNewSize = useCallback(
    (edge: ResizeEdge, dx: number, dy: number, origW: number, origH: number) => {
      // Convert screen-space delta to canvas-pixel delta
      const cDx = dx / zoom;
      const cDy = dy / zoom;

      let newW = origW;
      let newH = origH;

      // East / West
      if (edge === "e" || edge === "ne" || edge === "se") {
        newW = origW + cDx;
      }
      if (edge === "w" || edge === "nw" || edge === "sw") {
        newW = origW - cDx;
      }

      // South / North
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

  // ─── Pointer handlers (use document-level events for reliable drag) ──────

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
        edge
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
      const newSize = computeNewSize(drag.edge, dx, dy, drag.width, drag.height);

      const last = lastSizeRef.current;
      if (last && last.width === newSize.width && last.height === newSize.height) {
        return;
      }
      lastSizeRef.current = newSize;
      onResize(newSize.width, newSize.height);
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

  // ─── Handle positioning ────────────────────────────────────────────────────
  // Wrapper shares the canvas transform; coordinates are canvas pixels before
  // scale. Hit targets sit fully *outside* 0..W / 0..H so edge pixels stay
  // drawable (previously half-overlapped the border).

  const OUTSET = EDGE_THICKNESS / zoom;
  const cornerSize = HANDLE_SIZE / zoom;

  interface HandleDef {
    edge: ResizeEdge;
    style: React.CSSProperties;
  }

  const handles: HandleDef[] = [
    // ── Edges ──
    {
      edge: "n",
      style: {
        top: -OUTSET,
        left: cornerSize,
        right: cornerSize,
        height: OUTSET,
        cursor: CURSOR_MAP.n
      }
    },
    {
      edge: "s",
      style: {
        top: "100%",
        left: cornerSize,
        right: cornerSize,
        height: OUTSET,
        cursor: CURSOR_MAP.s
      }
    },
    {
      edge: "w",
      style: {
        left: -OUTSET,
        top: cornerSize,
        bottom: cornerSize,
        width: OUTSET,
        cursor: CURSOR_MAP.w
      }
    },
    {
      edge: "e",
      style: {
        left: "100%",
        top: cornerSize,
        bottom: cornerSize,
        width: OUTSET,
        cursor: CURSOR_MAP.e
      }
    },
    // ── Corners ──
    {
      edge: "nw",
      style: {
        top: -cornerSize,
        left: -cornerSize,
        width: cornerSize,
        height: cornerSize,
        cursor: CURSOR_MAP.nw
      }
    },
    {
      edge: "ne",
      style: {
        top: -cornerSize,
        right: -cornerSize,
        width: cornerSize,
        height: cornerSize,
        cursor: CURSOR_MAP.ne
      }
    },
    {
      edge: "sw",
      style: {
        bottom: -cornerSize,
        left: -cornerSize,
        width: cornerSize,
        height: cornerSize,
        cursor: CURSOR_MAP.sw
      }
    },
    {
      edge: "se",
      style: {
        bottom: -cornerSize,
        right: -cornerSize,
        width: cornerSize,
        height: cornerSize,
        cursor: CURSOR_MAP.se
      }
    }
  ];

  // The wrapper uses the same transform as the canvas so handles track it.
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
