/**
 * SketchRulersAndGuides — Photoshop-style rulers along the top and left edges
 * of the canvas region, plus the document's ruler guides.
 *
 * - Drag from the top ruler to place a horizontal guide, from the left ruler
 *   for a vertical one. Dropping back on the ruler cancels.
 * - With the Move tool, drag a guide to reposition it, or drag it onto its
 *   ruler (or out of the viewport) to delete it.
 * - Guides snap to the canvas edges and center while dragging unless snapping
 *   is off.
 *
 * The overlay covers the canvas region and is transparent to pointer input
 * everywhere except the rulers and the guide grab strips, so painting is
 * unaffected. Rulers and guides read the same pan/zoom mapping as the canvas.
 * The tool top bar floats over the top of the canvas region, so the rulers
 * start below it.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";

import { useSketchStore } from "../state/useSketchStore";
import { Box, FONT_SIZE_SANS, TYPOGRAPHY, BORDER_RADIUS } from "../../ui_primitives";
import type { SketchGuide, SketchGuideOrientation } from "../types";
import { SKETCH_RULER_SIZE_PX, SKETCH_Z_INDEX } from "../sketchStyles";
import { SNAP_THRESHOLD_SCREEN_PX, snapValue } from "../snapping/moveSnap";
import { docToViewport, rulerTickSpacing, viewportToDoc } from "./rulerMath";

const RULER = SKETCH_RULER_SIZE_PX;
/** Width (CSS px) of the invisible strip that grabs a guide. */
const GUIDE_GRAB_PX = 7;
const EMPTY_GUIDES: readonly SketchGuide[] = [];

interface ViewportSize {
  width: number;
  height: number;
}

type GuideDrag =
  | {
      kind: "new";
      orientation: SketchGuideOrientation;
      /** Document position, or null while the pointer is still on the ruler. */
      position: number | null;
      pointer: { x: number; y: number };
    }
  | {
      kind: "move";
      id: string;
      orientation: SketchGuideOrientation;
      position: number | null;
      pointer: { x: number; y: number };
    };

