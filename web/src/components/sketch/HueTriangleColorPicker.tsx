/**
 * HueTriangleColorPicker
 *
 * Radial HSV color selector:
 * - Outer ring: static hue spectrum (0–360°)
 * - Inner equilateral triangle (fixed orientation): saturation + value for the selected hue
 *   - Top vertex = fully saturated color (S=1, V=1) for the current hue
 *   - Other vertices = white (S=0, V=1) and black (S=0, V=0)
 * The triangle does not rotate when the hue ring changes; only its colors update.
 * A round cursor is always visible inside the triangle.
 */

import React, {
  memo,
  useRef,
  useCallback,
  useEffect,
  useState
} from "react";
import { Box } from "@mui/material";
import {
  parseColorToRgba,
  rgbToHsv,
  hsvToRgb,
  rgbaToCss
} from "./types";

// ─── Layout constants ────────────────────────────────────────────────────────
const WIDGET_SIZE = 180;
const RING_WIDTH = 16;
const OUTER_R = WIDGET_SIZE / 2;
const INNER_R = OUTER_R - RING_WIDTH;
const TRI_R = INNER_R - 4;          // triangle inscribed radius (leave 4 px gap)
const CX = WIDGET_SIZE / 2;
const CY = WIDGET_SIZE / 2;

// Epsilon for anti-aliased triangle fill (tight boundary for pixel accuracy)
const PAINT_EPSILON = -0.005;
// Larger epsilon for pointer hit-testing (generous for better UX on edges)
const HIT_EPSILON = -0.02;

// When S or V is below this threshold the hue is ambiguous, so we skip
// updating the local hue from external color changes to avoid jumps.
const MIN_SV_FOR_HUE_SYNC = 0.01;

// ─── Geometry helpers ────────────────────────────────────────────────────────

/** Equilateral triangle in a fixed orientation (hue vertex at top). Geometry is independent of hue. */
function triVertsFixed(): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }] {
  const hRad = -Math.PI / 2; // same as hue 0°: vertex v0 points up (−Y in canvas)
  const v0 = { x: CX + TRI_R * Math.cos(hRad), y: CY + TRI_R * Math.sin(hRad) };
  const v1 = { x: CX + TRI_R * Math.cos(hRad + 2 * Math.PI / 3), y: CY + TRI_R * Math.sin(hRad + 2 * Math.PI / 3) };
  const v2 = { x: CX + TRI_R * Math.cos(hRad + 4 * Math.PI / 3), y: CY + TRI_R * Math.sin(hRad + 4 * Math.PI / 3) };
  return [v0, v1, v2];
}

/** Barycentric coordinates of P relative to triangle (A, B, C). */
function barycentric(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): { u: number; v: number; w: number } {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  const w = 1 - u - v;
  return { u, v, w };
}

/** Clamp barycentric coordinates to the triangle (all ≥ 0). */
function clampBarycentric(u: number, v: number, w: number): { u: number; v: number; w: number } {
  let cu = Math.max(0, u);
  let cv = Math.max(0, v);
  let cw = Math.max(0, w);
  const sum = cu + cv + cw;
  if (sum === 0) { return { u: 1 / 3, v: 1 / 3, w: 1 / 3 }; }
  cu /= sum;
  cv /= sum;
  cw /= sum;
  return { u: cu, v: cv, w: cw };
}

/** Convert barycentric (u=hue, v=white, w=black) → HSV saturation & value. */
function baryToSV(u: number, v: number, _w: number): { s: number; val: number } {
  const val = Math.max(0, Math.min(1, u + v));   // V = 1 - black
  const s = val > 0 ? Math.max(0, Math.min(1, u / val)) : 0;
  return { s, val };
}

/** Inverse: given S, V → barycentric (u, v, w). */
function svToBary(s: number, val: number): { u: number; v: number; w: number } {
  const u = s * val;
  const v = (1 - s) * val;
  const w = 1 - val;
  return { u, v, w };
}

// ─── Canvas painting ─────────────────────────────────────────────────────────

/** Paint the static hue ring (only needed once). */
function paintRing(ctx: CanvasRenderingContext2D) {
  const steps = 360;
  for (let i = 0; i < steps; i++) {
    const startAngle = (i - 90) * Math.PI / 180;
    const endAngle = (i + 1 - 90) * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER_R - 1, startAngle, endAngle);
    ctx.arc(CX, CY, INNER_R + 1, endAngle, startAngle, true);
    ctx.closePath();
    const { r, g, b } = hsvToRgb(i, 1, 1);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
  }
}

