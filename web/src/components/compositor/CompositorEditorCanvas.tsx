/** @jsxImportSource @emotion/react */
/**
 * CompositorEditorCanvas — the interactive stage.
 *
 * Renders the live WebGPU composite (via {@link useWebGPUPreview}) scaled to
 * fit, with an SVG transform gizmo over the selected layer: drag the body to
 * move, corner/edge handles to scale, the top handle to rotate. Drags update a
 * local "preview" transform for instant feedback and commit on pointer-up.
 */

import React, {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { LayerTransform2D } from "@nodetool-ai/gpu/webgpu";

import { EmptyState } from "../ui_primitives";
import { useWebGPUPreview, type PreviewLayer } from "./useWebGPUPreview";
import type { BitmapMap } from "./useLayerBitmaps";
import {
  applyMove,
  applyRotate,
  applyScale,
  canvasToLayerTexel,
  layerCorners,
  midpoint,
  pointInLayer,
  type GizmoHandle,
  type Vec2
} from "./geometry";

export interface CanvasLayer {
  id: string;
  opacity: number;
  blendModeId: number;
  visible: boolean;
  transform?: LayerTransform2D;
}

export interface CompositorEditorCanvasProps {
  canvasWidth: number;
  canvasHeight: number;
  layers: CanvasLayer[];
  bitmaps: BitmapMap;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Live transform during a drag (not persisted). */
  onTransformPreview: (id: string, transform: LayerTransform2D) => void;
  /** Final transform when a drag ends (persisted). */
  onTransformCommit: (id: string, transform: LayerTransform2D) => void;
}

const HANDLE_HIT_RADIUS = 11;
const ROTATE_OFFSET_PX = 26;

const styles = (theme: Theme) =>
  css({
    "&.compositor-stage": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      background: theme.vars.palette.grey[900],
      "--checker": theme.vars.palette.grey[800]
    },
    ".stage-box": {
      position: "relative",
      // Checkerboard backdrop for transparency.
      backgroundColor: theme.vars.palette.grey[1000] ?? "#111",
      backgroundImage:
        "linear-gradient(45deg, var(--checker) 25%, transparent 25%), linear-gradient(-45deg, var(--checker) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--checker) 75%), linear-gradient(-45deg, transparent 75%, var(--checker) 75%)",
      backgroundSize: "16px 16px",
      backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
      boxShadow: theme.shadows[6],
      touchAction: "none"
    },
    ".preview-canvas": {
      display: "block",
      width: "100%",
      height: "100%"
    },
    ".gizmo": {
      position: "absolute",
      inset: 0,
      overflow: "visible",
      pointerEvents: "none"
    },
    ".gizmo .outline": {
      fill: "none",
      stroke: theme.vars.palette.primary.main,
      strokeWidth: 1.5
    },
    ".gizmo .handle": {
      fill: theme.vars.palette.background.paper,
      stroke: theme.vars.palette.primary.main,
      strokeWidth: 1.5
    },
    ".gizmo .rotate-line": {
      stroke: theme.vars.palette.primary.main,
      strokeWidth: 1.5
    },
    ".unavailable": {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  });

interface DragState {
  handle: GizmoHandle;
  layerId: string;
  start: LayerTransform2D;
  startPointer: Vec2;
  startAngle: number;
}

const CORNER_HANDLES: GizmoHandle[] = ["tl", "tr", "br", "bl"];
const EDGE_HANDLES: GizmoHandle[] = ["t", "r", "b", "l"];

const CompositorEditorCanvasInner: React.FC<CompositorEditorCanvasProps> = ({
  canvasWidth,
  canvasHeight,
  layers,
  bitmaps,
  selectedId,
  onSelect,
  onTransformPreview,
  onTransformCommit
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef<DragState | null>(null);
  const lastTransformRef = useRef<LayerTransform2D | null>(null);

  // Dimensions per layer come from the decoded bitmap.
  const dimsFor = useCallback(
    (id: string): { width: number; height: number } => {
      const b = bitmaps[id];
      return { width: b?.width ?? 1, height: b?.height ?? 1 };
    },
    [bitmaps]
  );

  const previewLayers = useMemo<PreviewLayer[]>(
    () =>
      layers.map((l) => {
        const { width, height } = dimsFor(l.id);
        return {
          id: l.id,
          bitmap: bitmaps[l.id]?.bitmap ?? null,
          width,
          height,
          opacity: l.opacity,
          blendModeId: l.blendModeId,
          visible: l.visible,
          transform: l.transform
        };
      }),
    [layers, bitmaps, dimsFor]
  );

  const { status } = useWebGPUPreview(
    canvasRef,
    canvasWidth,
    canvasHeight,
    previewLayers
  );

  // Fit-to-container scale.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const viewScale = useMemo(() => {
    if (canvasWidth <= 0 || canvasHeight <= 0) return 1;
    const pad = 32;
    const availW = Math.max(1, containerSize.w - pad);
    const availH = Math.max(1, containerSize.h - pad);
    return Math.min(availW / canvasWidth, availH / canvasHeight, 4);
  }, [canvasWidth, canvasHeight, containerSize]);

  const transformForSelected = useCallback((): LayerTransform2D | null => {
    if (!selectedId) return null;
    const layer = layers.find((l) => l.id === selectedId);
    if (!layer) return null;
    const { width, height } = dimsFor(selectedId);
    return (
      layer.transform ?? {
        x: width / 2,
        y: height / 2,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      }
    );
  }, [selectedId, layers, dimsFor]);

  // ── Gizmo geometry in canvas space ──────────────────────────────
  const gizmo = useMemo(() => {
    const t = selectedId ? transformForSelected() : null;
    if (!selectedId || !t) return null;
    const { width, height } = dimsFor(selectedId);
    const [tl, tr, br, bl] = layerCorners(t, width, height);
    const corners: Record<string, Vec2> = { tl, tr, br, bl };
    const edges: Record<string, Vec2> = {
      t: midpoint(tl, tr),
      r: midpoint(tr, br),
      b: midpoint(br, bl),
      l: midpoint(bl, tl)
    };
    const center = { x: t.x, y: t.y };
    const topMid = edges.t;
    const dx = topMid.x - center.x;
    const dy = topMid.y - center.y;
    const len = Math.hypot(dx, dy) || 1;
    const rotate = {
      x: topMid.x + (dx / len) * (ROTATE_OFFSET_PX / viewScale),
      y: topMid.y + (dy / len) * (ROTATE_OFFSET_PX / viewScale)
    };
    return { tl, tr, br, bl, corners, edges, topMid, rotate, width, height };
  }, [selectedId, transformForSelected, dimsFor, viewScale]);

  // Convert a client point to canvas space.
  const clientToCanvas = useCallback(
    (clientX: number, clientY: number): Vec2 => {
      const box = boxRef.current;
      if (!box) return { x: 0, y: 0 };
      const rect = box.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / viewScale,
        y: (clientY - rect.top) / viewScale
      };
    },
    [viewScale]
  );

  const hitHandle = useCallback(
    (p: Vec2): GizmoHandle | null => {
      if (!gizmo) return null;
      const r = HANDLE_HIT_RADIUS / viewScale;
      const near = (h: Vec2) => Math.hypot(p.x - h.x, p.y - h.y) <= r;
      if (near(gizmo.rotate)) return "rotate";
      for (const h of CORNER_HANDLES) {
        if (near(gizmo.corners[h])) return h;
      }
      for (const h of EDGE_HANDLES) {
        if (near(gizmo.edges[h])) return h;
      }
      return null;
    },
    [gizmo, viewScale]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const p = clientToCanvas(e.clientX, e.clientY);

      // 1) Handle of the currently-selected layer.
      const handle = hitHandle(p);
      if (handle && selectedId) {
        const start = transformForSelected();
        if (start) {
          dragRef.current = {
            handle,
            layerId: selectedId,
            start,
            startPointer: p,
            startAngle: Math.atan2(p.y - start.y, p.x - start.x)
          };
          (e.target as Element).setPointerCapture?.(e.pointerId);
          return;
        }
      }

      // 2) Inside the selected layer → move it.
      if (selectedId) {
        const { width, height } = dimsFor(selectedId);
        const t = transformForSelected();
        if (t && pointInLayer(t, width, height, p)) {
          dragRef.current = {
            handle: "move",
            layerId: selectedId,
            start: t,
            startPointer: p,
            startAngle: 0
          };
          (e.target as Element).setPointerCapture?.(e.pointerId);
          return;
        }
      }

      // 3) Topmost visible layer under the cursor → select & move.
      for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (!layer.visible) continue;
        const { width, height } = dimsFor(layer.id);
        const t =
          layer.transform ?? {
            x: width / 2,
            y: height / 2,
            scaleX: 1,
            scaleY: 1,
            rotation: 0
          };
        if (pointInLayer(t, width, height, p)) {
          onSelect(layer.id);
          dragRef.current = {
            handle: "move",
            layerId: layer.id,
            start: t,
            startPointer: p,
            startAngle: 0
          };
          (e.target as Element).setPointerCapture?.(e.pointerId);
          return;
        }
      }

      // 4) Empty space → deselect.
      onSelect(null);
    },
    [
      clientToCanvas,
      hitHandle,
      selectedId,
      transformForSelected,
      dimsFor,
      layers,
      onSelect
    ]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const p = clientToCanvas(e.clientX, e.clientY);
      const { width, height } = dimsFor(drag.layerId);
      let next: LayerTransform2D;
      if (drag.handle === "move") {
        next = applyMove(
          drag.start,
          p.x - drag.startPointer.x,
          p.y - drag.startPointer.y
        );
      } else if (drag.handle === "rotate") {
        next = applyRotate(drag.start, drag.startAngle, p);
      } else {
        next = applyScale(drag.start, width, height, drag.handle, p, e.shiftKey);
      }
      lastTransformRef.current = next;
      onTransformPreview(drag.layerId, next);
    },
    [clientToCanvas, dimsFor, onTransformPreview]
  );

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const final = lastTransformRef.current;
    lastTransformRef.current = null;
    if (final) onTransformCommit(drag.layerId, final);
  }, [onTransformCommit]);

  const boxStyle: React.CSSProperties = {
    width: Math.max(1, canvasWidth * viewScale),
    height: Math.max(1, canvasHeight * viewScale)
  };

  // SVG uses canvas-space coords scaled into display px via a viewBox.
  const svgViewBox = `0 0 ${Math.max(1, canvasWidth)} ${Math.max(1, canvasHeight)}`;
  const handleSizeCanvas = (HANDLE_HIT_RADIUS * 1.4) / viewScale;

  return (
    <div ref={containerRef} css={cssStyles} className="compositor-stage">
      <div ref={boxRef} className="stage-box" style={boxStyle}>
        <canvas ref={canvasRef} className="preview-canvas" />
        {status !== "unavailable" && gizmo && (
          <svg
            className="gizmo"
            viewBox={svgViewBox}
            preserveAspectRatio="none"
            width="100%"
            height="100%"
          >
            <polygon
              className="outline"
              points={`${gizmo.tl.x},${gizmo.tl.y} ${gizmo.tr.x},${gizmo.tr.y} ${gizmo.br.x},${gizmo.br.y} ${gizmo.bl.x},${gizmo.bl.y}`}
              vectorEffect="non-scaling-stroke"
            />
            <line
              className="rotate-line"
              x1={gizmo.topMid.x}
              y1={gizmo.topMid.y}
              x2={gizmo.rotate.x}
              y2={gizmo.rotate.y}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              className="handle"
              cx={gizmo.rotate.x}
              cy={gizmo.rotate.y}
              r={handleSizeCanvas / 2}
              vectorEffect="non-scaling-stroke"
            />
            {[...CORNER_HANDLES, ...EDGE_HANDLES].map((h) => {
              const pt =
                h.length === 2 ? gizmo.corners[h] : gizmo.edges[h];
              return (
                <rect
                  key={h}
                  className="handle"
                  x={pt.x - handleSizeCanvas / 2}
                  y={pt.y - handleSizeCanvas / 2}
                  width={handleSizeCanvas}
                  height={handleSizeCanvas}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        )}
        {/* Pointer surface sits above the SVG (which is pointer-events:none). */}
        <div
          style={{ position: "absolute", inset: 0, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </div>
      {status === "unavailable" && (
        <div className="unavailable">
          <EmptyState
            title="WebGPU unavailable"
            description="This browser can't render the compositor preview. The node still composites server-side."
          />
        </div>
      )}
    </div>
  );
};

export const CompositorEditorCanvas = memo(CompositorEditorCanvasInner);
CompositorEditorCanvas.displayName = "CompositorEditorCanvas";

export default CompositorEditorCanvas;
