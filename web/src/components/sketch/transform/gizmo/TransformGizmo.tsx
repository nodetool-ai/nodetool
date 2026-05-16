/**
 * TransformGizmo — declarative React/SVG transform handles.
 *
 * Replaces the imperative canvas painter (`transformGizmoPainter.ts`). The
 * component subscribes to:
 *   - TransformTool state via `useSyncExternalStore` (snapshot — document space)
 *   - Zustand for `zoom`, `pan`, document size, transform mode, active tool
 *   - ResizeObserver for container CSS size
 *
 * No DPR scaling: SVG works in CSS pixels natively, so the math matches
 * the canvas painter's `dpr = 1` case directly. Visual output is meant to
 * be pixel-identical to `paintTransformGizmo`.
 *
 * @module transform/gizmo/TransformGizmo
 */

import React, {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject
} from "react";
import type { Point } from "../../types";
import { isAffineTransform, isQuadTransform } from "../../types";
import { useSketchStore } from "../../state";
import {
  computeTransformedCenter,
  computeTransformedCorners
} from "../geometry/layerGeometry";
import { getTransformMode } from "../modes";
import type { TransformHandle } from "../../tools/transform/handleGeometry";
import type { TransformTool } from "../../tools/TransformTool";
import {
  HANDLE_SIZE,
  ROTATION_HANDLE_OFFSET,
  ROTATION_HANDLE_RADIUS_FACTOR,
  PIVOT_CROSSHAIR_SIZE,
  GIZMO_PRIMARY_COLOR,
  GIZMO_PRIMARY_SEMI,
  GIZMO_PRIMARY_FAINT,
  HANDLE_FILL_DEFAULT,
  HANDLE_FILL_HOVERED,
  GIZMO_LINE_WIDTH,
  GIZMO_LINE_WIDTH_HOVERED,
  BOUNDING_BOX_DASH_ON,
  BOUNDING_BOX_DASH_OFF
} from "../../tools/gizmo/gizmoConstants";
import { SKETCH_Z_INDEX } from "../../sketchStyles";

interface TransformGizmoProps {
  /** Sketch canvas container. Used for `ResizeObserver` and CSS size. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Shared TransformTool singleton (lifted from `getToolHandler("transform")`). */
  tool: TransformTool;
}

/** Convert document-space (docX, docY) to container CSS pixels. */
function docToCss(
  docX: number,
  docY: number,
  docW: number,
  docH: number,
  zoom: number,
  pan: Point,
  containerW: number,
  containerH: number
): Point {
  return {
    x: (docX - docW / 2) * zoom + containerW / 2 + pan.x,
    y: (docY - docH / 2) * zoom + containerH / 2 + pan.y
  };
}

const BOX_DASH = `${BOUNDING_BOX_DASH_ON} ${BOUNDING_BOX_DASH_OFF}`;

interface SquareHandleProps {
  cx: number;
  cy: number;
  isHovered: boolean;
}

function SquareHandle({ cx, cy, isHovered }: SquareHandleProps) {
  const hs = HANDLE_SIZE;
  return (
    <rect
      x={cx - hs / 2}
      y={cy - hs / 2}
      width={hs}
      height={hs}
      fill={isHovered ? HANDLE_FILL_HOVERED : HANDLE_FILL_DEFAULT}
      stroke={GIZMO_PRIMARY_COLOR}
      strokeWidth={isHovered ? GIZMO_LINE_WIDTH_HOVERED : GIZMO_LINE_WIDTH}
    />
  );
}

interface RotateHandleProps {
  topX: number;
  topY: number;
  /** Outward unit vector from the box center through the top edge midpoint. */
  ux: number;
  uy: number;
  isHovered: boolean;
}

function RotateHandle({ topX, topY, ux, uy, isHovered }: RotateHandleProps) {
  const handleX = topX + ux * ROTATION_HANDLE_OFFSET;
  const handleY = topY + uy * ROTATION_HANDLE_OFFSET;
  const r = HANDLE_SIZE * ROTATION_HANDLE_RADIUS_FACTOR;
  return (
    <g>
      <line
        x1={topX}
        y1={topY}
        x2={handleX}
        y2={handleY}
        stroke={GIZMO_PRIMARY_FAINT}
        strokeWidth={GIZMO_LINE_WIDTH}
      />
      <circle
        cx={handleX}
        cy={handleY}
        r={r}
        fill={isHovered ? HANDLE_FILL_HOVERED : HANDLE_FILL_DEFAULT}
        stroke={GIZMO_PRIMARY_COLOR}
        strokeWidth={isHovered ? GIZMO_LINE_WIDTH_HOVERED : GIZMO_LINE_WIDTH}
      />
    </g>
  );
}

interface PivotHandleProps {
  cx: number;
  cy: number;
  isHovered: boolean;
}

