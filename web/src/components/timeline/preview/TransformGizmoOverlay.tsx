/**
 * TransformGizmoOverlay — interactive transform handles for the selected
 * timeline clip, drawn over the preview frame.
 *
 * Ports the sketch editor's transform UX (dashed bounding box + square
 * corner/edge handles + a rotation handle) to the timeline. Reuses the
 * shared gizmo styling constants so the visual language matches the sketch
 * editor exactly.
 *
 * Geometry is derived from the same {@link buildTransformMatrix} the GPU
 * compositor uses, so the box always traces the rendered clip. Dragging
 * mutates the clip's {@link ClipTransform} live via `onChange`:
 *   - body            → move (position)
 *   - corner handles  → scale around the opposite corner (Shift = uniform)
 *   - edge handles    → scale one axis around the opposite edge
 *   - rotation handle → rotate around the box center (Shift = 15° snap)
 *
 * @module timeline/preview/TransformGizmoOverlay
 */

import React, { useRef, useState } from "react";
import type { ClipTransform } from "@nodetool-ai/timeline";

import { buildTransformMatrix, containBaseScale } from "./gpu/transform";
import { PREVIEW_OVERLAY_Z } from "./sceneModel";
import {
  HANDLE_SIZE,
  ROTATION_HANDLE_OFFSET,
  ROTATION_HANDLE_RADIUS_FACTOR,
  PIVOT_CROSSHAIR_SIZE,
  PIVOT_SNAP_DISTANCE,
  GIZMO_PRIMARY_COLOR,
  GIZMO_PRIMARY_SEMI,
  GIZMO_PRIMARY_FAINT,
  HANDLE_FILL_DEFAULT,
  HANDLE_FILL_HOVERED,
  GIZMO_LINE_WIDTH,
  GIZMO_LINE_WIDTH_HOVERED,
  BOUNDING_BOX_DASH_ON,
  BOUNDING_BOX_DASH_OFF
} from "../../sketch/tools/gizmo/gizmoConstants";
import { ClipTransformContextMenu } from "./ClipTransformContextMenu";

interface Point {
  x: number;
  y: number;
}

const IDENTITY_TRANSFORM: ClipTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 }
};

const BOX_DASH = `${BOUNDING_BOX_DASH_ON} ${BOUNDING_BOX_DASH_OFF}`;
const ROTATION_SNAP_RAD = (15 * Math.PI) / 180;

type CornerHandle = "tl" | "tr" | "br" | "bl";
type EdgeHandle = "t" | "r" | "b" | "l";
type ScaleHandle = CornerHandle | EdgeHandle;
type GizmoTarget = ScaleHandle | "rotate" | "pivot" | "body";

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Snap a normalized [0,1] coord to 0/0.5/1 when within the pixel threshold. */
const snapAnchor = (norm01: number, dimPx: number): number => {
  for (const target of [0, 0.5, 1]) {
    if (Math.abs(norm01 - target) * dimPx < PIVOT_SNAP_DISTANCE) {
      return target;
    }
  }
  return clamp01(norm01);
};

export interface TransformGizmoOverlayProps {
  /** Selected clip id (target of mutations). */
  clipId: string;
  /** Current transform (undefined → identity). */
  transform: ClipTransform | undefined;
  /** Source pixel width of the clip's decoded media. */
  sourceWidth: number;
  /** Source pixel height of the clip's decoded media. */
  sourceHeight: number;
  /** Sequence pixel width — `transform.position` is stored in this space. */
  sequenceWidth: number;
  /** Sequence pixel height — `transform.position` is stored in this space. */
  sequenceHeight: number;
  /** Frame element CSS width (px). */
  frameWidth: number;
  /** Frame element CSS height (px). */
  frameHeight: number;
  /** Commit a new transform for the clip. */
  onChange: (clipId: string, transform: ClipTransform) => void;
  /**
   * Fired once when any gizmo gesture begins (pointerdown on the body, a
   * scale/rotate/pivot handle). Always paired with exactly one
   * {@link onDragEnd} call. Lets the caller batch the gesture's `onChange`
   * calls into a single undo entry.
   */
  onDragStart?: () => void;
  /** Fired once when the active gesture ends (pointerup or pointercancel). */
  onDragEnd?: () => void;
}

