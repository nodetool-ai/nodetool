/**
 * SketchCanvasResizeHandles
 *
 * Eight square handles (corners + edge midpoints) just outside the canvas for
 * drag-resize. Corners preserve the canvas aspect ratio (dominant axis).
 * Hold Alt to resize symmetrically from the canvas center (layers shift so
 * content stays visually centered).
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { SKETCH_Z_INDEX } from "./sketchStyles";
import { MOTION, BORDER_RADIUS } from "../ui_primitives";

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
    options?: {
      translateLayers?: { x: number; y: number };
      resizeFromCenter?: boolean;
    }
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

function altResizeFromCenterModifier(e: React.PointerEvent): boolean {
  if (e.altKey) {
    return true;
  }
  if (typeof e.getModifierState === "function" && e.getModifierState("Alt")) {
    return true;
  }
  const ne = e.nativeEvent as PointerEvent;
  if (typeof ne.getModifierState === "function" && ne.getModifierState("Alt")) {
    return true;
  }
  return ne.altKey;
}

function isCornerEdge(edge: ResizeEdge): boolean {
  return edge === "ne" || edge === "nw" || edge === "se" || edge === "sw";
}

/**
 * Corner drags: one uniform scale from the initial size so aspect ratio is
 * preserved. Uses whichever axis moved further relative to the starting size.
 */
function applyCornerUniformScale(
  origW: number,
  origH: number,
  tentativeW: number,
  tentativeH: number,
  minW: number,
  maxW: number,
  minH: number,
  maxH: number
): { width: number; height: number } {
  if (origW <= 0 || origH <= 0) {
    return {
      width: Math.round(tentativeW),
      height: Math.round(tentativeH)
    };
  }
  const sW = tentativeW / origW;
  const sH = tentativeH / origH;
  const s =
    Math.abs(sW - 1) >= Math.abs(sH - 1) ? sW : sH;
  const sLo = Math.max(minW / origW, minH / origH);
  const sHi = Math.min(maxW / origW, maxH / origH);
  const sClamped = Math.max(sLo, Math.min(sHi, s));
  return {
    width: Math.round(origW * sClamped),
    height: Math.round(origH * sClamped)
  };
}

/**
 * When the document grows from the top or left, paint layers must shift in
 * document space so pixels stay aligned (same incremental dW/dH as last emitted size).
 */
function layerTranslateForResizeEdge(
  edge: ResizeEdge,
  dW: number,
  dH: number
): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (edge === "w" || edge === "nw" || edge === "sw") {
    x = dW;
  }
  if (edge === "n" || edge === "ne" || edge === "nw") {
    y = dH;
  }
  return { x, y };
}

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
  zIndex: SKETCH_Z_INDEX.handles,
});

const handleStyles = css({
  position: "absolute",
  pointerEvents: "auto",
  touchAction: "none",
  backgroundColor: "var(--palette-c_overlay_strong)",
  border: "1px solid var(--palette-c_scrim_soft)",
  borderRadius: BORDER_RADIUS.xs,
  transition: MOTION.background,
  boxSizing: "border-box",
  "&:hover, &.active": {
    backgroundColor: "rgba(var(--palette-info-mainChannel) / 0.35)"
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
  } | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  /** Windows / capture-phase: synthetic React PointerEvents may miss Alt during drag. */
  const globalPointerAltRef = useRef(false);

  useEffect(() => {
    if (activeEdge === null) {
      return;
    }
    const onWinPointer = (ev: PointerEvent): void => {
      globalPointerAltRef.current =
        ev.altKey ||
        (typeof ev.getModifierState === "function" &&
          ev.getModifierState("Alt"));
    };
    window.addEventListener("pointermove", onWinPointer, { capture: true });
    window.addEventListener("pointerup", onWinPointer, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onWinPointer, { capture: true });
      window.removeEventListener("pointerup", onWinPointer, { capture: true });
    };
  }, [activeEdge]);

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

      if (isCornerEdge(edge)) {
        return applyCornerUniformScale(
          origW,
          origH,
          newW,
          newH,
          minWidth,
          maxWidth,
          minHeight,
          maxHeight
        );
      }

      return clampSize(newW, newH);
    },
    [zoom, clampSize, minWidth, maxWidth, minHeight, maxHeight]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, edge: ResizeEdge) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target instanceof HTMLElement) {
        e.target.setPointerCapture(e.pointerId);
      }

      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: canvasWidth,
        height: canvasHeight,
        edge
      };
      globalPointerAltRef.current = altResizeFromCenterModifier(e);
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
      const resizeFromCenter =
        altResizeFromCenterModifier(e) || globalPointerAltRef.current;
      const newSize = computeNewSize(
        drag.edge,
        dx,
        dy,
        drag.width,
        drag.height,
        resizeFromCenter
      );

      const last = lastSizeRef.current;
      if (
        last &&
        last.width === newSize.width &&
        last.height === newSize.height
      ) {
        return;
      }

      lastSizeRef.current = newSize;

      let translateLayers: { x: number; y: number } | undefined;
      if (resizeFromCenter && last) {
        const dW = newSize.width - last.width;
        const dH = newSize.height - last.height;
        if (dW !== 0 || dH !== 0) {
          translateLayers = { x: dW / 2, y: dH / 2 };
        }
      } else if (last) {
        const dW = newSize.width - last.width;
        const dH = newSize.height - last.height;
        const t = layerTranslateForResizeEdge(drag.edge, dW, dH);
        if (t.x !== 0 || t.y !== 0) {
          translateLayers = t;
        }
      }

      if (translateLayers && resizeFromCenter) {
        onResize(newSize.width, newSize.height, {
          translateLayers,
          resizeFromCenter: true
        });
      } else if (translateLayers) {
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
      if (e.target instanceof HTMLElement) {
        e.target.releasePointerCapture(e.pointerId);
      }

      dragStartRef.current = null;
      lastSizeRef.current = null;
      setActiveEdge(null);
      onResizeEnd?.();
    },
    [onResizeEnd]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current) {
        return;
      }
      if (e.target instanceof HTMLElement) {
        e.target.releasePointerCapture(e.pointerId);
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
          onPointerCancel={handlePointerCancel}
        />
      ))}
    </div>
  );
};

export default memo(SketchCanvasResizeHandles);
