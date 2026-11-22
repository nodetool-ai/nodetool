import { assertTimelineColorSpaceSupported } from "@nodetool-ai/timeline";
import { z } from "zod";
import {
  applyTimelineTrackOp,
  collectStepPatternFolders,
  resolveCreateStepPatternFolderTarget,
  resolveMoveDestinationFolder,
  resolveRenameStepPatternFolderTarget,
  resolveStepPatternFolderRef,
  resolveUserStepPatternRef,
  type FullStepPatternLibrary,
  type TimelineOpState,
  type TimelineOpUserStepPattern,
  type TimelineTrackOp
} from "@nodetool-ai/timeline/ops";
import {
  ANIMATED_PROPERTIES,
  DEFAULT_BEAT_TOLERANCE_MS,
  STAGGER_UNITS,
  STEP_PATTERN_ASSET_CONTENT_TYPE,
  STEP_PATTERN_FOLDER_METADATA_KEY,
  STEP_PATTERN_METADATA_KEY,
  createTimeOrderedUuid,
  isWithinStepPatternFolder,
  normalizePattern,
  normalizeStepPatternFolderPath,
  parentStepPatternFolder,
  presetIdForInstrument,
  remapStepPatternFolderPath,
  stepPatternFolderName,
  stepPatternRootFolder,
  type MidiInstrument,
  type StepPattern,
  type StepPatternLibraryKind
} from "@nodetool-ai/timeline";
import { directoryFolderId } from "@nodetool-ai/protocol";
import { midiInstrument } from "@nodetool-ai/protocol/api-schemas/timeline.js";
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
export const READ_ONLY_OPS = new Set([
  `${TOOL_PREFIX}get_clip_frames`,
  `${TOOL_PREFIX}get_pattern`,
  `${TOOL_PREFIX}list_step_patterns`,
  `${TOOL_PREFIX}save_step_pattern`,
  `${TOOL_PREFIX}create_step_pattern_folder`,
  `${TOOL_PREFIX}rename_step_pattern_folder`,
  `${TOOL_PREFIX}delete_step_pattern_folder`,
  `${TOOL_PREFIX}move_step_pattern`
]);

/**
 * True when an applied op changed nothing in the document: a read-only tool,
 * or a `detect_chords` that did not write (`write: false`, or a silent range).
 */
export function isReadOnlyRecord(parsed: ParsedOp, result: unknown): boolean {
  if (READ_ONLY_OPS.has(parsed.op)) return true;
  if (parsed.op !== `${TOOL_PREFIX}detect_chords`) return false;
  if (parsed.input.write === false) return true;
  return isRecord(result) && result.written === false;
}

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
/** Largest audio file a chord read loads (bytes). */
const MAX_DECODE_BYTES = 300 * 1024 * 1024;

/** Audio bytes by asset ref, kept for one run so a CAS retry or split clips of one asset load the file once. */
const audioBytesCache = new WeakMap<object, Map<string, Promise<Uint8Array | null>>>();

/** The media ref a clip's `currentAssetId` names, or null for an id that is no asset ref. */
function audioRefOf(assetId: string): { uri?: string; asset_id?: string; type: "audio" } | null {
  if (assetId.startsWith("package://")) return { uri: assetId, type: "audio" };
  const bare = assetId.startsWith("asset://")
    ? assetId.slice("asset://".length).replace(/\.[A-Za-z0-9]{1,8}$/, "")
    : assetId;
  if (!/^[A-Za-z0-9_-]+$/.test(bare)) return null;
  return { asset_id: bare, type: "audio" };
}

/**
 * Mono source audio of a clip's asset, for chord detection. Decodes only the
 * requested source span. A file that cannot be read gives null, as on the web.
 */