function drawRuler(
  canvas: HTMLCanvasElement,
  axis: "x" | "y",
  /** Viewport position (CSS px) where the ruler starts along its axis. */
  startOffset: number,
  lengthCss: number,
  docSize: number,
  viewportSize: number,
  zoom: number,
  pan: number,
  cursorDoc: number | null
): void {
  const dpr = window.devicePixelRatio || 1;
  const along = Math.max(0, Math.round(lengthCss));
  const wantW = Math.round((axis === "x" ? along : RULER) * dpr);
  const wantH = Math.round((axis === "x" ? RULER : along) * dpr);
  if (canvas.width !== wantW || canvas.height !== wantH) {
    canvas.width = wantW;
    canvas.height = wantH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const style = getComputedStyle(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, wantW, wantH);
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = 1;
  ctx.font = style.font;
  ctx.textBaseline = "top";

  const { major, minor } = rulerTickSpacing(zoom);
  const docStart = viewportToDoc(startOffset, docSize, viewportSize, zoom, pan);
  const docEnd = viewportToDoc(viewportSize, docSize, viewportSize, zoom, pan);
  const first = Math.floor(docStart / minor) * minor;

  ctx.beginPath();
  for (let d = first; d <= docEnd; d += minor) {
    const v = docToViewport(d, docSize, viewportSize, zoom, pan) - startOffset;
    const p = Math.round(v) + 0.5;
    const isMajor = Math.abs(d / major - Math.round(d / major)) < 1e-9;
    const isHalf =
      !isMajor &&
      major / minor >= 4 &&
      Math.abs((d * 2) / major - Math.round((d * 2) / major)) < 1e-9;
    const len = isMajor ? RULER : isHalf ? RULER * 0.45 : RULER * 0.25;
    if (axis === "x") {
      ctx.moveTo(p, RULER);
      ctx.lineTo(p, RULER - len);
    } else {
      ctx.moveTo(RULER, p);
      ctx.lineTo(RULER - len, p);
    }
    if (isMajor) {
      const label = String(Math.round(d));
      if (axis === "x") {
        ctx.fillText(label, p + 3, 2);
      } else {
        // Stack the digits top to bottom, as Photoshop does, so the label
        // fits the narrow ruler without rotating the text.
        const lineHeight = Math.ceil((parseFloat(style.fontSize) || 11) * 0.85);
        ctx.textAlign = "center";
        for (let i = 0; i < label.length; i++) {
          ctx.fillText(label[i]!, RULER / 2 - 2, p + 3 + i * lineHeight);
        }
        ctx.textAlign = "start";
      }
    }
  }
  ctx.stroke();

  if (cursorDoc !== null) {
    const v = docToViewport(cursorDoc, docSize, viewportSize, zoom, pan) - startOffset;
    const p = Math.round(v) + 0.5;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    if (axis === "x") {
      ctx.moveTo(p, 0);
      ctx.lineTo(p, RULER);
    } else {
      ctx.moveTo(0, p);
      ctx.lineTo(RULER, p);
    }
    ctx.stroke();
    ctx.restore();
  }
}

export const SketchRulersAndGuides = memo(function SketchRulersAndGuides() {
  const theme = useTheme();
  const rulersVisible = useSketchStore((s) => s.rulersVisible);
  const guidesVisible = useSketchStore((s) => s.guidesVisible);
  const guides = useSketchStore((s) => s.document.guides ?? EMPTY_GUIDES);
  const docW = useSketchStore((s) => s.document.canvas.width);
  const docH = useSketchStore((s) => s.document.canvas.height);
  const zoom = useSketchStore((s) => s.zoom);
  const pan = useSketchStore((s) => s.pan);
  const moveToolActive = useSketchStore((s) => s.activeTool === "move");
  const cursor = useSketchStore((s) => (s.rulersVisible ? s.cursorDocPos : null));

  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const [drag, setDrag] = useState<GuideDrag | null>(null);
  /** Height of the floating tool top bar that covers the top of the region. */
  const [topInset, setTopInset] = useState(0);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const topBar = rootRef.current
      ?.closest(".sketch-editor")
      ?.querySelector(".sketch-tool-top-bar");
    if (!topBar) {
      return;
    }
    const measure = () => setTopInset(topBar.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(topBar);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!rulersVisible || size.width <= 0 || size.height <= 0) {
      return;
    }
    if (topRef.current) {
      drawRuler(
        topRef.current,
        "x",
        RULER,
        size.width - RULER,
        docW,
        size.width,
        zoom,
        pan.x,
        cursor?.x ?? null
      );
    }
    if (leftRef.current) {
      drawRuler(
        leftRef.current,
        "y",
        topInset + RULER,
        size.height - topInset - RULER,
        docH,
        size.height,
        zoom,
        pan.y,
        cursor?.y ?? null
      );
    }
  }, [rulersVisible, size, topInset, docW, docH, zoom, pan, cursor, theme]);

  /** Document position under the pointer for a guide of `orientation`, or null when it would be discarded. */
  const resolveDragPosition = useCallback(
    (
      clientX: number,
      clientY: number,
      orientation: SketchGuideOrientation
    ): { position: number | null; pointer: { x: number; y: number } } => {
      const el = rootRef.current;
      if (!el) {
        return { position: null, pointer: { x: 0, y: 0 } };
      }
      const rect = el.getBoundingClientRect();
      const vx = clientX - rect.left;
      const vy = clientY - rect.top;
      const pointer = { x: vx, y: vy };
      const along = orientation === "horizontal" ? vy : vx;
      const extent = orientation === "horizontal" ? rect.height : rect.width;
      // Over its own ruler, under the tool bar, or outside the viewport the
      // guide is discarded.
      const minAlong =
        (orientation === "horizontal" ? topInset : 0) + (rulersVisible ? RULER : 0);
      if (along < minAlong || along > extent || vx < 0 || vy < 0 || vx > rect.width || vy > rect.height) {
        return { position: null, pointer };
      }
      const state = useSketchStore.getState();
      const docSize =
        orientation === "horizontal"
          ? state.document.canvas.height
          : state.document.canvas.width;
      const panAxis = orientation === "horizontal" ? state.pan.y : state.pan.x;
      let position = viewportToDoc(along, docSize, extent, state.zoom, panAxis);
      if (state.snapEnabled) {
        position = snapValue(
          position,
          [0, docSize / 2, docSize],
          SNAP_THRESHOLD_SCREEN_PX / Math.max(state.zoom, 1e-6)
        );
      }
      return { position: Math.round(position), pointer };
    },
    [rulersVisible, topInset]
  );

  const beginDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, next: GuideDrag) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag(next);
    },
    []
  );

  const handleDragMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!drag) {
        return;
      }
      const { position, pointer } = resolveDragPosition(
        event.clientX,
        event.clientY,
        drag.orientation
      );
      setDrag({ ...drag, position, pointer });
    },
    [drag, resolveDragPosition]
  );

  const handleDragEnd = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!drag) {
        return;
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const { position } = resolveDragPosition(
        event.clientX,
        event.clientY,
        drag.orientation
      );
      const store = useSketchStore.getState();
      if (drag.kind === "new") {
        if (position !== null) {
          store.addGuide(drag.orientation, position);
          if (!store.guidesVisible) {
            store.toggleGuidesVisible();
          }
        }
      } else if (position === null) {
        store.removeGuide(drag.id);
      } else {
        store.moveGuide(drag.id, position);
      }
      setDrag(null);
    },
    [drag, resolveDragPosition]
  );

  const handleDragCancel = useCallback(() => setDrag(null), []);

  const dragHandlers = {
    onPointerMove: handleDragMove,
    onPointerUp: handleDragEnd,
    onPointerCancel: handleDragCancel
  };

  const guideColor = theme.vars.palette.info.main;
  const viewportX = (docX: number) => docToViewport(docX, docW, size.width, zoom, pan.x);
  const viewportY = (docY: number) => docToViewport(docY, docH, size.height, zoom, pan.y);

  const renderGuideLine = (
    key: string,
    orientation: SketchGuideOrientation,
    position: number,
    options: {
      grabbable: boolean;
      preview?: boolean;
      /** Keep the element (it may hold pointer capture) but draw no line. */
      hidden?: boolean;
      guideId?: string;
    }
  ) => {
    const isHorizontal = orientation === "horizontal";
    const at = isHorizontal ? viewportY(position) : viewportX(position);
    if (at < -GUIDE_GRAB_PX || at > (isHorizontal ? size.height : size.width) + GUIDE_GRAB_PX) {
      return null;
    }
    const guideId = options.guideId;
    return (
      <Box
        key={key}
        data-testid={options.preview ? "sketch-guide-preview" : "sketch-guide"}
        data-orientation={orientation}
        data-position={position}
        onPointerDown={
          options.grabbable && guideId
            ? (e: React.PointerEvent<HTMLElement>) => {
                const { pointer } = resolveDragPosition(e.clientX, e.clientY, orientation);
                beginDrag(e, { kind: "move", id: guideId, orientation, position, pointer });
              }
            : undefined
        }
        {...(options.grabbable ? dragHandlers : {})}
        sx={{
          position: "absolute",
          pointerEvents: options.grabbable ? "auto" : "none",
          cursor: options.grabbable
            ? isHorizontal
              ? "row-resize"
              : "col-resize"
            : undefined,
          touchAction: "none",
          ...(isHorizontal
            ? { left: 0, right: 0, top: at - GUIDE_GRAB_PX / 2, height: GUIDE_GRAB_PX }
            : { top: 0, bottom: 0, left: at - GUIDE_GRAB_PX / 2, width: GUIDE_GRAB_PX }),
          "&::after": {
            content: '""',
            position: "absolute",
            backgroundColor: guideColor,
            opacity: options.hidden ? 0 : options.preview ? 0.7 : 1,
            ...(isHorizontal
              ? { left: 0, right: 0, top: Math.floor(GUIDE_GRAB_PX / 2), height: "1px" }
              : { top: 0, bottom: 0, left: Math.floor(GUIDE_GRAB_PX / 2), width: "1px" })
          }
        }}
      />
    );
  };

  const draggingId = drag?.kind === "move" ? drag.id : null;
  const showGuides = guidesVisible || drag !== null;

  const rulerSx = {
    position: "absolute" as const,
    display: "block",
    backgroundColor: theme.vars.palette.grey[900],
    color: theme.vars.palette.text.secondary,
    fontFamily: TYPOGRAPHY.mono.code.fontFamily,
    fontSize: FONT_SIZE_SANS.caption,
    lineHeight: 1,
    pointerEvents: "auto" as const,
    touchAction: "none",
    userSelect: "none" as const
  };

  return (
    <Box
      ref={rootRef}
      className="sketch-rulers-and-guides"
      data-testid="sketch-rulers-and-guides"
      sx={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: SKETCH_Z_INDEX.rulers
      }}
    >
      {showGuides &&
        guides.map((g) =>
          // The dragged guide stays mounted: its element holds the pointer
          // capture, so unmounting it would drop the rest of the drag.
          g.id === draggingId && drag
            ? renderGuideLine(g.id, g.orientation, drag.position ?? g.position, {
                grabbable: true,
                preview: true,
                hidden: drag.position === null,
                guideId: g.id
              })
            : renderGuideLine(g.id, g.orientation, g.position, {
                grabbable: moveToolActive && drag === null,
                guideId: g.id
              })
        )}
      {drag?.kind === "new" && drag.position !== null &&
        renderGuideLine("drag-preview", drag.orientation, drag.position, {
          grabbable: false,
          preview: true
        })}
      {drag && drag.position !== null && (
        <Box
          sx={{
            position: "absolute",
            left: drag.pointer.x + 12,
            top: drag.pointer.y + 12,
            px: 0.5,
            borderRadius: BORDER_RADIUS.xs,
            backgroundColor: theme.vars.palette.grey[900],
            border: `1px solid ${theme.vars.palette.grey[700]}`,
            color: theme.vars.palette.text.primary,
            fontFamily: TYPOGRAPHY.mono.code.fontFamily,
            fontSize: FONT_SIZE_SANS.caption,
            whiteSpace: "nowrap",
            pointerEvents: "none"
          }}
        >
          {drag.orientation === "horizontal" ? "Y" : "X"}: {drag.position} px
        </Box>
      )}

      {rulersVisible && (
        <>
          <Box
            component="canvas"
            ref={topRef}
            data-testid="sketch-ruler-top"
            aria-label="Horizontal ruler. Drag down to place a guide."
            onPointerDown={(e: React.PointerEvent<HTMLElement>) =>
              beginDrag(e, {
                kind: "new",
                orientation: "horizontal",
                position: null,
                pointer: { x: 0, y: 0 }
              })
            }
            {...dragHandlers}
            sx={{
              ...rulerSx,
              top: topInset,
              left: RULER,
              width: `calc(100% - ${RULER}px)`,
              height: RULER,
              borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
              cursor: "row-resize"
            }}
          />
          <Box
            component="canvas"
            ref={leftRef}
            data-testid="sketch-ruler-left"
            aria-label="Vertical ruler. Drag right to place a guide."
            onPointerDown={(e: React.PointerEvent<HTMLElement>) =>
              beginDrag(e, {
                kind: "new",
                orientation: "vertical",
                position: null,
                pointer: { x: 0, y: 0 }
              })
            }
            {...dragHandlers}
            sx={{
              ...rulerSx,
              top: topInset + RULER,
              left: 0,
              width: RULER,
              height: `calc(100% - ${topInset + RULER}px)`,
              borderRight: `1px solid ${theme.vars.palette.grey[700]}`,
              cursor: "col-resize"
            }}
          />
          <Box
            sx={{
              ...rulerSx,
              top: topInset,
              left: 0,
              width: RULER,
              height: RULER,
              borderRight: `1px solid ${theme.vars.palette.grey[700]}`,
              borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
            }}
          />
        </>
      )}
    </Box>
  );
});

export default SketchRulersAndGuides;
