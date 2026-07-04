/**
 * Camera and projection math for the promo scenes. Unlike `../camera.ts`
 * (tutorial-specific: step-driven, hardcoded 1920×1080) these helpers take
 * the frame size, so the same scene renders the 16:9 master and the 3:2
 * landing-page variant.
 */
import { Easing, interpolate } from "remotion";

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CameraKey {
  t: number;
  vp: Viewport;
}

/** A rectangle in graph coordinates. */
export interface GraphRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Frame a graph-space rect inside a `fw`×`fh` video frame with padding. */
export function frameRect(
  rect: GraphRect,
  fw: number,
  fh: number,
  padding = 120,
  maxZoom = 1.6
): Viewport {
  const w = Math.max(1, rect.x1 - rect.x0);
  const h = Math.max(1, rect.y1 - rect.y0);
  const zoom = Math.min((fw - 2 * padding) / w, (fh - 2 * padding) / h, maxZoom);
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  return {
    x: fw / 2 - cx * zoom,
    y: fh / 2 - cy * zoom,
    zoom,
  };
}

/** Sample a camera path at `timeMs`, easing within each segment. */
export function cameraAt(keys: CameraKey[], timeMs: number): Viewport {
  const ts = keys.map((k) => k.t);
  const opts = {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: "clamp" as const,
    extrapolateRight: "clamp" as const,
  };
  return {
    x: interpolate(timeMs, ts, keys.map((k) => k.vp.x), opts),
    y: interpolate(timeMs, ts, keys.map((k) => k.vp.y), opts),
    zoom: interpolate(timeMs, ts, keys.map((k) => k.vp.zoom), opts),
  };
}

/** Project a graph-space point to screen space under a viewport. */
export function project(
  vp: Viewport,
  x: number,
  y: number
): { x: number; y: number } {
  return { x: vp.x + x * vp.zoom, y: vp.y + y * vp.zoom };
}

/** Clamped 0→1 progress between two frame marks. */
export function progress(frame: number, from: number, to: number): number {
  return interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Ease-out variant of {@link progress} for entrances. */
export function easeOutProgress(frame: number, from: number, to: number): number {
  return interpolate(frame, [from, to], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}
