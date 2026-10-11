/**
 * The sketch debug harness: the CLI host around the shared validator.
 *
 * `runSketchValidate` is the cheap pre-flight — load an image document, check
 * it, report. `runSketchDebug` additionally replays a scripted edit session
 * against the headless `ui_sketch_*` bridge (the one the tool-loop eval
 * drives), validates the document the session left behind, and writes a
 * self-contained bundle.
 *
 * Everything that could pull in a heavy package is injected with a lazy
 * default: the validator core (`@nodetool-ai/execution/sketch-debug`) and the
 * bridge factory (`@nodetool-ai/agents`). Tests supply their own and load
 * neither.
 */
import type {
  SketchDebugReport,
  SketchInteractionRecord,
  SketchValidation
} from "@nodetool-ai/execution/sketch-debug";
import type { SketchInteractionStep } from "./interactions.js";
import { runInteractionSteps } from "../interaction-script.js";
import { writeDebugBundle } from "../debug-bundle.js";
import {
  resolveSketchTarget,
  type ResolvedSketchTarget,
  type SketchCanvasSettings,
  type SketchTargetDeps
} from "./target.js";

/** The pieces of the shared core this host calls. */
export interface SketchDebugCore {
  validateSketchDocument: (
    raw: unknown,
    meta?: SketchCanvasSettings
  ) => SketchValidation | Promise<SketchValidation>;
  buildSketchDebugReport: (input: {
    target: SketchDebugReport["target"];
    document: unknown;
    meta?: SketchCanvasSettings;
    interactions?: SketchInteractionRecord[];
    finalState?: unknown;
    finalDocument?: unknown;
  }) => SketchDebugReport | Promise<SketchDebugReport>;
  renderSketchReportMarkdown: (report: SketchDebugReport) => string;
}

