/**
 * Sketch editor perf harness (see perf-sketch.html).
 *
 * Mounts the production `SketchEditor` on a synthetic many-layer document,
 * with no backend, and exposes `window.__sketchPerf` so a Playwright spec
 * (tests/benchmarks/sketch-perf.spec.ts) can drive real input and read back:
 *
 *  - frame intervals (rAF deltas) while a scenario runs
 *  - every display composite: count and wall time (the runtime's
 *    `compositeToDisplay` is wrapped here, so production code carries no
 *    instrumentation)
 *  - React commits and render time under the editor (`<Profiler>`), plus
 *    per-component render counts from the DevTools hook installed by
 *    perf-sketch.html before React loads
 *  - long tasks
 *
 * `compositorBench` times the Canvas2D compositor directly, without React or
 * input, for the three composites the editor issues: a full frame, a frame
 * during a buffered brush stroke, and a stroke frame clipped to the region the
 * last pointer move painted.
 */
import React, { Profiler, useState } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import "../styles/vars.css";
import { ThemeRoot } from "../components/ui_primitives";
import ThemeNodetool from "../components/themes/ThemeNodetool";
import { WorkflowManagerProvider } from "../contexts/WorkflowManagerContext";
import { queryClient } from "../queryClient";
import { TRPCProvider } from "../trpc/Provider";
import SketchEditor from "../components/sketch/SketchEditor";
import { Canvas2DRuntime } from "../components/sketch/rendering/Canvas2DRuntime";
import type { ActiveStrokeInfo, DirtyRect } from "../components/sketch/rendering";
import {
  createDefaultDocument,
  createDefaultGroupLayer,
  createDefaultLayer,
  type BlendMode,
  type Layer,
  type SketchDocument
} from "../components/sketch/types";
import {
  createSketchInstance,
  SketchProvider,
  type SketchInstance
} from "../stores/sketch/SketchInstance";
import type { DocOptions, SketchPerfApi, Stats } from "./sketchPerfApi";

// ─── Measurement plumbing ────────────────────────────────────────────────────

function stats(samples: number[]): Stats {
  if (samples.length === 0) {
    return { count: 0, totalMs: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, v) => sum + v, 0);
  const pick = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const round = (v: number): number => Math.round(v * 100) / 100;
  return {
    count: sorted.length,
    totalMs: round(total),
    meanMs: round(total / sorted.length),
    p50Ms: round(pick(0.5)),
    p95Ms: round(pick(0.95)),
    maxMs: round(sorted[sorted.length - 1])
  };
}

let capturing = false;
let compositeSamples: number[] = [];
let frameSamples: number[] = [];
let commitCount = 0;
let renderMs = 0;
let longTaskSamples: number[] = [];
let rafHandle = 0;
let compositeCount = 0;

const originalComposite = Canvas2DRuntime.prototype.compositeToDisplay;
Canvas2DRuntime.prototype.compositeToDisplay = function timedComposite(
  this: Canvas2DRuntime,
  ...args: Parameters<Canvas2DRuntime["compositeToDisplay"]>
) {
  const start = performance.now();
  originalComposite.apply(this, args);
  compositeCount += 1;
  if (capturing) {
    compositeSamples.push(performance.now() - start);
  }
};

if (typeof PerformanceObserver !== "undefined") {
  try {
    new PerformanceObserver((list) => {
      if (!capturing) {
        return;
      }
      for (const entry of list.getEntries()) {
        longTaskSamples.push(entry.duration);
      }
    }).observe({ type: "longtask", buffered: false });
  } catch {
    // Long task timing is Chromium-only; the other metrics still apply.
  }
}

const onRender: React.ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
  if (!capturing) {
    return;
  }
  commitCount += 1;
  renderMs += actualDuration;
};

function sampleFrames(): void {
  let last = performance.now();
  const tick = (now: number): void => {
    if (!capturing) {
      return;
    }
    frameSamples.push(now - last);
    last = now;
    rafHandle = requestAnimationFrame(tick);
  };
  rafHandle = requestAnimationFrame(tick);
}