async function decodeTimelineClipAudio(
  run: CapabilityRun,
  clip: { currentAssetId?: string },
  range?: { startMs: number; endMs: number }
): Promise<{ samples: Float32Array; sampleRate: number; startMs: number } | null> {
  const assetId = clip.currentAssetId;
  if (!assetId) return null;
  const ref = audioRefOf(assetId);
  if (!ref) return null;
  const key = ref.uri ?? ref.asset_id ?? assetId;
  let cache = audioBytesCache.get(run.context);
  if (!cache) {
    cache = new Map();
    audioBytesCache.set(run.context, cache);
  }
  let loading = cache.get(key);
  if (!loading) {
    loading = (async () => {
      const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
      return loadMediaRefBytes(ref, run.context);
    })();
    cache.set(key, loading);
    loading.catch(() => cache.delete(key));
  }
  const bytes = await loading;
  if (!bytes) return null;
  if (bytes.length > MAX_DECODE_BYTES) {
    throw new Error(
      `The audio of this clip is ${Math.round(bytes.length / 1048576)} MB. Chord detection reads files up to ${Math.round(MAX_DECODE_BYTES / 1048576)} MB.`
    );
  }
  const { decodeMonoAudio } = await import("../analysis/media-decode.js");
  let audio;
  try {
    audio = await decodeMonoAudio(
      bytes,
      undefined,
      range ? { startSec: range.startMs / 1000, endSec: range.endMs / 1000 } : undefined
    );
  } catch {
    return null;
  }
  if (!audio) return null;
  if (audio.truncated) {
    throw new Error("The audio span to read is longer than one hour. Pass a smaller startBar and endBar range.");
  }
  return { samples: audio.samples, sampleRate: audio.sampleRate, startMs: audio.startSec * 1000 };
}

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

const STEP_PATTERN_ASSET_LIMIT = 500;

interface StoredStepPatternEnvelope {
  version: 1;
  name: string;
  kind: StepPatternLibraryKind;
  category: string;
  tags: string[];
  folder: string;
  pattern: StepPattern;
  instrument?: MidiInstrument;
  instrumentPreset?: string;
}

interface StoredStepPatternFolderEnvelope {
  version: 1;
  entryType: "folder";
  kind: StepPatternLibraryKind;
  name: string;
  folder: string;
}

function stepPatternProjectIdForAsset(
  userId: string,
  projectId: string | null | undefined
): string {
  return projectId && projectId !== "default" ? projectId : `personal:${userId}`;
}

