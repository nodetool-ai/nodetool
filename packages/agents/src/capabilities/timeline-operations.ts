import { z } from "zod";
import { applyTimelineTrackOp, type TimelineTrackOp, type TimelineOpState } from "@nodetool-ai/timeline/ops";
import { STAGGER_UNITS, ANIMATED_PROPERTIES, DEFAULT_BEAT_TOLERANCE_MS } from "@nodetool-ai/timeline";
import { buildTimelineToolContracts } from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import { resolveMoveTrackArgs, resolveDeleteTrackArgs } from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import type {
  TimelineDocument,
  TimelineSequence
} from "@nodetool-ai/models";
import type {
  TimelineAnimationBakeRequest,
  TimelineAnimationBakeResult,
  TimelineBridgeAsset,
  TimelineBridgeFinalState,
  TimelineFormatRetargeter,
  TimelineModel3DBaker
} from "./timeline-bridge.js";
import type { BakeCustomAnimationParams } from "../custom-animation-bake.js";
import type { CapabilityRun } from "./types.js";
import type { MediaEditRequest } from "@nodetool-ai/timeline";
import { isFiniteNumber, isRecord, isString } from "../utils/type-guards.js";

type ToolError = { error: string };

/** Operations one call may apply, so a runaway script cannot rewrite a cut. */
const MAX_OPS = 60;

export const TOOL_PREFIX = "ui_timeline_";

/** Browser generation without a real provider adapter remains excluded. */
const EXCLUDED_OPS = new Set([`${TOOL_PREFIX}generate_clip`]);
export const READ_ONLY_OPS = new Set([`${TOOL_PREFIX}get_clip_frames`]);

/** `add_track`, `ui_add_track`, and `ui_timeline_add_track` all name one tool. */
function normalizeOpName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith(TOOL_PREFIX)) return trimmed;
  const bare = trimmed.startsWith("ui_")
    ? trimmed.slice("ui_".length)
    : trimmed;
  return `${TOOL_PREFIX}${bare}`;
}

export interface ParsedOp {
  op: string;
  input: Record<string, unknown>;
}

/** An op is `{op, ...args}` — the arguments sit alongside the verb. */
export function parseOps(raw: unknown): ParsedOp[] | ToolError {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error:
        'ops must be a non-empty array, e.g. [{"op": "add_track", "type": "audio"}].'
    };
  }
  if (raw.length > MAX_OPS) {
    return {
      error: `ops holds ${raw.length} entries; at most ${MAX_OPS} per call.`
    };
  }
  const parsed: ParsedOp[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      return { error: `ops[${index}] must be an object.` };
    }
    const { op, ...input } = entry as Record<string, unknown>;
    if (!isString(op) || op.trim() === "") {
      return { error: `ops[${index}] has no \`op\` name.` };
    }
    parsed.push({ op: normalizeOpName(op), input });
  }
  return parsed;
}

