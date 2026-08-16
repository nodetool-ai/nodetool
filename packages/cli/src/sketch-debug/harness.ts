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
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  SketchDebugReport,
  SketchInteractionRecord,
  SketchValidation
} from "@nodetool-ai/execution/sketch-debug";
import type { SketchInteractionStep } from "./interactions.js";
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

function defaultOutDir(ref: string): string {
  const slug =
    ref
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "sketch";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(`nodetool-debug/sketch-${slug}-${stamp}`);
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
    const byName = new Map(bridge.tools.map((t) => [t.name, t]));

    for (const step of steps) {
      const tool = byName.get(step.tool);
      if (!tool) {
        const known = [...byName.keys()].sort().join(", ");
        interactions.push({
          tool: step.tool,
          input: step.input,
          ok: false,
          error: `No sketch tool named "${step.tool}". Available: ${known}.`
        });
        deps.onLog?.(`✗ ${step.tool}: unknown tool`);
        continue;
      }
      try {
        const result = await tool.execute(step.input);
        interactions.push({
          tool: step.tool,
          input: step.input,
          ok: true,
          result
        });
        deps.onLog?.(`✓ ${step.tool}`);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        interactions.push({
          tool: step.tool,
          input: step.input,
          ok: false,
          error
        });
        deps.onLog?.(`✗ ${step.tool}: ${error}`);
      }
    }
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

  const bundleDir = options.outDir
    ? resolve(options.outDir)
    : defaultOutDir(ref);
  await mkdir(bundleDir, { recursive: true });
  await writeFile(
    join(bundleDir, "sketch.json"),
    JSON.stringify(resolved.raw, null, 2),
    "utf8"
  );
  await writeFile(
    join(bundleDir, "report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  await writeFile(
    join(bundleDir, "report.md"),
    core.renderSketchReportMarkdown(report),
    "utf8"
  );

  return { report, bundleDir };
}