function slugForStepPatternFile(name: string, fallback: string): string {
  return (
    name
      .trim()
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

/**
 * Server-backed user step pattern library (SQ43, SQ44, D92): persists JSON
 * assets of content type `application/x-nodetool-step-pattern` under
 * `Step Patterns/<Patterns|Templates>/<folder>`.
 */
function createServerStepPatternLibrary(
  run: CapabilityRun
): FullStepPatternLibrary {
  const paginateAssets = async (userId: string) => {
    const { Asset } = await import("@nodetool-ai/models");
    const assets: InstanceType<typeof Asset>[] = [];
    const seenAssetIds = new Set<string>();
    const seenCursors = new Set<string>();
    let startKey: string | undefined;
    for (;;) {
      const [page, nextCursor] = await Asset.paginate(userId, {
        contentType: STEP_PATTERN_ASSET_CONTENT_TYPE,
        limit: STEP_PATTERN_ASSET_LIMIT,
        ...(startKey ? { startKey } : {})
      });
      for (const asset of page) {
        if (!seenAssetIds.has(asset.id)) {
          seenAssetIds.add(asset.id);
          assets.push(asset);
        }
      }
      if (!nextCursor || seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      startKey = nextCursor;
    }
    return assets;
  };

  const scanLibrary = async (userId: string) => {
    const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
    const assets = await paginateAssets(userId);
    const folderAssets: Array<{
      id: string;
      kind: StepPatternLibraryKind;
      name: string;
      folder: string;
      asset: (typeof assets)[number];
    }> = [];
    const patternAssets: Array<{
      entry: TimelineOpUserStepPattern;
      asset: (typeof assets)[number];
      parsed: Record<string, unknown>;
    }> = [];

    for (const asset of assets) {
      try {
        const folderMeta = isRecord(
          asset.metadata?.[STEP_PATTERN_FOLDER_METADATA_KEY]
        )
          ? asset.metadata![STEP_PATTERN_FOLDER_METADATA_KEY]!
          : null;
        if (folderMeta && isString(folderMeta["folder"])) {
          const kind: StepPatternLibraryKind =
            folderMeta["kind"] === "template" ? "template" : "pattern";
          const folder = normalizeStepPatternFolderPath(
            kind,
            folderMeta["folder"]
          );
          const name = isString(folderMeta["name"])
            ? folderMeta["name"]
            : stepPatternFolderName(folder);
          folderAssets.push({ id: asset.id, kind, name, folder, asset });
          continue;
        }

        const bytes = await loadMediaRefBytes(
          { uri: `asset://${asset.id}`, asset_id: asset.id },
          run.context
        );
        if (!bytes || bytes.length === 0) continue;
        const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        if (!isRecord(parsed)) continue;

        if (parsed["entryType"] === "folder" && isString(parsed["folder"])) {
          const kind: StepPatternLibraryKind =
            parsed["kind"] === "template" ? "template" : "pattern";
          const folder = normalizeStepPatternFolderPath(kind, parsed["folder"]);
          const name = isString(parsed["name"])
            ? parsed["name"]
            : stepPatternFolderName(folder);
          folderAssets.push({ id: asset.id, kind, name, folder, asset });
          continue;
        }

        if (!isRecord(parsed["pattern"])) continue;
        const meta = isRecord(asset.metadata?.[STEP_PATTERN_METADATA_KEY])
          ? asset.metadata![STEP_PATTERN_METADATA_KEY]!
          : {};
        const name = isString(meta["name"])
          ? meta["name"]
          : isString(parsed["name"])
            ? parsed["name"]
            : asset.name;
        const kind: StepPatternLibraryKind =
          meta["kind"] === "template" || parsed["kind"] === "template"
            ? "template"
            : "pattern";
        const category = isString(parsed["category"])
          ? parsed["category"]
          : kind === "template"
            ? "templates"
            : "user";
        const tags = Array.isArray(parsed["tags"])
          ? parsed["tags"].filter(isString)
          : [kind, "user"];
        const rawFolder = isString(meta["folder"])
          ? meta["folder"]
          : isString(parsed["folder"])
            ? parsed["folder"]
            : undefined;
        const folder =
          rawFolder !== undefined
            ? normalizeStepPatternFolderPath(kind, rawFolder)
            : undefined;
        const parsedInstrument =
          parsed["instrument"] !== undefined
            ? midiInstrument.safeParse(parsed["instrument"])
            : null;
        const rawInstrumentPreset = isString(parsed["instrumentPreset"])
          ? parsed["instrumentPreset"].trim()
          : isString(meta["instrumentPreset"])
            ? meta["instrumentPreset"].trim()
            : "";
        const instrumentPreset =
          rawInstrumentPreset.length > 0 ? rawInstrumentPreset : undefined;
        patternAssets.push({
          asset,
          parsed,
          entry: {
            id: asset.id,
            name,
            kind,
            category,
            tags,
            ...(folder !== undefined ? { folder } : {}),
            pattern: normalizePattern(parsed["pattern"] as Partial<StepPattern>),
            ...(parsedInstrument?.success
              ? { instrument: parsedInstrument.data as MidiInstrument }
              : {}),
            ...(instrumentPreset !== undefined ? { instrumentPreset } : {})
          }
        });
      } catch {
        // Skip unreadable user pattern assets without breaking the library list.
      }
    }

    return { folderAssets, patternAssets };
  };

  const tryUpdateBytes = async (
    assetId: string,
    payload: unknown
  ): Promise<void> => {
    if (typeof run.context.updateAssetBytes !== "function") return;
    try {
      await run.context.updateAssetBytes({
        assetId,
        content: new TextEncoder().encode(`${JSON.stringify(payload, null, 2)}\n`),
        contentType: STEP_PATTERN_ASSET_CONTENT_TYPE
      });
    } catch {
      // Minimal contexts without an updateAssetBytes model interface still
      // persist authoritative folder state in asset metadata and parent_id.
    }
  };

  const tryMoveProjectFile = async (
    asset: InstanceType<typeof import("@nodetool-ai/models").Asset>,
    nextFolder: string
  ) => {
    if (!asset.workspace_path) return null;
    try {
      const { moveProjectAssetToDirectory } = await import(
        "@nodetool-ai/asset-services/project-asset"
      );
      return await moveProjectAssetToDirectory(asset, nextFolder);
    } catch {
      // Test or virtual contexts without a reachable project folder still
      // persist authoritative folder placement in metadata and parent_id.
      return null;
    }
  };

  const rewritePatternFolder = async (
    userId: string,
    item: {
      entry: TimelineOpUserStepPattern;
      asset: InstanceType<typeof import("@nodetool-ai/models").Asset>;
      parsed: Record<string, unknown>;
    },
    nextFolder: string
  ): Promise<void> => {
    const nextEnvelope: StoredStepPatternEnvelope = {
      version: 1,
      name: item.entry.name,
      kind: item.entry.kind,
      category:
        item.entry.category ??
        (item.entry.kind === "template" ? "templates" : "user"),
      tags: [...(item.entry.tags ?? [item.entry.kind, "user"])],
      folder: nextFolder,
      pattern: item.entry.pattern,
      ...(item.entry.instrument
        ? { instrument: structuredClone(item.entry.instrument) }
        : {}),
      ...(item.entry.instrumentPreset
        ? { instrumentPreset: item.entry.instrumentPreset }
        : {})
    };
    await tryUpdateBytes(item.asset.id, nextEnvelope);
    const { Asset } = await import("@nodetool-ai/models");
    const fresh = (await Asset.find(userId, item.asset.id)) ?? item.asset;
    const prevMeta = isRecord(fresh.metadata?.[STEP_PATTERN_METADATA_KEY])
      ? fresh.metadata![STEP_PATTERN_METADATA_KEY]!
      : {};
    fresh.metadata = {
      ...(fresh.metadata ?? {}),
      [STEP_PATTERN_METADATA_KEY]: {
        ...prevMeta,
        name: item.entry.name,
        kind: item.entry.kind,
        folder: nextFolder,
        category: nextEnvelope.category,
        tags: nextEnvelope.tags,
        ...(item.entry.instrumentPreset
          ? { instrumentPreset: item.entry.instrumentPreset }
          : {})
      }
    };
    fresh.parent_id = directoryFolderId(
      userId,
      stepPatternProjectIdForAsset(userId, fresh.project_id),
      nextFolder
    );
    const movedFile = await tryMoveProjectFile(fresh, nextFolder);
    try {
      await fresh.save();
    } catch (error) {
      await movedFile?.undo();
      throw error;
    }
    await movedFile?.commit();
  };

  const rewriteFolderMarker = async (
    userId: string,
    item: {
      id: string;
      kind: StepPatternLibraryKind;
      asset: InstanceType<typeof import("@nodetool-ai/models").Asset>;
    },
    nextFolder: string
  ): Promise<void> => {
    const nextName = stepPatternFolderName(nextFolder);
    const nextEnvelope: StoredStepPatternFolderEnvelope = {
      version: 1,
      entryType: "folder",
      kind: item.kind,
      name: nextName,
      folder: nextFolder
    };
    await tryUpdateBytes(item.asset.id, nextEnvelope);
    const { Asset } = await import("@nodetool-ai/models");
    const fresh = (await Asset.find(userId, item.asset.id)) ?? item.asset;
    fresh.metadata = {
      ...(fresh.metadata ?? {}),
      [STEP_PATTERN_FOLDER_METADATA_KEY]: {
        kind: item.kind,
        name: nextName,
        folder: nextFolder
      }
    };
    fresh.parent_id = directoryFolderId(
      userId,
      stepPatternProjectIdForAsset(userId, fresh.project_id),
      nextFolder
    );
    const movedFile = await tryMoveProjectFile(fresh, nextFolder);
    try {
      await fresh.save();
    } catch (error) {
      await movedFile?.undo();
      throw error;
    }
    await movedFile?.commit();
  };

  return {
    async list(): Promise<TimelineOpUserStepPattern[]> {
      const userId = run.context.userId;
      if (!userId) return [];
      const { patternAssets } = await scanLibrary(userId);
      return patternAssets.map((p) => p.entry);
    },
    async listFolders() {
      const userId = run.context.userId;
      if (!userId) return [];
      const { folderAssets, patternAssets } = await scanLibrary(userId);
      return collectStepPatternFolders(
        folderAssets.map((f) => ({ id: f.id, kind: f.kind, folder: f.folder })),
        patternAssets.map((p) => p.entry)
      );
    },
    async save({ name, kind, folder, pattern, instrument, instrumentPreset }) {
      const userId = run.context.userId;
      if (!userId) {
        throw new Error("No user is bound to this session to save a step pattern.");
      }
      if (typeof run.context.createAsset !== "function") {
        throw new Error("This session has no asset store to persist step patterns.");
      }
      const fullFolder = normalizeStepPatternFolderPath(kind, folder);
      const category = kind === "template" ? "templates" : "user";
      const tags = [kind, "user"];
      const savedInstrument = instrument ? structuredClone(instrument) : undefined;
      const savedInstrumentPreset =
        instrumentPreset ??
        (savedInstrument ? presetIdForInstrument(savedInstrument) : undefined);
      const envelope: StoredStepPatternEnvelope = {
        version: 1,
        name,
        kind,
        category,
        tags,
        folder: fullFolder,
        pattern: normalizePattern(structuredClone(pattern)),
        ...(savedInstrument ? { instrument: savedInstrument } : {}),
        ...(savedInstrumentPreset
          ? { instrumentPreset: savedInstrumentPreset }
          : {})
      };
      const fileSlug = slugForStepPatternFile(name, "pattern");
      const fileName = `${fileSlug}-${createTimeOrderedUuid()}.step-pattern.json`;
      const assetPath = `${fullFolder}/${fileName}`;
      const effectiveProjectId = stepPatternProjectIdForAsset(
        userId,
        run.context.projectId
      );
      const parentId = directoryFolderId(userId, effectiveProjectId, fullFolder);
      const stepPatternMeta = {
        name,
        kind,
        folder: fullFolder,
        category,
        tags,
        ...(savedInstrumentPreset
          ? { instrumentPreset: savedInstrumentPreset }
          : {})
      };
      const created = await run.context.createAsset({
        name: fileName,
        contentType: STEP_PATTERN_ASSET_CONTENT_TYPE,
        content: new TextEncoder().encode(`${JSON.stringify(envelope, null, 2)}\n`),
        path: assetPath,
        parentId,
        metadata: { [STEP_PATTERN_METADATA_KEY]: stepPatternMeta }
      });
      const assetId =
        isRecord(created) && isString(created["id"]) ? created["id"] : null;
      if (!assetId) {
        throw new Error("The step pattern asset was created without an id.");
      }
      const { Asset } = await import("@nodetool-ai/models");
      const asset = await Asset.find(userId, assetId);
      if (asset && !isRecord(asset.metadata?.[STEP_PATTERN_METADATA_KEY])) {
        asset.metadata = {
          ...(asset.metadata ?? {}),
          [STEP_PATTERN_METADATA_KEY]: stepPatternMeta
        };
        await asset.save();
      }
      return { id: assetId, assetId, folder: fullFolder };
    },
    async createFolder({ kind, name, parentFolder }) {
      const userId = run.context.userId;
      if (!userId) {
        throw new Error(
          "No user is bound to this session to create a step pattern folder."
        );
      }
      if (typeof run.context.createAsset !== "function") {
        throw new Error(
          "This session has no asset store to persist step pattern folders."
        );
      }
      const { folderAssets, patternAssets } = await scanLibrary(userId);
      const allFolders = collectStepPatternFolders(
        folderAssets.map((f) => ({ id: f.id, kind: f.kind, folder: f.folder })),
        patternAssets.map((p) => p.entry)
      );
      const target = resolveCreateStepPatternFolderTarget(allFolders, {
        ...(kind !== undefined ? { kind } : {}),
        name,
        ...(parentFolder !== undefined ? { parentFolder } : {})
      });
      const envelope: StoredStepPatternFolderEnvelope = {
        version: 1,
        entryType: "folder",
        kind: target.kind,
        name: target.name,
        folder: target.folder
      };
      const folderMeta = {
        kind: target.kind,
        name: target.name,
        folder: target.folder
      };
      const fileSlug = slugForStepPatternFile(target.name, "folder");
      const fileName = `folder-${fileSlug}-${createTimeOrderedUuid()}.step-pattern.json`;
      const assetPath = `${target.folder}/${fileName}`;
      const effectiveProjectId = stepPatternProjectIdForAsset(
        userId,
        run.context.projectId
      );
      const parentId = directoryFolderId(
        userId,
        effectiveProjectId,
        target.folder
      );
      const created = await run.context.createAsset({
        name: fileName,
        contentType: STEP_PATTERN_ASSET_CONTENT_TYPE,
        content: new TextEncoder().encode(`${JSON.stringify(envelope, null, 2)}\n`),
        path: assetPath,
        parentId,
        metadata: { [STEP_PATTERN_FOLDER_METADATA_KEY]: folderMeta }
      });
      const assetId =
        isRecord(created) && isString(created["id"]) ? created["id"] : null;
      if (!assetId) {
        throw new Error("The step pattern folder asset was created without an id.");
      }
      const { Asset } = await import("@nodetool-ai/models");
      const asset = await Asset.find(userId, assetId);
      if (asset && !isRecord(asset.metadata?.[STEP_PATTERN_FOLDER_METADATA_KEY])) {
        asset.metadata = {
          ...(asset.metadata ?? {}),
          [STEP_PATTERN_FOLDER_METADATA_KEY]: folderMeta
        };
        await asset.save();
      }
      return {
        id: assetId,
        name: target.name,
        kind: target.kind,
        folder: target.folder,
        parentFolder: target.parentFolder
      };
    },
    async renameFolder({ folder, newName, kind }) {
      const userId = run.context.userId;
      if (!userId) {
        throw new Error(
          "No user is bound to this session to rename a step pattern folder."
        );
      }
      const { folderAssets, patternAssets } = await scanLibrary(userId);
      const allFolders = collectStepPatternFolders(
        folderAssets.map((f) => ({ id: f.id, kind: f.kind, folder: f.folder })),
        patternAssets.map((p) => p.entry)
      );
      const plan = resolveRenameStepPatternFolderTarget(allFolders, {
        folder,
        newName,
        ...(kind !== undefined ? { kind } : {})
      });
      for (const marker of folderAssets) {
        if (
          marker.kind === plan.kind &&
          isWithinStepPatternFolder(marker.folder, plan.previousFolder)
        ) {
          const nextFolder = remapStepPatternFolderPath(
            marker.folder,
            plan.previousFolder,
            plan.folder
          );
          await rewriteFolderMarker(userId, marker, nextFolder);
        }
      }
      const movedPatterns: Array<{ id: string; name: string; folder: string }> = [];
      for (const item of patternAssets) {
        if (
          item.entry.kind === plan.kind &&
          isWithinStepPatternFolder(item.entry.folder, plan.previousFolder)
        ) {
          const nextFolder = remapStepPatternFolderPath(
            item.entry.folder!,
            plan.previousFolder,
            plan.folder
          );
          await rewritePatternFolder(userId, item, nextFolder);
          movedPatterns.push({
            id: item.entry.id,
            name: item.entry.name,
            folder: nextFolder
          });
        }
      }
      return {
        ...(plan.current.id !== undefined ? { id: plan.current.id } : {}),
        name: plan.name,
        kind: plan.kind,
        previousFolder: plan.previousFolder,
        folder: plan.folder,
        parentFolder: plan.parentFolder,
        movedPatternCount: movedPatterns.length,
        movedPatterns
      };
    },
    async deleteFolder({ folder, kind }) {
      const userId = run.context.userId;
      if (!userId) {
        throw new Error(
          "No user is bound to this session to delete a step pattern folder."
        );
      }
      const { folderAssets, patternAssets } = await scanLibrary(userId);
      const allFolders = collectStepPatternFolders(
        folderAssets.map((f) => ({ id: f.id, kind: f.kind, folder: f.folder })),
        patternAssets.map((p) => p.entry)
      );
      const target = resolveStepPatternFolderRef(allFolders, folder, kind);
      const parentFolder = parentStepPatternFolder(target.kind, target.folder);
      const movedPatterns: Array<{ id: string; name: string; folder: string }> = [];
      for (const item of patternAssets) {
        if (
          item.entry.kind === target.kind &&
          isWithinStepPatternFolder(item.entry.folder, target.folder)
        ) {
          await rewritePatternFolder(userId, item, parentFolder);
          movedPatterns.push({
            id: item.entry.id,
            name: item.entry.name,
            folder: parentFolder
          });
        }
      }
      for (const marker of folderAssets) {
        if (
          marker.kind === target.kind &&
          isWithinStepPatternFolder(marker.folder, target.folder)
        ) {
          await marker.asset.delete();
        }
      }
      return {
        kind: target.kind,
        deletedFolder: target.folder,
        parentFolder,
        movedPatternCount: movedPatterns.length,
        movedPatterns
      };
    },
    async movePattern({ pattern, folder }) {
      const userId = run.context.userId;
      if (!userId) {
        throw new Error(
          "No user is bound to this session to move a step pattern."
        );
      }
      const { folderAssets, patternAssets } = await scanLibrary(userId);
      const allFolders = collectStepPatternFolders(
        folderAssets.map((f) => ({ id: f.id, kind: f.kind, folder: f.folder })),
        patternAssets.map((p) => p.entry)
      );
      const match = resolveUserStepPatternRef(
        patternAssets.map((p) => p.entry),
        pattern
      );
      const targetFolder = resolveMoveDestinationFolder(
        allFolders,
        match.kind,
        folder
      );
      const previousFolder = match.folder ?? stepPatternRootFolder(match.kind);
      const item = patternAssets.find((p) => p.entry.id === match.id)!;
      await rewritePatternFolder(userId, item, targetFolder);
      return {
        id: match.id,
        name: match.name,
        kind: match.kind,
        previousFolder,
        folder: targetFolder
      };
    }
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
      if (adapted.workingColorSpaceVersion !== undefined) {
        derivedDocument.workingColorSpaceVersion = adapted.workingColorSpaceVersion;
      }
      if (adapted.transcript !== undefined) {
        derivedDocument.transcript = adapted.transcript;
      }
      if (adapted.scriptEnabled !== undefined) {
        derivedDocument.scriptEnabled = adapted.scriptEnabled;
      }
      if (adapted.tempo !== undefined) derivedDocument.tempo = adapted.tempo;
      if (adapted.music !== undefined) derivedDocument.music = adapted.music;
      if (adapted.master !== undefined) derivedDocument.master = adapted.master;
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
    trackFolders: document.trackFolders,
    clips: document.clips,
    markers: document.markers,
    mediaTracks: document.mediaTracks,
    tempo: document.tempo,
    music: document.music,
    master: document.master,
    playheadMs: 0,
    selectedClipIds: []
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
      const outcome = applyTimelineTrackOp(state, op, {
        newId: createTimeOrderedUuid
      });
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
      music: state.music,
      master: state.master,
      trackFolders: state.trackFolders,
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
  assertTimelineColorSpaceSupported(document);
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
      workingColorSpaceVersion: document.workingColorSpaceVersion,
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
      music: document.music,
      master: document.master,
      camera2d: document.camera2d,
      setup: document.setup,
      mediaTracks: document.mediaTracks
    },
    resolveAsset: (ref) => resolveTimelineAsset(run, ref),
    decodeClipAudio: (clip, range) => decodeTimelineClipAudio(run, clip, range),
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
    init.stepPatternLibrary = createServerStepPatternLibrary(run);
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
      .filter((tool) => !EXCLUDED_OPS.has(tool.name) && !(options.hermetic && (tool.name === `${TOOL_PREFIX}generatively_edit_clip` || tool.name === `${TOOL_PREFIX}get_clip_frames`)))
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