export interface OpRecord {
  op: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ApplyOutcome {
  records: OpRecord[];
  state: TimelineBridgeFinalState;
}

/**
 * Read one of the caller's assets for `add_media_clip`.
 *
 * The ref a model has in hand is whatever `list_assets` printed — a bare id or
 * an `asset://<id>.<ext>` URI — so both resolve here.
 */
async function resolveTimelineAsset(
  run: CapabilityRun,
  ref: string
): Promise<TimelineBridgeAsset | null> {
  const id = ref.startsWith("asset://")
    ? ref.slice("asset://".length).replace(/\.[A-Za-z0-9]{1,8}$/, "")
    : ref;
  if (!id) return null;
  const userId = run.context.userId;
  if (!userId) return null;
  const { Asset } = await import("@nodetool-ai/models");
  // `find` is already user-scoped: someone else's asset reads as missing.
  const asset = await Asset.find(userId, id);
  if (!asset) return null;
  const thumbnails = isRecord(asset.metadata)
    ? asset.metadata["thumbnails"]
    : undefined;
  const thumbnailAssetId =
    Array.isArray(thumbnails) && isString(thumbnails[0])
      ? thumbnails[0]
      : undefined;
  const resolved: TimelineBridgeAsset = {
    id: asset.id,
    name: asset.name,
    contentType: asset.content_type
  };
  let duration = asset.duration;
  if ((!isFiniteNumber(duration) || duration <= 0) &&
      (asset.content_type.startsWith("audio/") || asset.content_type.startsWith("video/"))) {
    try {
      const { loadMediaRefBytes, probeVideoDurationSeconds } = await import("@nodetool-ai/runtime");
      const bytes = await loadMediaRefBytes({ asset_id: asset.id }, run.context);
      if (bytes) {
        duration = await probeVideoDurationSeconds(bytes, new AbortController().signal);
        if (isFiniteNumber(duration) && duration > 0) {
          asset.duration = duration;
          await asset.save();
        }
      }
    } catch {
      // An explicit clip duration remains usable when the source cannot be probed.
    }
  }
  if (isFiniteNumber(duration) && duration > 0) {
    resolved.durationMs = Math.round(duration * 1000);
  }
  if (thumbnailAssetId) resolved.thumbnailAssetId = thumbnailAssetId;
  return resolved;
}

/**
 * Run a custom animation's body once and return its curves.
 *
 * The bake is the only place that code runs — the curves are stored and every
 * render site samples them — so it goes through `bakeCustomAnimation`, the
 * same hermetic path `POST /api/timelines/animations/bake` uses. Imported
 * lazily: the sandbox is a heavy dependency for a capability most calls never
 * reach.
 */
async function bakeTimelineAnimation(
  run: CapabilityRun,
  request: TimelineAnimationBakeRequest
): Promise<TimelineAnimationBakeResult> {
  const { bakeCustomAnimation } = await import("../custom-animation-bake.js");
  const params: BakeCustomAnimationParams = {
    code: request.code,
    role: request.role,
    durationMs: request.durationMs,
    clipDurationMs: request.clipDurationMs,
    canvas: request.canvas
  };
  if (request.params !== undefined) params.params = request.params;
  if (request.staggerCount !== undefined) {
    params.staggerCount = request.staggerCount;
  }
  const baked = await bakeCustomAnimation(run.context, params);
  const result: TimelineAnimationBakeResult = { ok: baked.ok };
  if (baked.curves !== undefined) result.curves = baked.curves;
  if (baked.mask !== undefined) result.mask = baked.mask;
  if (baked.error !== undefined) result.error = baked.error;
  return result;
}

/**
 * A Blender bake that runs once per clip and dependency hash. `edit_timeline`
 * re-applies its ops on every compare-and-swap retry; without this each retry
 * would render the same picture again and store another asset.
 */
export function timelineModel3DBaker(run: CapabilityRun): TimelineModel3DBaker {
  const baked = new Map<string, ReturnType<TimelineModel3DBaker>>();
  return (request) => {
    const key = JSON.stringify([request.clip.id, request.dependencyHash]);
    const existing = baked.get(key);
    if (existing) {
      return existing;
    }
    const result = import("./timeline-bake.js").then(
      ({ bakeModel3DClipOnServer }) =>
        bakeModel3DClipOnServer(run.context, request)
    );
    baked.set(key, result);
    return result;
  };
}

/**
 * The bridge hooks that write outside the document: a Blender render of a 3D
 * clip, and the new sequence `retarget_format` creates.
 */
function writingHooks(
  run: CapabilityRun,
  sequence: TimelineSequence
): {
  bakeModel3DClip: TimelineModel3DBaker;
  retargetFormat: TimelineFormatRetargeter;
} {
  return {
    bakeModel3DClip: timelineModel3DBaker(run),
    retargetFormat: async (adapted) => {
      const { TimelineSequence } = await import("@nodetool-ai/models");
      const derivedDocument: TimelineDocument = {
        tracks: adapted.tracks,
        clips: adapted.clips,
        markers: adapted.markers
      };
      if (adapted.transcript !== undefined) {
        derivedDocument.transcript = adapted.transcript;
      }
      if (adapted.scriptEnabled !== undefined) {
        derivedDocument.scriptEnabled = adapted.scriptEnabled;
      }
      if (adapted.tempo !== undefined) derivedDocument.tempo = adapted.tempo;
      if (adapted.camera2d !== undefined) derivedDocument.camera2d = adapted.camera2d;
      if (adapted.setup !== undefined) derivedDocument.setup = adapted.setup;
      if (adapted.templateId !== undefined) {
        derivedDocument.templateId = adapted.templateId;
      }
      if (adapted.mediaTracks !== undefined) {
        derivedDocument.mediaTracks = adapted.mediaTracks;
      }
      if (adapted.trackFolders !== undefined) {
        derivedDocument.trackFolders = adapted.trackFolders;
      }
      if (adapted.storyboardMaterializations !== undefined) {
        derivedDocument.storyboardMaterializations =
          adapted.storyboardMaterializations;
      }
      const name = `${sequence.name} (${adapted.width}×${adapted.height})`;
      const created = await TimelineSequence.create({
        user_id: run.context.userId,
        project_id: sequence.project_id,
        workflow_id: sequence.workflow_id,
        name,
        fps: adapted.fps,
        width: adapted.width,
        height: adapted.height,
        duration_ms: adapted.durationMs,
        document: JSON.stringify(derivedDocument)
      });
      return { sequenceId: created.id, name };
    }
  };
}

/** Track-only batches need no simulated editor or external hooks. */
function applyTrackOps(
  sequence: TimelineSequence,
  document: TimelineDocument,
  ops: ParsedOp[]
): ApplyOutcome {
  const contracts = buildTimelineToolContracts({
    staggerUnits: STAGGER_UNITS,
    animatedProperties: ANIMATED_PROPERTIES,
    beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
  });
  let state: TimelineOpState = {
    fps: sequence.fps,
    width: sequence.width,
    height: sequence.height,
    tracks: document.tracks,
    clips: document.clips,
    markers: document.markers,
    mediaTracks: document.mediaTracks,
    tempo: document.tempo,
    playheadMs: 0,
    selectedClipIds: []
  };
  const usedIds = new Set([
    ...[
      ...document.tracks,
      ...document.clips,
      ...document.markers,
      ...(document.mediaTracks ?? [])
    ].map((unit) => unit.id),
    ...document.clips.flatMap((clip) =>
      (clip.animations ?? []).map((animation) => animation.id)
    )
  ]);
  let nextId = 0;
  const newId = (): string => {
    let id: string;
    do {
      id = `track_${++nextId}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  };
  const records: OpRecord[] = [];
  for (const entry of ops) {
    try {
      let op: TimelineTrackOp;
      if (entry.op === "ui_timeline_add_track") {
        const args = parseWithTypeCoercion(
          z.object(contracts.ui_timeline_add_track.shape),
          entry.input
        );
        op = { op: "add_track", ...args };
      } else if (entry.op === "ui_timeline_move_track") {
        const args = parseWithTypeCoercion(
          z.object(contracts.ui_timeline_move_track.shape),
          entry.input
        );
        op = { op: "move_track", ...resolveMoveTrackArgs(args) };
      } else {
        const args = parseWithTypeCoercion(
          z.object(contracts.ui_timeline_delete_track.shape),
          entry.input
        );
        op = { op: "delete_track", ...resolveDeleteTrackArgs(args) };
      }
      const outcome = applyTimelineTrackOp(state, op, { newId });
      if (outcome.error) throw new Error(outcome.error);
      state = outcome.state;
      records.push({ op: entry.op, ok: true, result: outcome.result });
    } catch (error) {
      records.push({
        op: entry.op,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return {
    records,
    state: {
      fps: state.fps,
      width: state.width,
      height: state.height,
      durationMs: state.clips.reduce(
        (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
        0
      ),
      playheadMs: state.playheadMs,
      tracks: state.tracks.map(({ id, name, type, index }) => ({
        id,
        name,
        type,
        index
      })),
      clips: state.clips.map((clip) => ({
        id: clip.id,
        name: clip.name,
        trackId: clip.trackId,
        mediaType: clip.mediaType,
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        prompt: clip.prompt,
        animations: (clip.animations ?? []).map(({ role, preset }) => ({
          role,
          preset
        }))
      })),
      documentTracks: state.tracks,
      documentClips: state.clips,
      markers: state.markers,
      mediaTracks: state.mediaTracks ?? [],
      derivedSequences: [],
      tempo: state.tempo,
      camera2d: document.camera2d ?? null,
      setup: document.setup ?? null,
      transitionCandidates: [],
      appliedTransitionCandidates: [],
      toolLog: ops.map((entry) => entry.op),
      previewTimesMs: [],
      previewedLayerKinds: []
    }
  };
}
/**
 * Run `ops` against a bridge seeded from `document`.
 *
 * A failing op is recorded and the script continues: stopping at the first
 * error hides every problem behind it, and the caller wants the whole picture.
 *
 * `hermetic` leaves out the hooks that write outside the document: the 3D
 * render and the new sequence a retarget creates. A code bake sets it. The
 * bridge then uses its in-memory fallbacks for those ops.
 */
export async function applyOps(
  run: CapabilityRun,
  sequence: TimelineSequence,
  document: TimelineDocument,
  ops: ParsedOp[],
  options: {
    hermetic?: boolean;
    generateMediaEdit?: (request: MediaEditRequest, operationIndex: number) => Promise<{ generationId: string; assetId: string }>;
    /** A baker shared across retries of one call; see {@link timelineModel3DBaker}. */
    bakeModel3DClip?: TimelineModel3DBaker;
  } = {}
): Promise<ApplyOutcome> {
  if (ops.every(({ op }) => op === "ui_timeline_add_track" || op === "ui_timeline_move_track" || op === "ui_timeline_delete_track")) {
    return applyTrackOps(sequence, document, ops);
  }
  const { createTimelineToolBridge } =
    await import("./timeline-bridge.js");
  let operationIndex = 0;
  const init: Parameters<typeof createTimelineToolBridge>[0] = {
    sequenceId: sequence.id,
    sequenceName: sequence.name,
    projectId: sequence.project_id,
    sequence: {
      fps: sequence.fps,
      width: sequence.width,
      height: sequence.height,
      tracks: document.tracks,
      clips: document.clips,
      markers: document.markers,
      transcript: document.transcript,
      scriptEnabled: document.scriptEnabled,
      templateId: document.templateId,
      trackFolders: document.trackFolders,
      storyboardMaterializations: document.storyboardMaterializations,
      tempo: document.tempo,
      camera2d: document.camera2d,
      setup: document.setup,
      mediaTracks: document.mediaTracks
    },
    resolveAsset: (ref) => resolveTimelineAsset(run, ref),
    bakeAnimation: (request) => bakeTimelineAnimation(run, request),
    loadComposition: {
      get: async (id) => {
        const { loadComposition } = await import("./compositions.js");
        const found = await loadComposition(run, id);
        return found ? found.composition : null;
      },
      listIds: async () => {
        const { loadShippedCompositions, loadUserCompositions } =
          await import("./compositions.js");
        const mine = await loadUserCompositions(run);
        return [
          ...loadShippedCompositions().map((comp) => comp.id),
          ...(Array.isArray(mine) ? mine.map((comp) => comp.id) : [])
        ];
      }
    }
  };
  if (!options.hermetic) {
    Object.assign(init, writingHooks(run, sequence));
    if (options.bakeModel3DClip) {
      init.bakeModel3DClip = options.bakeModel3DClip;
    }
    const { timelineMediaEditGenerator } = await import("./timeline-media-edit.js");
    const generate = options.generateMediaEdit ?? timelineMediaEditGenerator(run);
    init.generateMediaEdit = (request) => generate(request, operationIndex);
    init.getClipFrames = async (clip, frameOptions) => {
      const current = bridge.finalState();
      const { inspectTimelineClipFrames } = await import("./timeline-clip-frames.js");
      return inspectTimelineClipFrames(run.context, { ...sequence.toDocument(),
        tracks: current.documentTracks, clips: current.documentClips, markers: current.markers,
        mediaTracks: current.mediaTracks, tempo: current.tempo, camera2d: current.camera2d,
        id: sequence.id, projectId: sequence.project_id ?? "default", name: sequence.name,
        fps: sequence.fps, width: sequence.width, height: sequence.height,
        durationMs: sequence.duration_ms, createdAt: sequence.created_at, updatedAt: sequence.updated_at
      }, clip, frameOptions);
    };
  }
  const bridge = createTimelineToolBridge(init);
  const byName = new Map(
    bridge.tools
      .filter((tool) => !EXCLUDED_OPS.has(tool.name) && !(options.hermetic && (tool.name === `${TOOL_PREFIX}generatively_edit_clip` || READ_ONLY_OPS.has(tool.name))))
      .map((tool) => [tool.name, tool])
  );

  const records: OpRecord[] = [];
  for (const [index, { op, input }] of ops.entries()) {
    operationIndex = index;
    const tool = byName.get(op);
    if (!tool) {
      const known = [...byName.keys()]
        .map((name) => name.slice(TOOL_PREFIX.length))
        .sort()
        .join(", ");
      records.push({
        op,
        ok: false,
        error: `No timeline operation named "${op.slice(TOOL_PREFIX.length)}". Available: ${known}.`
      });
      continue;
    }
    try {
      records.push({ op, ok: true, result: await tool.execute(input) });
    } catch (e) {
      records.push({
        op,
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  return { records, state: bridge.finalState() };
}