/** clip space [-1,1]² → frame CSS pixels (clip Y up → screen Y down). */
function clipToCss(
  cx: number,
  cy: number,
  frameW: number,
  frameH: number
): Point {
  return { x: ((cx + 1) / 2) * frameW, y: ((1 - cy) / 2) * frameH };
}

interface BoxGeometry {
  /** [TL, TR, BR, BL] in frame CSS px. */
  corners: [Point, Point, Point, Point];
  center: Point;
  /** Pivot (anchor) point in frame CSS px. */
  pivot: Point;
}

function computeGeometry(
  t: ClipTransform,
  srcW: number,
  srcH: number,
  seqW: number,
  seqH: number,
  frameW: number,
  frameH: number
): BoxGeometry {
  const base = containBaseScale(srcW, srcH, seqW, seqH);
  const m = buildTransformMatrix(t, base, seqW, seqH);
  const at = (qx: number, qy: number): Point =>
    clipToCss(
      m[0] * qx + m[4] * qy + m[12],
      m[1] * qx + m[5] * qy + m[13],
      frameW,
      frameH
    );
  const corners: [Point, Point, Point, Point] = [
    at(-1, 1),
    at(1, 1),
    at(1, -1),
    at(-1, -1)
  ];
  const center = at(0, 0);
  // The anchor point's quad coordinate; buildTransformMatrix keeps it fixed
  // under rotation/scale, so it is the true pivot.
  const pivot = at((t.anchor.x - 0.5) * 2, (t.anchor.y - 0.5) * 2);
  return { corners, center, pivot };
}

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
const len = (a: Point): number => Math.hypot(a.x, a.y) || 1;
const norm = (a: Point): Point => {
  const l = len(a);
  return { x: a.x / l, y: a.y / l };
};
const mid = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2
});

/** Drag session captured on pointer down. */
interface DragSession {
  target: GizmoTarget;
  startTransform: ClipTransform;
  startPointer: Point;
  /** Fixed (anchored) point in CSS for scale ops. */
  fixed: Point;
  /** Box local axes (unit) at drag start. */
  axisU: Point;
  axisV: Point;
  /** Distance from fixed point to dragged handle, along each axis, at start. */
  startProjU: number;
  startProjV: number;
  /** Box center in CSS at drag start (kept fixed during scale). */
  startCenter: Point;
  /** Reference point for rotation (the pivot) in CSS at drag start. */
  rotationRef: Point;
  /** Angle from rotation ref to pointer at drag start (screen radians). */
  startAngle: number;
  /** Top-left corner + box axis lengths at start (for pivot mapping). */
  tl: Point;
  widthU: number;
  heightV: number;
}

interface SquareHandleProps {
  cx: number;
  cy: number;
  cursor: string;
  onDown: (e: React.PointerEvent) => void;
}

function SquareHandle({ cx, cy, cursor, onDown }: SquareHandleProps) {
  const hs = HANDLE_SIZE;
  return (
    <rect
      x={cx - hs / 2}
      y={cy - hs / 2}
      width={hs}
      height={hs}
      fill={HANDLE_FILL_DEFAULT}
      stroke={GIZMO_PRIMARY_COLOR}
      strokeWidth={GIZMO_LINE_WIDTH}
      style={{ cursor, pointerEvents: "all" }}
      onPointerDown={onDown}
      onPointerEnter={(e) => {
        (e.currentTarget as SVGRectElement).setAttribute(
          "fill",
          HANDLE_FILL_HOVERED
        );
        (e.currentTarget as SVGRectElement).setAttribute(
          "stroke-width",
          String(GIZMO_LINE_WIDTH_HOVERED)
        );
      }}
      onPointerLeave={(e) => {
        (e.currentTarget as SVGRectElement).setAttribute(
          "fill",
          HANDLE_FILL_DEFAULT
        );
        (e.currentTarget as SVGRectElement).setAttribute(
          "stroke-width",
          String(GIZMO_LINE_WIDTH)
        );
      }}
    />
  );
}