/** Paint the HSV triangle for the given hue (fixed geometry; only pixel colors depend on hue). */
function paintTriangle(ctx: CanvasRenderingContext2D, hueDeg: number) {
  const [v0, v1, v2] = triVertsFixed();

  // Build bounding box
  const minX = Math.floor(Math.min(v0.x, v1.x, v2.x));
  const maxX = Math.ceil(Math.max(v0.x, v1.x, v2.x));
  const minY = Math.floor(Math.min(v0.y, v1.y, v2.y));
  const maxY = Math.ceil(Math.max(v0.y, v1.y, v2.y));

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const { u, v, w: bw } = barycentric(px, py, v0.x, v0.y, v1.x, v1.y, v2.x, v2.y);
      if (u >= PAINT_EPSILON && v >= PAINT_EPSILON && bw >= PAINT_EPSILON) {
        // inside triangle (tiny epsilon for anti-alias)
        const cu = Math.max(0, u);
        const cv = Math.max(0, v);
        const cw = Math.max(0, bw);
        const sum = cu + cv + cw;
        const nu = cu / sum;
        const nv = cv / sum;
        const { s, val } = baryToSV(nu, nv, 1 - nu - nv);
        const { r, g, b } = hsvToRgb(hueDeg, s, val);
        const idx = ((py - minY) * w + (px - minX)) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      } else {
        const idx = ((py - minY) * w + (px - minX)) * 4;
        data[idx + 3] = 0;
      }
    }
  }
  ctx.putImageData(imgData, minX, minY);

  // Draw triangle border
  ctx.beginPath();
  ctx.moveTo(v0.x, v0.y);
  ctx.lineTo(v1.x, v1.y);
  ctx.lineTo(v2.x, v2.y);
  ctx.closePath();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Draw the hue indicator on the ring. */
function paintHueCursor(ctx: CanvasRenderingContext2D, hueDeg: number) {
  const midR = (OUTER_R + INNER_R) / 2;
  const hRad = (hueDeg - 90) * Math.PI / 180;
  const cx = CX + midR * Math.cos(hRad);
  const cy = CY + midR * Math.sin(hRad);
  ctx.beginPath();
  ctx.arc(cx, cy, RING_WIDTH / 2 - 1, 0, 2 * Math.PI);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, RING_WIDTH / 2 - 1, 0, 2 * Math.PI);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Draw the SV cursor inside the triangle. */
