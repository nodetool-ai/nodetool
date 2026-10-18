// Shared canvas sizing helper (DPR-aware) used by every visualization.

export interface CanvasCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

export function setupCanvas(canvas: HTMLCanvasElement): CanvasCtx {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(10, r.width), h = Math.max(10, r.height);
  if (canvas.width !== ((w * dpr) | 0) || canvas.height !== ((h * dpr) | 0)) {
    canvas.width = (w * dpr) | 0;
    canvas.height = (h * dpr) | 0;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/**
 * Drives `draw` every animation frame, or paints a single static frame while
 * `prefers-reduced-motion` is set. Returns the cleanup function.
 */
export function startCanvasLoop(
  canvasRef: { readonly current: HTMLCanvasElement | null },
  draw: (canvas: HTMLCanvasElement) => void
): () => void {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let raf = 0;
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const frame = () => {
    const canvas = canvasRef.current;
    if (canvas) draw(canvas);
    raf = requestAnimationFrame(frame);
  };
  const start = () => {
    stop();
    if (mq.matches) {
      const canvas = canvasRef.current;
      if (canvas) draw(canvas);
    } else {
      raf = requestAnimationFrame(frame);
    }
  };
  start();
  mq.addEventListener('change', start);
  return () => {
    stop();
    mq.removeEventListener('change', start);
  };
}
