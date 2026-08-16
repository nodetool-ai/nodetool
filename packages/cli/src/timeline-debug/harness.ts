/**
 * The timeline debug harness: the CLI host around the shared validator.
 *
 * `runTimelineValidate` is the cheap pre-flight — load a document, check it,
 * report. `runTimelineDebug` additionally replays a scripted edit session
 * against the headless `ui_timeline_*` bridge (the one the tool-loop eval
 * drives), validates the document the session left behind, and writes a
 * self-contained bundle.
 *
 * Everything that could pull in a heavy package is injected with a lazy
 * default: the validator core (`@nodetool-ai/execution/timeline-debug`) and the
 * bridge factory (`@nodetool-ai/agents`). Tests supply their own and load
 * neither.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { TimelineDocument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import type {
  TimelineDebugReport,
  TimelineInteractionRecord,
  TimelineValidation
} from "@nodetool-ai/execution/timeline-debug";
import type { TimelineInteractionStep } from "./interactions.js";
import {
  resolveTimelineTarget,
  type ResolvedTimelineTarget,
  type TimelineSequenceSettings,
  type TimelineTargetDeps
} from "./target.js";

/** The pieces of the shared core this host calls. */
export interface TimelineDebugCore {
  validateTimelineSequence: (
    raw: unknown,
    meta?: TimelineSequenceSettings
  ) => TimelineValidation | Promise<TimelineValidation>;
  buildTimelineDebugReport: (input: {
    target: TimelineDebugReport["target"];
    document: unknown;
    meta?: TimelineSequenceSettings;
    interactions?: TimelineInteractionRecord[];
    finalState?: unknown;
    finalDocument?: unknown;
  }) => TimelineDebugReport | Promise<TimelineDebugReport>;
  renderTimelineReportMarkdown: (report: TimelineDebugReport) => string;
}

/** The bridge surface this host drives — one tool per `ui_timeline_*` name. */
export interface TimelineBridgeTool {
  name: string;
  /**
   * HOLDOUT (anti-slop/no-unknown-returns): a `ui_timeline_*` tool answers in
   * the open tool-result domain, and the bridge that implements this lives in
   * `@nodetool-ai/agents`.
   */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/** The bridge's snapshot, including the full document the session ended with. */
export interface TimelineBridgeSnapshot {
  documentTracks?: TimelineDocument["tracks"];
  documentClips?: TimelineDocument["clips"];
}

export interface TimelineBridge {
  tools: TimelineBridgeTool[];
  finalState: () => TimelineBridgeSnapshot;
}

export type CreateTimelineBridge = (initial: {
  sequence: TimelineSequenceSettings & {
    tracks: TimelineDocument["tracks"];
    clips: TimelineDocument["clips"];
  };
}) => TimelineBridge;

export interface TimelineDebugDeps extends TimelineTargetDeps {
  /** Defaults to `@nodetool-ai/execution/timeline-debug`. */
  core?: TimelineDebugCore;
  /** Defaults to `createTimelineToolBridge` from `@nodetool-ai/agents`. */
  createBridge?: CreateTimelineBridge;
  onLog?: (line: string) => void;
}

export interface TimelineDebugOptions {
  interact?: TimelineInteractionStep[];
  outDir?: string;
}

export interface TimelineValidateResult {
  target: ResolvedTimelineTarget["target"];
  validation: TimelineValidation;
}

export interface TimelineDebugResult {
  report: TimelineDebugReport;
  bundleDir: string;
}

async function loadCore(): Promise<TimelineDebugCore> {
  const core = await import("@nodetool-ai/execution/timeline-debug");
  return {
    validateTimelineSequence: (raw, meta) =>
      core.validateTimelineSequence(raw, meta),
    buildTimelineDebugReport: (input) => core.buildTimelineDebugReport(input),
    renderTimelineReportMarkdown: (report) =>
      core.renderTimelineReportMarkdown(report)
  };
}

async function loadBridgeFactory(): Promise<CreateTimelineBridge> {
  const { createTimelineToolBridge } = await import("@nodetool-ai/agents");
  return (initial) =>
    // SAFETY: the eval-surface bridge in @nodetool-ai/agents implements this
    // exact tool list and snapshot — it is the bridge this type describes. The
    // two packages declare the timeline document types independently, and that
    // duplication is the only reason the structures do not line up.
    createTimelineToolBridge(
      initial as Parameters<typeof createTimelineToolBridge>[0]
    ) as TimelineBridge;
}

function defaultOutDir(ref: string): string {
  const slug =
    ref
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "timeline";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(`nodetool-debug/timeline-${slug}-${stamp}`);
}

/** Load a timeline and validate it — no bridge, no bundle. */
export async function runTimelineValidate(
  ref: string,
  deps: TimelineDebugDeps
): Promise<TimelineValidateResult> {
  const resolved = await resolveTimelineTarget(ref, deps);
  const core = deps.core ?? (await loadCore());
  const validation = await core.validateTimelineSequence(
    resolved.raw,
    resolved.meta
  );
  return { target: resolved.target, validation };
}

/**
 * Replay `--interact` against the headless bridge and write the bundle.
 *
 * A failing step is recorded and the script continues: a run that stops at the
 * first error hides every problem behind it, and the report is what the caller
 * came for.
 */
export async function runTimelineDebug(
  ref: string,
  options: TimelineDebugOptions,
  deps: TimelineDebugDeps
): Promise<TimelineDebugResult> {
  const resolved = await resolveTimelineTarget(ref, deps);
  const core = deps.core ?? (await loadCore());

  const steps = options.interact ?? [];
  const interactions: TimelineInteractionRecord[] = [];
  let snapshot: TimelineBridgeSnapshot | undefined;

  if (steps.length > 0) {
    const createBridge = deps.createBridge ?? (await loadBridgeFactory());
    const bridge = createBridge({
      sequence: {
        ...resolved.meta,
        tracks: resolved.document.tracks,
        clips: resolved.document.clips
      }
    });
    const byName = new Map(bridge.tools.map((t) => [t.name, t]));

    for (const step of steps) {
      const tool = byName.get(step.tool);
      if (!tool) {
        const known = [...byName.keys()].sort().join(", ");
        interactions.push({
          tool: step.tool,
          input: step.input,
          ok: false,
          error: `No timeline tool named "${step.tool}". Available: ${known}.`
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

  // The bridge hands back its full tracks and clips, so the document the
  // session ended with is a real document — markers ride along untouched,
  // since no timeline tool edits them.
  const finalDocument: TimelineDocument | undefined =
    snapshot?.documentTracks && snapshot.documentClips
      ? {
          tracks: snapshot.documentTracks,
          clips: snapshot.documentClips,
          markers: resolved.document.markers
        }
      : undefined;

  const reportInput: Parameters<typeof core.buildTimelineDebugReport>[0] = {
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
  const report = await core.buildTimelineDebugReport(reportInput);

  const bundleDir = options.outDir
    ? resolve(options.outDir)
    : defaultOutDir(ref);
  await mkdir(bundleDir, { recursive: true });
  await writeFile(
    join(bundleDir, "timeline.json"),
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
    core.renderTimelineReportMarkdown(report),
    "utf8"
  );

  return { report, bundleDir };
}