// ─── Synthetic document ──────────────────────────────────────────────────────

const BLEND_MODES: BlendMode[] = ["normal", "multiply", "screen", "overlay", "normal"];

/** A layer bitmap with soft shapes, so compositing touches real pixels. */
function paintLayerDataUrl(width: number, height: number, seed: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  let s = seed * 9301 + 49297;
  const rand = (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < 24; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = (0.05 + rand() * 0.2) * Math.min(width, height);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `hsla(${Math.floor(rand() * 360)}, 70%, 55%, 0.9)`);
    g.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return canvas.toDataURL("image/png");
}

function buildDocument({ width = 2048, height = 2048, layers = 12 }: DocOptions): SketchDocument {
  const doc = createDefaultDocument(width, height);
  const out: Layer[] = [];
  for (let i = 0; i < layers; i++) {
    const layer = createDefaultLayer(`Layer ${i + 1}`, "raster", width, height);
    layer.id = `perf_layer_${i}`;
    layer.data = paintLayerDataUrl(width, height, i + 1);
    layer.blendMode = BLEND_MODES[i % BLEND_MODES.length];
    layer.opacity = i % 3 === 0 ? 0.8 : 1;
    out.push(layer);
  }
  // A folder with opacity, and a layer with a live effect, so the group and
  // FX paths run on every composite like they do in real documents.
  const group = createDefaultGroupLayer("Group");
  group.id = "perf_group";
  group.opacity = 0.9;
  out.push(group);
  const grouped = createDefaultLayer("In group", "raster", width, height);
  grouped.id = "perf_grouped";
  grouped.parentId = group.id;
  grouped.data = paintLayerDataUrl(width, height, 99);
  out.push(grouped);
  const fx = createDefaultLayer("FX", "raster", width, height);
  fx.id = "perf_fx";
  fx.data = paintLayerDataUrl(width, height, 77);
  fx.effects = [
    {
      id: "fx1",
      type: "hue_saturation",
      enabled: true,
      params: { hueDegrees: 30, saturation: 0.2, lightness: 0 }
    }
  ] as Layer["effects"];
  out.push(fx);
  // The painted layer sits in the middle of the stack.
  const paint = createDefaultLayer("Paint", "raster", width, height);
  paint.id = "perf_paint";
  out.splice(Math.floor(layers / 2), 0, paint);
  doc.layers = out;
  doc.activeLayerId = paint.id;
  return doc;
}

// ─── Editor mount ────────────────────────────────────────────────────────────

let instance: SketchInstance | null = null;
let root: ReactDOM.Root | null = null;

function PerfApp({ doc, sketch }: { doc: SketchDocument; sketch: SketchInstance }) {
  const [initialDocument] = useState(doc);
  return (
    <MemoryRouter>
      <TRPCProvider>
        <ThemeRoot theme={ThemeNodetool}>
          <WorkflowManagerProvider queryClient={queryClient}>
            <SketchProvider instance={sketch}>
              <div style={{ width: "100vw", height: "100vh" }}>
                <Profiler id="sketch-editor" onRender={onRender}>
                  <SketchEditor initialDocument={initialDocument} />
                </Profiler>
              </div>
            </SketchProvider>
          </WorkflowManagerProvider>
        </ThemeRoot>
      </TRPCProvider>
    </MemoryRouter>
  );
}