/** The bridge surface this host drives — one tool per `ui_sketch_*` name. */
export interface SketchBridgeTool {
  name: string;
  /**
   * HOLDOUT (anti-slop/no-unknown-returns): a `ui_sketch_*` tool answers in
   * the open tool-result domain, and the bridge that implements this lives in
   * `@nodetool-ai/agents`.
   */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/** One layer of the bridge's snapshot. */
export interface SketchBridgeLayer {
  id: string;
  name: string;
  type: "raster" | "mask" | "group";
  visible: boolean;
  opacity: number;
  blendMode: string;
  hasBinding?: boolean;
}

/** The bridge's snapshot after a session (`SketchBridgeFinalState`). */
export interface SketchBridgeSnapshot {
  width?: number;
  height?: number;
  backgroundColor?: string;
  activeLayerId?: string | null;
  layers?: SketchBridgeLayer[];
}

export interface SketchBridge {
  tools: SketchBridgeTool[];
  finalState: () => SketchBridgeSnapshot;
}

export type CreateSketchBridge = (initial: {
  name?: string;
  width?: number;
  height?: number;
  layers?: { name: string; type?: "raster" | "mask" }[];
}) => SketchBridge;

export interface SketchDebugDeps extends SketchTargetDeps {
  /** Defaults to `@nodetool-ai/execution/sketch-debug`. */
  core?: SketchDebugCore;
  /** Defaults to `createSketchToolBridge` from `@nodetool-ai/agents`. */
  createBridge?: CreateSketchBridge;
  onLog?: (line: string) => void;
}

export interface SketchDebugOptions {
  interact?: SketchInteractionStep[];
  outDir?: string;
}

export interface SketchValidateResult {
  target: ResolvedSketchTarget["target"];
  validation: SketchValidation;
}

export interface SketchDebugResult {
  report: SketchDebugReport;
  bundleDir: string;
}

async function loadCore(): Promise<SketchDebugCore> {
  const core = await import("@nodetool-ai/execution/sketch-debug");
  return {
    validateSketchDocument: (raw, meta) =>
      core.validateSketchDocument(raw, meta),
    buildSketchDebugReport: (input) => core.buildSketchDebugReport(input),
    renderSketchReportMarkdown: (report) =>
      core.renderSketchReportMarkdown(report)
  };
}

async function loadBridgeFactory(): Promise<CreateSketchBridge> {
  const { createSketchToolBridge } = await import("@nodetool-ai/agents");
  return (initial) =>
    // SAFETY: the eval-surface bridge in @nodetool-ai/agents implements this
    // exact tool list and snapshot — it is the bridge this type describes. The
    // two packages declare the sketch document types independently, and that
    // duplication is the only reason the structures do not line up.
    createSketchToolBridge(
      initial as Parameters<typeof createSketchToolBridge>[0]
    ) as SketchBridge;
}

/** Load a sketch and validate it — no bridge, no bundle. */
export async function runSketchValidate(
  ref: string,
  deps: SketchDebugDeps
): Promise<SketchValidateResult> {
  const resolved = await resolveSketchTarget(ref, deps);
  const core = deps.core ?? (await loadCore());
  const validation = await core.validateSketchDocument(
    resolved.raw,
    resolved.meta
  );
  return { target: resolved.target, validation };
}

/**
 * The document the session left behind, rebuilt from the bridge snapshot.
 *
 * The bridge models a flat raster/mask stack with its own layer ids and no
 * pixels, so the reconstruction carries structure only: bitmaps are absent,
 * lock state is not tracked, and generation bindings are dropped — the bridge
 * records a layer's prompt/provider/model, not the persisted binding record.
 * The report's `notSimulated` says so.
 */
/** The `{ sketch, layerBindings }` document a session leaves behind. */
interface ReconstructedSketchDocument {
  sketch: {
    version: number;
    canvas: { width: number; height: number; backgroundColor?: string };
    layers: Array<{
      id: string;
      name: string;
      type: SketchBridgeLayer["type"];
      visible: boolean;
      locked: boolean;
      opacity: number | undefined;
      blendMode: string | undefined;
      data: null;
    }>;
    activeLayerId: string;
    maskLayerId: string | null;
  };
  layerBindings: never[];
}

function reconstructDocument(
  snapshot: SketchBridgeSnapshot,
  resolved: ResolvedSketchTarget
): ReconstructedSketchDocument {
  const layers = (snapshot.layers ?? []).map((layer) => ({
    id: layer.id,
    name: layer.name,
    type: layer.type,
    visible: layer.visible,
    locked: false,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    data: null
  }));
  const activeLayerId = snapshot.activeLayerId ?? "";
  const background =
    snapshot.backgroundColor ??
    resolved.document.canvas.backgroundColor ??
    resolved.meta.backgroundColor;

  type CanvasFields = {
    width: number;
    height: number;
    backgroundColor?: string;
  };
  const canvas: CanvasFields = {
    width: snapshot.width ?? resolved.document.canvas.width ?? 0,
    height: snapshot.height ?? resolved.document.canvas.height ?? 0
  };
  if (background !== undefined) {
    canvas.backgroundColor = background;
  }
  return {
    sketch: {
      version: resolved.document.version,
      canvas,
      layers,
      activeLayerId,
      maskLayerId: null
    },
    layerBindings: []
  };
}

/**
 * Replay `--interact` against the headless bridge and write the bundle.
 *
 * A failing step is recorded and the script continues: a run that stops at the
 * first error hides every problem behind it, and the report is what the caller
 * came for.
 */
export async function runSketchDebug(
  ref: string,
  options: SketchDebugOptions,
  deps: SketchDebugDeps
): Promise<SketchDebugResult> {
  const resolved = await resolveSketchTarget(ref, deps);
  const core = deps.core ?? (await loadCore());

  const steps = options.interact ?? [];
  const interactions: SketchInteractionRecord[] = [];
  let snapshot: SketchBridgeSnapshot | undefined;

  if (steps.length > 0) {
    const createBridge = deps.createBridge ?? (await loadBridgeFactory());
    const bridgeInit: Parameters<typeof createBridge>[0] = {
      // The bridge seeds names and types only; a group layer has no headless
      // equivalent, so it enters the stack as a raster.
      layers: resolved.document.layers.map((layer) => ({
        name: layer.name,
        type: layer.type === "mask" ? ("mask" as const) : ("raster" as const)
      }))
    };
    if (resolved.target.name) {
      bridgeInit.name = resolved.target.name;
    }
    if (resolved.document.canvas.width !== undefined) {
      bridgeInit.width = resolved.document.canvas.width;
    }
    if (resolved.document.canvas.height !== undefined) {
      bridgeInit.height = resolved.document.canvas.height;
    }
    const bridge = createBridge(bridgeInit);
    interactions.push(
      ...(await runInteractionSteps(steps, bridge.tools, "sketch", deps.onLog))
    );
    snapshot = bridge.finalState();
  }

  const finalDocument = snapshot
    ? reconstructDocument(snapshot, resolved)
    : undefined;

  const reportInput: Parameters<typeof core.buildSketchDebugReport>[0] = {
    target: resolved.target,
    document: resolved.raw,
    meta: resolved.meta,
    interactions
  };
  if (snapshot) {
    reportInput.finalState = snapshot;
  }
  if (finalDocument) {
    reportInput.finalDocument = finalDocument;
  }
  const report = await core.buildSketchDebugReport(reportInput);

  const bundleDir = await writeDebugBundle({
    kind: "sketch",
    ref,
    outDir: options.outDir,
    raw: resolved.raw,
    report,
    reportMarkdown: core.renderSketchReportMarkdown(report),
  });

  return { report, bundleDir };
}
