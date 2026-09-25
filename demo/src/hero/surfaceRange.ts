export const SURFACE_LOOP_FPS = 30;
export const SURFACE_LOOP_FRAMES = 180;

export const surfaceRangeFrames = (fromMs: number, toMs: number): number =>
  Math.max(1, Math.ceil(((toMs - fromMs) * SURFACE_LOOP_FPS) / 1000));

export const surfaceOutputFrames = (
  fromMs: number,
  toMs: number,
  durationMs?: number
): number => surfaceRangeFrames(0, durationMs ?? toMs - fromMs);

export const surfaceCastTimeMs = (
  frame: number,
  fps: number,
  durationInFrames: number,
  fromMs: number,
  toMs: number,
  realtime: boolean,
  sampleSpanFrames = durationInFrames - 1
): number =>
  realtime
    ? Math.min(toMs, fromMs + (frame * 1000) / fps)
    : fromMs + (toMs - fromMs) * Math.max(0, Math.min(1, frame / Math.max(1, sampleSpanFrames)));
