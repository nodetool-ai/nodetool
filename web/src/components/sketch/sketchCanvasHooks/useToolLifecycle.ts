import { useEffect, useRef } from "react";
import type { SketchDocument, SketchTool, Point, Selection } from "../types";
import { getToolHandler } from "../tools";
import { SelectTool } from "../tools/SelectTool";
import { MoveTool } from "../tools/MoveTool";
import { TransformTool } from "../tools/TransformTool";
import type { ToolContext } from "../tools/types";

interface UseToolLifecycleParams {
  activeTool: SketchTool;
  interactionTool: SketchTool;
  zoom: number;
  pan: Point;
  selection: Selection | null | undefined;
  doc: SketchDocument;
  toolCtxRef: React.MutableRefObject<ToolContext>;
  commitGenRef: React.MutableRefObject<number>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  mousePositionRef: React.MutableRefObject<Point>;
  drawCursor: (clientX: number, clientY: number) => void;
  lassoPointsRef: React.MutableRefObject<Point[]>;
  clearOverlay: () => void;
}

export function useToolLifecycle({
  activeTool,
  interactionTool,
  zoom,
  pan,
  selection,
  doc,
  toolCtxRef,
  commitGenRef,
  containerRef,
  mousePositionRef,
  drawCursor,
  lassoPointsRef,
  clearOverlay,
}: UseToolLifecycleParams): void {
  const drawCursorRef = useRef(drawCursor);
  drawCursorRef.current = drawCursor;
  const interactionToolCursorRef = useRef(interactionTool);
  interactionToolCursorRef.current = interactionTool;

  // Redraw cursor immediately when brush/tool settings change so the brush ring
  // updates without needing mouse movement (e.g. after slider change).
  const ts = doc.toolSettings;
  useEffect(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const mp = mousePositionRef.current;
    drawCursorRef.current(mp.x + rect.left, mp.y + rect.top);
  }, [
    interactionTool,
    ts.brush.size,
    ts.brush.hardness,
    ts.brush.roundness,
    ts.brush.angle,
    ts.brush.brushType,
    ts.pencil.size,
    ts.eraser.size,
    ts.blur.size,
    ts.cloneStamp.size,
  ]);

  // Clear in-progress polygon when selection is cleared externally (e.g. Escape)
  useEffect(() => {
    if (!selection && lassoPointsRef.current.length > 0 && doc.toolSettings.select.mode === "lasso_polygon") {
      lassoPointsRef.current = [];
      const handler = getToolHandler("select");
      if (handler instanceof SelectTool) {
        handler.clearPolygon();
      }
      clearOverlay();
    }
  }, [selection, doc.toolSettings.select.mode, lassoPointsRef, clearOverlay]);

  // Pen/tablet: `pointermove` is often coalesced/throttled; `pointerrawupdate` carries
  // every physical sample so the brush ring tracks the tip while drawing.
  useEffect(() => {
    const el = containerRef.current;
    if (el == null || typeof window.PointerEvent === "undefined") {
      return;
    }
    const onRaw: EventListener = (ev) => {
      const e = ev as PointerEvent;
      if (!getToolHandler(interactionToolCursorRef.current).showsBrushCursor) {
        return;
      }
      const rect = el.getBoundingClientRect();
      mousePositionRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      // Viewport coords — drawCursor maps into the cursor canvas (some styluses
      // report as pointerType "mouse"; raw updates still carry the pen position).
      drawCursorRef.current(e.clientX, e.clientY);
    };
    el.addEventListener("pointerrawupdate", onRaw, { capture: true });
    return () => {
      el.removeEventListener("pointerrawupdate", onRaw, { capture: true });
    };
  }, [containerRef, mousePositionRef]);

  // ─── Tool activation lifecycle ────────────────────────────────────
  const prevActiveToolRef = useRef(activeTool);
  useEffect(() => {
    const prev = prevActiveToolRef.current;
    if (prev === activeTool) {
      return;
    }
    // Invalidate any pending async commits from the previous tool
    commitGenRef.current++;
    const prevHandler = getToolHandler(prev);
    // Cancel any pending async work before deactivating
    prevHandler.onCancel?.(toolCtxRef.current);
    prevHandler.onDeactivate?.(toolCtxRef.current);
    const nextHandler = getToolHandler(activeTool);
    nextHandler.onActivate?.(toolCtxRef.current);
    prevActiveToolRef.current = activeTool;
  }, [activeTool]);

  // ─── Spring-loaded tool lifecycle ──────────────────────────────────
  // When interactionTool changes due to modifier keys (e.g. Ctrl+drag → move)
  // but activeTool stays the same, we need to activate/deactivate the
  // spring-loaded tool so it runs the same lifecycle as a real tool switch.
  // This prevents desync between preview state and tool session state.
  const prevInteractionToolRef = useRef(interactionTool);
  useEffect(() => {
    const prev = prevInteractionToolRef.current;
    if (prev === interactionTool) {
      return;
    }
    // Only handle the spring-loaded case where activeTool didn't change
    // (the real tool-switch effect above handles activeTool changes).
    if (activeTool !== prevActiveToolRef.current) {
      prevInteractionToolRef.current = interactionTool;
      return;
    }
    const prevHandler = getToolHandler(prev);
    prevHandler.onDeactivate?.(toolCtxRef.current);
    const nextHandler = getToolHandler(interactionTool);
    nextHandler.onActivate?.(toolCtxRef.current);
    prevInteractionToolRef.current = interactionTool;
  }, [interactionTool, activeTool]);

  // ─── Viewport change notification (zoom / pan) ─────────────────
  const prevZoomRef = useRef(zoom);
  const prevPanRef = useRef(pan);
  useEffect(() => {
    if (prevZoomRef.current !== zoom || prevPanRef.current !== pan) {
      prevZoomRef.current = zoom;
      prevPanRef.current = pan;
      const handler = getToolHandler(interactionTool);
      handler.onViewportChange?.(toolCtxRef.current);
    }
  }, [zoom, pan, interactionTool]);

  // ─── Active layer change: refresh transform/move gizmos ─────────────
  const prevActiveLayerIdRef = useRef(doc.activeLayerId);
  useEffect(() => {
    const prev = prevActiveLayerIdRef.current;
    prevActiveLayerIdRef.current = doc.activeLayerId;
    if (prev === doc.activeLayerId) {
      return;
    }
    if (interactionTool === "transform") {
      const handler = getToolHandler("transform");
      if (handler instanceof TransformTool) {
        handler.syncActiveLayer(toolCtxRef.current);
      }
    } else if (interactionTool === "move") {
      const handler = getToolHandler("move");
      if (handler instanceof MoveTool) {
        handler.syncActiveLayer(toolCtxRef.current);
      }
    }
  }, [doc.activeLayerId, interactionTool]);
}