function paintSVCursor(ctx: CanvasRenderingContext2D, _hueDeg: number, s: number, val: number) {
  const [v0, v1, v2] = triVertsFixed();
  const { u, v, w } = svToBary(s, val);
  const cx = u * v0.x + v * v1.x + w * v2.x;
  const cy = u * v0.y + v * v1.y + w * v2.y;
  // Outer white ring
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();
  // Inner shadow ring
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface HueTriangleColorPickerProps {
  color: string;
  onColorChange: (color: string) => void;
}

type DragTarget = "ring" | "triangle" | null;

const HueTriangleColorPicker: React.FC<HueTriangleColorPickerProps> = ({
  color,
  onColorChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringCanvasRef = useRef<HTMLCanvasElement | null>(null);   // offscreen cache
  const dragTarget = useRef<DragTarget>(null);

  // ─── Parse color to HSV ──────────────────────────────────────────
  const { r, g, b, a } = parseColorToRgba(color);
  const hsvRef = useRef(rgbToHsv(r, g, b));

  // Stable hue: only update from external color when NOT dragging
  const [localHue, setLocalHue] = useState(hsvRef.current.h);
  const prevColor = useRef(color);

  useEffect(() => {
    if (prevColor.current !== color && dragTarget.current === null) {
      const parsed = parseColorToRgba(color);
      const hsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
      hsvRef.current = hsv;
      // Only update hue when color has meaningful saturation/value
      if (hsv.s > MIN_SV_FOR_HUE_SYNC && hsv.v > MIN_SV_FOR_HUE_SYNC) {
        setLocalHue(hsv.h);
      }
    }
    prevColor.current = color;
  }, [color]);

  const hsv = rgbToHsv(r, g, b);

  // ─── Repaint ─────────────────────────────────────────────────────
  const repaint = useCallback((hue: number, sat: number, val: number) => {
    const canvas = canvasRef.current;
    if (!canvas) { return; }
    const ctx = canvas.getContext("2d");
    if (!ctx) { return; }
    ctx.clearRect(0, 0, WIDGET_SIZE, WIDGET_SIZE);

    // Draw cached ring
    if (!ringCanvasRef.current) {
      const offscreen = document.createElement("canvas");
      offscreen.width = WIDGET_SIZE;
      offscreen.height = WIDGET_SIZE;
      const offCtx = offscreen.getContext("2d");
      if (offCtx) { paintRing(offCtx); }
      ringCanvasRef.current = offscreen;
    }
    ctx.drawImage(ringCanvasRef.current, 0, 0);

    paintTriangle(ctx, hue);
    paintHueCursor(ctx, hue);
    paintSVCursor(ctx, hue, sat, val);
  }, []);

  useEffect(() => {
    repaint(localHue, hsv.s, hsv.v);
  }, [localHue, hsv.s, hsv.v, repaint]);

  // ─── Hit-test ────────────────────────────────────────────────────
  const hitTest = useCallback((clientX: number, clientY: number): DragTarget => {
    const canvas = canvasRef.current;
    if (!canvas) { return null; }
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (WIDGET_SIZE / rect.width);
    const py = (clientY - rect.top) * (WIDGET_SIZE / rect.height);
    const dx = px - CX;
    const dy = py - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= INNER_R && dist <= OUTER_R) { return "ring"; }

    // Check inside triangle
    const [v0, v1, v2] = triVerts(localHue);
    const { u, v, w } = barycentric(px, py, v0.x, v0.y, v1.x, v1.y, v2.x, v2.y);
    if (u >= HIT_EPSILON && v >= HIT_EPSILON && w >= HIT_EPSILON) { return "triangle"; }

    // If close to the ring but not quite, treat as ring
    if (dist > TRI_R) { return "ring"; }

    return "triangle";   // Default to triangle for inner area
  }, [localHue]);

  // ─── Pointer → color ────────────────────────────────────────────
  const pointerToHue = useCallback((clientX: number, clientY: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) { return localHue; }
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (WIDGET_SIZE / rect.width);
    const py = (clientY - rect.top) * (WIDGET_SIZE / rect.height);
    const dx = px - CX;
    const dy = py - CY;
    let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
    if (angle < 0) { angle += 360; }
    return angle % 360;
  }, [localHue]);

  const pointerToSV = useCallback((clientX: number, clientY: number, hue: number): { s: number; val: number } => {
    const canvas = canvasRef.current;
    if (!canvas) { return { s: hsv.s, val: hsv.v }; }
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (WIDGET_SIZE / rect.width);
    const py = (clientY - rect.top) * (WIDGET_SIZE / rect.height);
    const [v0, v1, v2] = triVerts(hue);
    const raw = barycentric(px, py, v0.x, v0.y, v1.x, v1.y, v2.x, v2.y);
    const clamped = clampBarycentric(raw.u, raw.v, raw.w);
    return baryToSV(clamped.u, clamped.v, clamped.w);
  }, [hsv.s, hsv.v]);

  // ─── Emit color ─────────────────────────────────────────────────
  const emitColor = useCallback((h: number, s: number, v: number) => {
    const { r: nr, g: ng, b: nb } = hsvToRgb(h, s, v);
    onColorChange(rgbaToCss({ r: nr, g: ng, b: nb, a }));
  }, [a, onColorChange]);

  // ─── Mouse handlers ─────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = hitTest(e.clientX, e.clientY);
    dragTarget.current = target;

    const canvas = canvasRef.current;
    if (canvas) { canvas.setPointerCapture(e.pointerId); }

    if (target === "ring") {
      const newHue = pointerToHue(e.clientX, e.clientY);
      setLocalHue(newHue);
      emitColor(newHue, hsv.s, hsv.v);
    } else if (target === "triangle") {
      const { s, val } = pointerToSV(e.clientX, e.clientY, localHue);
      emitColor(localHue, s, val);
    }
  }, [hitTest, pointerToHue, pointerToSV, localHue, hsv.s, hsv.v, emitColor]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragTarget.current === null) { return; }
    e.preventDefault();

    if (dragTarget.current === "ring") {
      const newHue = pointerToHue(e.clientX, e.clientY);
      setLocalHue(newHue);
      emitColor(newHue, hsv.s, hsv.v);
    } else if (dragTarget.current === "triangle") {
      const { s, val } = pointerToSV(e.clientX, e.clientY, localHue);
      emitColor(localHue, s, val);
    }
  }, [pointerToHue, pointerToSV, localHue, hsv.s, hsv.v, emitColor]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragTarget.current = null;
    const canvas = canvasRef.current;
    if (canvas) { canvas.releasePointerCapture(e.pointerId); }
  }, []);

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        py: "4px"
      }}
    >
      <canvas
        ref={canvasRef}
        width={WIDGET_SIZE}
        height={WIDGET_SIZE}
        style={{
          width: `${WIDGET_SIZE}px`,
          height: `${WIDGET_SIZE}px`,
          cursor: "crosshair",
          touchAction: "none"
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </Box>
  );
};

export default memo(HueTriangleColorPicker);