function PivotHandle({ cx, cy, isHovered }: PivotHandleProps) {
  const arm = PIVOT_CROSSHAIR_SIZE;
  const w = isHovered ? GIZMO_LINE_WIDTH_HOVERED : GIZMO_LINE_WIDTH;
  const r = 3;
  return (
    <g>
      <line
        x1={cx - arm}
        y1={cy}
        x2={cx + arm}
        y2={cy}
        stroke={GIZMO_PRIMARY_COLOR}
        strokeWidth={w}
      />
      <line
        x1={cx}
        y1={cy - arm}
        x2={cx}
        y2={cy + arm}
        stroke={GIZMO_PRIMARY_COLOR}
        strokeWidth={w}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={isHovered ? HANDLE_FILL_HOVERED : HANDLE_FILL_DEFAULT}
        stroke={GIZMO_PRIMARY_COLOR}
        strokeWidth={w}
      />
    </g>
  );
}

export function TransformGizmo({
  containerRef,
  tool
}: TransformGizmoProps): React.ReactElement | null {
  const snapshot = useSyncExternalStore(
    tool.subscribeGizmo,
    tool.getGizmoSnapshot,
    () => null
  );
  const zoom = useSketchStore((s) => s.zoom);
  const pan = useSketchStore((s) => s.pan);
  const docW = useSketchStore((s) => s.document.canvas.width);
  const docH = useSketchStore((s) => s.document.canvas.height);
  const mode = useSketchStore(
    (s) => s.toolSettings?.transform?.mode ?? "scale"
  );
  const activeTool = useSketchStore((s) => s.activeTool);

  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>(
    { w: 0, h: 0 }
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    // Initial measurement.
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const rect = entry.contentRect;
      setContainerSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  if (!snapshot || activeTool !== "transform") {
    return null;
  }
  if (containerSize.w <= 0 || containerSize.h <= 0) {
    return null;
  }

  const { transform, rasterBounds, pivot: pivotDoc, highlight } = snapshot;

  const handler = getTransformMode(mode);
  const visibleHandles = new Set<TransformHandle>(
    handler.supportsRotate
      ? [...handler.visibleHandles, "rotate"]
      : handler.visibleHandles
  );

  const toCss = (docX: number, docY: number): Point =>
    docToCss(docX, docY, docW, docH, zoom, pan, containerSize.w, containerSize.h);

  // ── Quad branch ────────────────────────────────────────────────────────
  if (isQuadTransform(transform)) {
    const corners = computeTransformedCorners(transform, rasterBounds);
    const screenCorners = corners.map((c) => toCss(c.x, c.y)) as [
      Point,
      Point,
      Point,
      Point
    ];
    const center = computeTransformedCenter(transform, rasterBounds);
    const screenCenter = toCss(center.x, center.y);

    const topMid: Point = {
      x: (screenCorners[0].x + screenCorners[1].x) / 2,
      y: (screenCorners[0].y + screenCorners[1].y) / 2
    };
    const bottomMid: Point = {
      x: (screenCorners[2].x + screenCorners[3].x) / 2,
      y: (screenCorners[2].y + screenCorners[3].y) / 2
    };
    const leftMid: Point = {
      x: (screenCorners[0].x + screenCorners[3].x) / 2,
      y: (screenCorners[0].y + screenCorners[3].y) / 2
    };
    const rightMid: Point = {
      x: (screenCorners[1].x + screenCorners[2].x) / 2,
      y: (screenCorners[1].y + screenCorners[2].y) / 2
    };

    const topDx = topMid.x - screenCenter.x;
    const topDy = topMid.y - screenCenter.y;
    const topLen = Math.hypot(topDx, topDy) || 1;
    const ux = topDx / topLen;
    const uy = topDy / topLen;

    const polyPoints = screenCorners
      .map((c) => `${c.x},${c.y}`)
      .join(" ");

    return (
      <svg
        data-testid="transform-gizmo"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: SKETCH_Z_INDEX.overlay,
          overflow: "visible"
        }}
      >
        <polygon
          points={polyPoints}
          fill="none"
          stroke={GIZMO_PRIMARY_SEMI}
          strokeWidth={GIZMO_LINE_WIDTH}
          strokeDasharray={BOX_DASH}
        />
        {visibleHandles.has("top-left") && (
          <SquareHandle
            cx={screenCorners[0].x}
            cy={screenCorners[0].y}
            isHovered={highlight === "top-left"}
          />
        )}
        {visibleHandles.has("top-right") && (
          <SquareHandle
            cx={screenCorners[1].x}
            cy={screenCorners[1].y}
            isHovered={highlight === "top-right"}
          />
        )}
        {visibleHandles.has("bottom-right") && (
          <SquareHandle
            cx={screenCorners[2].x}
            cy={screenCorners[2].y}
            isHovered={highlight === "bottom-right"}
          />
        )}
        {visibleHandles.has("bottom-left") && (
          <SquareHandle
            cx={screenCorners[3].x}
            cy={screenCorners[3].y}
            isHovered={highlight === "bottom-left"}
          />
        )}
        {visibleHandles.has("top") && (
          <SquareHandle
            cx={topMid.x}
            cy={topMid.y}
            isHovered={highlight === "top"}
          />
        )}
        {visibleHandles.has("bottom") && (
          <SquareHandle
            cx={bottomMid.x}
            cy={bottomMid.y}
            isHovered={highlight === "bottom"}
          />
        )}
        {visibleHandles.has("left") && (
          <SquareHandle
            cx={leftMid.x}
            cy={leftMid.y}
            isHovered={highlight === "left"}
          />
        )}
        {visibleHandles.has("right") && (
          <SquareHandle
            cx={rightMid.x}
            cy={rightMid.y}
            isHovered={highlight === "right"}
          />
        )}
        {visibleHandles.has("rotate") && (
          <RotateHandle
            topX={topMid.x}
            topY={topMid.y}
            ux={ux}
            uy={uy}
            isHovered={highlight === "rotate"}
          />
        )}
        {/* Quad-only transforms have no pivot crosshair. */}
      </svg>
    );
  }

  // ── Affine branch ──────────────────────────────────────────────────────
  const center = computeTransformedCenter(transform, rasterBounds);
  const screenCenter = toCss(center.x, center.y);
  const sx = isAffineTransform(transform) ? transform.scaleX : 1;
  const sy = isAffineTransform(transform) ? transform.scaleY : 1;
  const rotation = isAffineTransform(transform) ? transform.rotation : 0;
  const screenW = rasterBounds.width * sx * zoom;
  const screenH = rasterBounds.height * sy * zoom;
  const hw = screenW / 2;
  const hh = screenH / 2;
  const rotDeg = (rotation * 180) / Math.PI;

  const pivotScreen: Point | null = pivotDoc
    ? toCss(pivotDoc.x, pivotDoc.y)
    : screenCenter;

  return (
    <svg
      data-testid="transform-gizmo"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: SKETCH_Z_INDEX.overlay,
        overflow: "visible"
      }}
    >
      <g
        transform={`translate(${screenCenter.x} ${screenCenter.y}) rotate(${rotDeg})`}
      >
        <rect
          x={-hw}
          y={-hh}
          width={screenW}
          height={screenH}
          fill="none"
          stroke={GIZMO_PRIMARY_SEMI}
          strokeWidth={GIZMO_LINE_WIDTH}
          strokeDasharray={BOX_DASH}
        />
        {visibleHandles.has("top-left") && (
          <SquareHandle cx={-hw} cy={-hh} isHovered={highlight === "top-left"} />
        )}
        {visibleHandles.has("top-right") && (
          <SquareHandle cx={hw} cy={-hh} isHovered={highlight === "top-right"} />
        )}
        {visibleHandles.has("bottom-left") && (
          <SquareHandle
            cx={-hw}
            cy={hh}
            isHovered={highlight === "bottom-left"}
          />
        )}
        {visibleHandles.has("bottom-right") && (
          <SquareHandle
            cx={hw}
            cy={hh}
            isHovered={highlight === "bottom-right"}
          />
        )}
        {visibleHandles.has("top") && (
          <SquareHandle cx={0} cy={-hh} isHovered={highlight === "top"} />
        )}
        {visibleHandles.has("bottom") && (
          <SquareHandle cx={0} cy={hh} isHovered={highlight === "bottom"} />
        )}
        {visibleHandles.has("left") && (
          <SquareHandle cx={-hw} cy={0} isHovered={highlight === "left"} />
        )}
        {visibleHandles.has("right") && (
          <SquareHandle cx={hw} cy={0} isHovered={highlight === "right"} />
        )}
        {visibleHandles.has("rotate") && (
          <g>
            <line
              x1={0}
              y1={-hh}
              x2={0}
              y2={-hh - ROTATION_HANDLE_OFFSET}
              stroke={GIZMO_PRIMARY_FAINT}
              strokeWidth={GIZMO_LINE_WIDTH}
            />
            <circle
              cx={0}
              cy={-hh - ROTATION_HANDLE_OFFSET}
              r={HANDLE_SIZE * ROTATION_HANDLE_RADIUS_FACTOR}
              fill={
                highlight === "rotate"
                  ? HANDLE_FILL_HOVERED
                  : HANDLE_FILL_DEFAULT
              }
              stroke={GIZMO_PRIMARY_COLOR}
              strokeWidth={
                highlight === "rotate"
                  ? GIZMO_LINE_WIDTH_HOVERED
                  : GIZMO_LINE_WIDTH
              }
            />
          </g>
        )}
      </g>
      {pivotScreen && (
        <PivotHandle
          cx={pivotScreen.x}
          cy={pivotScreen.y}
          isHovered={highlight === "pivot"}
        />
      )}
    </svg>
  );
}