async function waitFor(check: () => boolean, timeoutMs = 30_000): Promise<void> {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error("sketch perf harness: timed out waiting for the editor");
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

const api: SketchPerfApi = {
  async mount(opts = {}) {
    const doc = buildDocument(opts);
    instance = createSketchInstance();
    root = ReactDOM.createRoot(document.getElementById("root")!);
    root.render(<PerfApp doc={doc} sketch={instance} />);
    await waitFor(() => document.querySelector("canvas") !== null && compositeCount > 0);
    // The assistant column keeps reconnecting to a backend that is not there;
    // close it so its retries stay out of the measurements.
    instance.editor.getState().setAssistantPanelOpen(false, { persist: false });
    // Layer bitmaps decode asynchronously; let hydration settle.
    await new Promise((r) => setTimeout(r, 1500));
    return { layers: doc.layers.length };
  },

  setTool(tool) {
    instance?.editor.setState({ activeTool: tool } as never);
  },

  getState() {
    const s = instance!.editor.getState();
    return { zoom: s.zoom, pan: s.pan };
  },

  startCapture() {
    compositeSamples = [];
    frameSamples = [];
    longTaskSamples = [];
    commitCount = 0;
    renderMs = 0;
    window.__sketchPerfFiberRenders?.clear();
    window.__sketchPerfFiberSelfMs?.clear();
    capturing = true;
    sampleFrames();
  },

  async stopCapture() {
    // Let the last scheduled frame land before reading.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    capturing = false;
    cancelAnimationFrame(rafHandle);
    const frames = stats(frameSamples.slice(1));
    const selfMs = window.__sketchPerfFiberSelfMs ?? new Map<string, number>();
    const renders = [...(window.__sketchPerfFiberRenders ?? new Map<string, number>()).entries()]
      .map(([name, count]) => ({
        name,
        renders: count,
        selfMs: Math.round((selfMs.get(name) ?? 0) * 100) / 100
      }))
      .sort((a, b) => b.selfMs - a.selfMs)
      .slice(0, 15);
    return {
      frames: {
        ...frames,
        over20ms: frameSamples.slice(1).filter((d) => d > 20).length,
        over33ms: frameSamples.slice(1).filter((d) => d > 33.4).length
      },
      composite: stats(compositeSamples),
      react: {
        commits: commitCount,
        renderMs: Math.round(renderMs * 100) / 100,
        topComponents: renders
      },
      longTasks: {
        count: longTaskSamples.length,
        totalMs: Math.round(longTaskSamples.reduce((a, b) => a + b, 0))
      }
    };
  },

  async compositorBench(opts = {}) {
    const doc = buildDocument(opts);
    const { width, height } = doc.canvas;
    const iterations = opts.iterations ?? 30;
    const runtime = new Canvas2DRuntime();
    await Promise.all(
      doc.layers
        .filter((l) => l.data)
        .map(async (l) => {
          const canvas = runtime.getOrCreateLayerCanvas(l.id, width, height);
          const img = new Image();
          img.src = l.data!;
          await img.decode();
          canvas.getContext("2d")!.drawImage(img, 0, 0);
        })
    );
    runtime.getOrCreateLayerCanvas("perf_paint", width, height);
    const display = document.createElement("canvas");
    display.width = width;
    display.height = height;

    const buffer = document.createElement("canvas");
    buffer.width = width;
    buffer.height = height;
    const bctx = buffer.getContext("2d")!;
    bctx.strokeStyle = "#ff3366";
    bctx.lineWidth = 24;
    bctx.lineCap = "round";
    bctx.beginPath();
    bctx.moveTo(width * 0.2, height * 0.5);
    bctx.lineTo(width * 0.5, height * 0.52);
    bctx.stroke();
    const stroke: ActiveStrokeInfo = {
      layerId: "perf_paint",
      buffer,
      opacity: 0.8,
      compositeOp: "source-over"
    };
    // The region one pointer move paints at 24px brush width.
    const segment: DirtyRect = { x: width * 0.5 - 40, y: height * 0.52 - 40, w: 80, h: 80 };

    // `originalComposite` keeps these calls out of the editor capture.
    const time = (dirty: DirtyRect | null, active: ActiveStrokeInfo | null): Stats => {
      const samples: number[] = [];
      for (let i = 0; i < iterations + 3; i++) {
        const start = performance.now();
        originalComposite.call(runtime, display, doc, null, active, dirty, 1);
        // Force the pixels to be produced, as the browser does before paint.
        display.getContext("2d")!.getImageData(0, 0, 1, 1);
        if (i >= 3) {
          samples.push(performance.now() - start);
        }
      }
      return stats(samples);
    };

    return {
      fullFrame: time(null, null),
      strokeFrameFull: time(null, stroke),
      strokeFrameDirty: time(segment, stroke)
    };
  }
};

window.__sketchPerf = api;