export function TransformGizmoOverlay({
  clipId,
  transform,
  sourceWidth,
  sourceHeight,
  sequenceWidth,
  sequenceHeight,
  frameWidth,
  frameHeight,
  onChange,
  onDragStart,
  onDragEnd
}: TransformGizmoOverlayProps): React.ReactElement | null {
  const dragRef = useRef<DragSession | null>(null);
  // Frame rect at gesture start. The frame cannot move while a drag holds
  // pointer capture, so caching it here avoids a `getBoundingClientRect`
  // (forced layout) on every pointermove. Cleared on drag end; non-drag
  // geometry reads (resize) go through the frame-size ResizeObserver in
  // PreviewCompositor, which is untouched by this cache.
  const dragRectRef = useRef<DOMRect | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    sequenceWidth <= 0 ||
    sequenceHeight <= 0 ||
    frameWidth <= 0 ||
    frameHeight <= 0
  ) {
    return null;
  }

  const t = transform ?? IDENTITY_TRANSFORM;
  const geo = computeGeometry(
    t,
    sourceWidth,
    sourceHeight,
    sequenceWidth,
    sequenceHeight,
    frameWidth,
    frameHeight
  );
  const [tl, tr, br, bl] = geo.corners;

  const topMid = mid(tl, tr);
  const rightMid = mid(tr, br);
  const bottomMid = mid(br, bl);
  const leftMid = mid(bl, tl);

  // Outward unit vector through the top edge midpoint (for the rotate stem).
  const outward = norm(sub(topMid, geo.center));
  const rotHandle: Point = {
    x: topMid.x + outward.x * ROTATION_HANDLE_OFFSET,
    y: topMid.y + outward.y * ROTATION_HANDLE_OFFSET
  };

  /** CSS px → sequence-px position delta along each axis. */
  const cssToPosX = (dxCss: number): number =>
    (dxCss * sequenceWidth) / frameWidth;
  const cssToPosY = (dyCss: number): number =>
    (dyCss * sequenceHeight) / frameHeight;

  const fixedPointFor = (target: ScaleHandle): Point => {
    switch (target) {
      case "tl":
        return br;
      case "tr":
        return bl;
      case "br":
        return tl;
      case "bl":
        return tr;
      case "t":
        return bottomMid;
      case "b":
        return topMid;
      case "l":
        return rightMid;
      case "r":
        return leftMid;
    }
  };

  const movingPointFor = (target: ScaleHandle): Point => {
    switch (target) {
      case "tl":
        return tl;
      case "tr":
        return tr;
      case "br":
        return br;
      case "bl":
        return bl;
      case "t":
        return topMid;
      case "b":
        return bottomMid;
      case "l":
        return leftMid;
      case "r":
        return rightMid;
    }
  };

  const scalesX = (target: ScaleHandle): boolean => target !== "t" && target !== "b";
  const scalesY = (target: ScaleHandle): boolean => target !== "l" && target !== "r";

  const svgOf = (e: React.PointerEvent): SVGSVGElement => {
    const el = e.currentTarget as SVGElement;
    return (el.ownerSVGElement ?? el) as SVGSVGElement;
  };

  const pointerInFrame = (e: React.PointerEvent): Point => {
    const rect = dragRectRef.current ?? svgOf(e).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const beginDrag = (target: GizmoTarget) => (e: React.PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const svg = svgOf(e);
    svg.setPointerCapture?.(e.pointerId);
    svg.focus?.({ preventScroll: true });
    // Cache once per gesture — read by `pointerInFrame` for every subsequent
    // pointermove instead of re-querying layout each time.
    dragRectRef.current = svg.getBoundingClientRect();
    const axisU = norm(sub(tr, tl));
    const axisV = norm(sub(bl, tl));
    const pointer = pointerInFrame(e);
    let fixed = geo.center;
    let startProjU = 1;
    let startProjV = 1;
    if (target !== "rotate" && target !== "body" && target !== "pivot") {
      fixed = fixedPointFor(target);
      const moving = movingPointFor(target);
      const rel = sub(moving, fixed);
      startProjU = dot(rel, axisU);
      startProjV = dot(rel, axisV);
    }
    dragRef.current = {
      target,
      startTransform: {
        position: { ...t.position },
        scale: { ...t.scale },
        rotation: t.rotation,
        anchor: { ...t.anchor }
      },
      startPointer: pointer,
      fixed,
      axisU,
      axisV,
      startProjU,
      startProjV,
      startCenter: geo.center,
      rotationRef: geo.pivot,
      startAngle: Math.atan2(pointer.y - geo.pivot.y, pointer.x - geo.pivot.x),
      tl,
      widthU: len(sub(tr, tl)),
      heightV: len(sub(bl, tl))
    };
    onDragStart?.();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    e.preventDefault();
    const pointer = pointerInFrame(e);
    const start = drag.startTransform;

    if (drag.target === "body") {
      const dx = pointer.x - drag.startPointer.x;
      const dy = pointer.y - drag.startPointer.y;
      onChange(clipId, {
        ...start,
        position: {
          x: start.position.x + cssToPosX(dx),
          y: start.position.y + cssToPosY(dy)
        }
      });
      return;
    }

    if (drag.target === "rotate") {
      const angle = Math.atan2(
        pointer.y - drag.rotationRef.y,
        pointer.x - drag.rotationRef.x
      );
      // Screen angle is the negative of clip rotation. The matrix keeps the
      // pivot fixed, so no position compensation is needed.
      let next = start.rotation - (angle - drag.startAngle);
      if (e.shiftKey) {
        next = Math.round(next / ROTATION_SNAP_RAD) * ROTATION_SNAP_RAD;
      }
      onChange(clipId, { ...start, rotation: next });
      return;
    }

    if (drag.target === "pivot") {
      // Map the pointer onto the box's local axes → normalized anchor, then
      // compensate position so the rendered clip stays put (only the pivot
      // moves). Y is flipped: anchor.y = 1 at the top edge.
      const rel = sub(pointer, drag.tl);
      const projU = dot(rel, drag.axisU) / (drag.widthU || 1);
      const projV = dot(rel, drag.axisV) / (drag.heightV || 1);
      const anchor = {
        x: snapAnchor(projU, drag.widthU),
        y: snapAnchor(1 - projV, drag.heightV)
      };
      const candidate: ClipTransform = { ...start, anchor };
      onChange(clipId, keepCenter(candidate, start, drag.startCenter));
      return;
    }

    // Scale handles.
    const rel = sub(pointer, drag.fixed);
    let factorU = scalesX(drag.target)
      ? dot(rel, drag.axisU) / (drag.startProjU || 1)
      : 1;
    let factorV = scalesY(drag.target)
      ? dot(rel, drag.axisV) / (drag.startProjV || 1)
      : 1;

    const isCorner =
      drag.target === "tl" ||
      drag.target === "tr" ||
      drag.target === "br" ||
      drag.target === "bl";
    if (isCorner && e.shiftKey) {
      // Uniform scale: lock both axes to the dominant factor.
      const f =
        Math.abs(factorU) > Math.abs(factorV) ? factorU : factorV;
      factorU = f;
      factorV = f;
    }

    const clampF = (f: number): number =>
      Math.sign(f || 1) * Math.max(0.01, Math.abs(f));
    const candidate: ClipTransform = {
      ...start,
      scale: {
        x: scalesX(drag.target) ? start.scale.x * clampF(factorU) : start.scale.x,
        y: scalesY(drag.target) ? start.scale.y * clampF(factorV) : start.scale.y
      }
    };
    onChange(clipId, keepFixed(candidate, start, drag));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const svg = svgOf(e);
      if (svg.hasPointerCapture?.(e.pointerId)) {
        svg.releasePointerCapture(e.pointerId);
      }
      dragRef.current = null;
      dragRectRef.current = null;
      onDragEnd?.();
    }
  };

  /**
   * Adjust `candidate.position` so the box's fixed (anchored) corner stays
   * put after a scale change, giving "scale from opposite corner" behavior.
   */
  const keepFixed = (
    candidate: ClipTransform,
    start: ClipTransform,
    drag: DragSession
  ): ClipTransform => {
    const g = computeGeometry(
      candidate,
      sourceWidth,
      sourceHeight,
      sequenceWidth,
      sequenceHeight,
      frameWidth,
      frameHeight
    );
    // Re-derive the fixed corner position under the new scale.
    const fixedNow = fixedPointFromGeometry(g, drag.target as ScaleHandle);
    const dx = drag.fixed.x - fixedNow.x;
    const dy = drag.fixed.y - fixedNow.y;
    return {
      ...candidate,
      position: {
        x: start.position.x + cssToPosX(dx),
        y: start.position.y + cssToPosY(dy)
      }
    };
  };

  /** Keep the box center fixed after a rotation change. */
  const keepCenter = (
    candidate: ClipTransform,
    start: ClipTransform,
    startCenter: Point
  ): ClipTransform => {
    const g = computeGeometry(
      candidate,
      sourceWidth,
      sourceHeight,
      sequenceWidth,
      sequenceHeight,
      frameWidth,
      frameHeight
    );
    const dx = startCenter.x - g.center.x;
    const dy = startCenter.y - g.center.y;
    return {
      ...candidate,
      position: {
        x: start.position.x + cssToPosX(dx),
        y: start.position.y + cssToPosY(dy)
      }
    };
  };

  const fixedPointFromGeometry = (
    g: BoxGeometry,
    target: ScaleHandle
  ): Point => {
    const [gtl, gtr, gbr, gbl] = g.corners;
    switch (target) {
      case "tl":
        return gbr;
      case "tr":
        return gbl;
      case "br":
        return gtl;
      case "bl":
        return gtr;
      case "t":
        return mid(gbr, gbl);
      case "b":
        return mid(gtl, gtr);
      case "l":
        return mid(gtr, gbr);
      case "r":
        return mid(gbl, gtl);
    }
  };

  // ── Quick transform operations (context menu + keyboard) ────────────────
  const rotateBy = (rad: number) =>
    onChange(clipId, { ...t, rotation: t.rotation + rad });
  const flipH = () =>
    onChange(clipId, { ...t, scale: { ...t.scale, x: -t.scale.x } });
  const flipV = () =>
    onChange(clipId, { ...t, scale: { ...t.scale, y: -t.scale.y } });
  const reset = () =>
    onChange(clipId, {
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0.5, y: 0.5 }
    });
  const nudge = (dxPx: number, dyPx: number) =>
    onChange(clipId, {
      ...t,
      position: { x: t.position.x + dxPx, y: t.position.y + dyPx }
    });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case "ArrowLeft":
        nudge(-step, 0);
        break;
      case "ArrowRight":
        nudge(step, 0);
        break;
      case "ArrowUp":
        nudge(0, -step);
        break;
      case "ArrowDown":
        nudge(0, step);
        break;
      case ".":
        reset();
        break;
      default:
        return;
    }
    // Only swallow keys we actually handled, so frame-stepping still works
    // when the gizmo is not the keyboard target.
    e.preventDefault();
    e.stopPropagation();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  const polyPoints = geo.corners.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <>
    <svg
      data-testid="timeline-transform-gizmo"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        zIndex: PREVIEW_OVERLAY_Z.gizmo,
        pointerEvents: "none",
        touchAction: "none",
        outline: "none"
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Body — drag to move. */}
      <polygon
        points={polyPoints}
        fill="transparent"
        stroke={GIZMO_PRIMARY_SEMI}
        strokeWidth={GIZMO_LINE_WIDTH}
        strokeDasharray={BOX_DASH}
        style={{ cursor: "move", pointerEvents: "all" }}
        onPointerDown={beginDrag("body")}
      />

      {/* Rotation stem + handle. */}
      <line
        x1={topMid.x}
        y1={topMid.y}
        x2={rotHandle.x}
        y2={rotHandle.y}
        stroke={GIZMO_PRIMARY_FAINT}
        strokeWidth={GIZMO_LINE_WIDTH}
      />
      <circle
        cx={rotHandle.x}
        cy={rotHandle.y}
        r={HANDLE_SIZE * ROTATION_HANDLE_RADIUS_FACTOR}
        fill={HANDLE_FILL_DEFAULT}
        stroke={GIZMO_PRIMARY_COLOR}
        strokeWidth={GIZMO_LINE_WIDTH}
        style={{ cursor: "grab", pointerEvents: "all" }}
        onPointerDown={beginDrag("rotate")}
      />

      {/* Corner handles. */}
      <SquareHandle cx={tl.x} cy={tl.y} cursor="nwse-resize" onDown={beginDrag("tl")} />
      <SquareHandle cx={tr.x} cy={tr.y} cursor="nesw-resize" onDown={beginDrag("tr")} />
      <SquareHandle cx={br.x} cy={br.y} cursor="nwse-resize" onDown={beginDrag("br")} />
      <SquareHandle cx={bl.x} cy={bl.y} cursor="nesw-resize" onDown={beginDrag("bl")} />

      {/* Edge handles. */}
      <SquareHandle cx={topMid.x} cy={topMid.y} cursor="ns-resize" onDown={beginDrag("t")} />
      <SquareHandle cx={rightMid.x} cy={rightMid.y} cursor="ew-resize" onDown={beginDrag("r")} />
      <SquareHandle cx={bottomMid.x} cy={bottomMid.y} cursor="ns-resize" onDown={beginDrag("b")} />
      <SquareHandle cx={leftMid.x} cy={leftMid.y} cursor="ew-resize" onDown={beginDrag("l")} />

      {/* Pivot crosshair — drag to move the rotation/scale center. */}
      <g
        style={{ cursor: "move", pointerEvents: "all" }}
        onPointerDown={beginDrag("pivot")}
        data-testid="timeline-transform-pivot"
      >
        <circle cx={geo.pivot.x} cy={geo.pivot.y} r={PIVOT_CROSSHAIR_SIZE + 2} fill="transparent" />
        <line
          x1={geo.pivot.x - PIVOT_CROSSHAIR_SIZE}
          y1={geo.pivot.y}
          x2={geo.pivot.x + PIVOT_CROSSHAIR_SIZE}
          y2={geo.pivot.y}
          stroke={GIZMO_PRIMARY_COLOR}
          strokeWidth={GIZMO_LINE_WIDTH}
        />
        <line
          x1={geo.pivot.x}
          y1={geo.pivot.y - PIVOT_CROSSHAIR_SIZE}
          x2={geo.pivot.x}
          y2={geo.pivot.y + PIVOT_CROSSHAIR_SIZE}
          stroke={GIZMO_PRIMARY_COLOR}
          strokeWidth={GIZMO_LINE_WIDTH}
        />
        <circle
          cx={geo.pivot.x}
          cy={geo.pivot.y}
          r={3}
          fill={HANDLE_FILL_DEFAULT}
          stroke={GIZMO_PRIMARY_COLOR}
          strokeWidth={GIZMO_LINE_WIDTH}
        />
      </g>

    </svg>
    {menuPos && (
      <ClipTransformContextMenu
        open
        position={menuPos}
        onClose={() => setMenuPos(null)}
        onReset={reset}
        onRotate90CW={() => rotateBy(Math.PI / 2)}
        onRotate90CCW={() => rotateBy(-Math.PI / 2)}
        onRotate180={() => rotateBy(Math.PI)}
        onFlipHorizontal={flipH}
        onFlipVertical={flipV}
      />
    )}
    </>
  );
}
