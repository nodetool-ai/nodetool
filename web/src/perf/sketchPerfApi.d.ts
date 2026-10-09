/**
 * The `window.__sketchPerf` API that sketchPerfHarness.tsx installs and
 * tests/benchmarks/sketch-perf.spec.ts drives. Kept in a declaration file so
 * the Playwright typecheck sees it without compiling the editor.
 */

export interface DocOptions {
  width?: number;
  height?: number;
  /** Raster layers to create (a group and an FX layer are added on top). */
  layers?: number;
}

export interface Stats {
  count: number;
  totalMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface CaptureResult {
  frames: Stats & { over20ms: number; over33ms: number };
  composite: Stats;
  react: {
    commits: number;
    renderMs: number;
    topComponents: Array<{ name: string; renders: number; selfMs: number }>;
  };
  longTasks: { count: number; totalMs: number };
}

declare global {
  interface Window {
    __sketchPerf?: SketchPerfApi;
    __sketchPerfFiberRenders?: Map<string, number>;
    __sketchPerfFiberSelfMs?: Map<string, number>;
  }
}

export interface SketchPerfApi {
  mount: (opts?: DocOptions) => Promise<{ layers: number }>;
  setTool: (tool: string) => void;
  getState: () => { zoom: number; pan: { x: number; y: number } };
  startCapture: () => void;
  stopCapture: () => Promise<CaptureResult>;
  compositorBench: (opts?: DocOptions & { iterations?: number }) => Promise<
    Record<string, Stats>
  >;
}
