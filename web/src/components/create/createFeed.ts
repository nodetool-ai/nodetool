/**
 * The Create grid's feed: generations the app tracked (newest first, running
 * ones included) merged with older renders read from the asset list.
 *
 * An older render has no request record, so its settings are read back from the
 * generation metadata stamped on the asset. Assets without that metadata are
 * uploads or workflow outputs, not renders, and stay out of the grid.
 *
 * A Create tab lists only its own takes: the tracked ones tagged with its
 * thread, then the generation rows the server recorded for that thread, then,
 * for a media thread from before Create sessions, the takes in its messages.
 */
import { readAssetGenerationMetadata } from "@nodetool-ai/protocol";
import type { Asset } from "../../stores/ApiTypes";
import {
  mediaKindOf,
  type GenerationActivity,
  type GenerationActivityStatus,
  type GenerationMediaKind,
  type GenerationRequestSettings
} from "../../stores/GenerationActivityStore";
import type { RouterOutputs } from "../../trpc/client";
import type { GenerationTurn } from "../chat/generation/extractGenerationTurns";

/** One generation row from `generations.list`. */
export type GenerationRecord = RouterOutputs["generations"]["list"]["generations"][number];

export interface CreateFeedItem {
  /** Stable across renders: `<generation id>:<asset id>`, or the asset id. */
  key: string;
  kind: GenerationMediaKind;
  status: GenerationActivityStatus;
  prompt: string | null;
  model: string | null;
  presetIds: string[];
  /** The stored result, once there is one. */
  assetId: string | null;
  /** The asset record, when the feed read it from the asset list. */
  asset: Asset | null;
  /** Milliseconds since the epoch. Orders the grid. */
  createdAt: number;
  error: string | null;
  /** The tracked generation, so a running one can be stopped. */
  generation: GenerationActivity | null;
  /** What a retake sends again, or null when the settings are unknown. */
  request: GenerationRequestSettings | null;
}

const GRID_KINDS: ReadonlySet<GenerationMediaKind> = new Set(["image", "video", "audio"]);

/** Whether the grid shows this asset's content type. */
const assetKind = (contentType: string | null | undefined): GenerationMediaKind | null => {
  if (contentType?.startsWith("image/")) {
    return "image";
  }
  if (contentType?.startsWith("video/")) {
    return "video";
  }
  if (contentType?.startsWith("audio/")) {
    return "audio";
  }
  return null;
};

const CAPABILITY_MODE: Record<string, "image" | "video" | "audio" | "music"> = {
  text_to_image: "image",
  text_to_video: "video",
  text_to_speech: "audio",
  text_to_music: "music"
};

/** The `generate_media` settings an asset's metadata describes, or null. */
export const requestFromAsset = (asset: Asset): GenerationRequestSettings | null => {
  const { generation } = readAssetGenerationMetadata(asset.metadata);
  const mode = generation?.capability ? CAPABILITY_MODE[generation.capability] : undefined;
  if (!generation || !mode || !generation.provider || !generation.model) {
    return null;
  }
  const params = generation.params ?? {};
  const request: GenerationRequestSettings = {
    mode,
    provider: generation.provider,
    model: generation.model
  };
  for (const key of ["width", "height", "aspect_ratio", "resolution", "voice", "speed"] as const) {
    if (params[key] !== undefined) {
      request[key] = params[key];
    }
  }
  if (typeof params.duration_seconds === "number") {
    request.duration = params.duration_seconds;
  }
  if (mode === "image") {
    request.variations = 1;
  }
  return request;
};

const fromGeneration = (generation: GenerationActivity): CreateFeedItem[] => {
  const base = {
    kind: generation.kind,
    status: generation.status,
    prompt: generation.prompt,
    model: generation.model,
    presetIds: generation.preset_ids ?? [],
    asset: null,
    createdAt: generation.startedAt,
    error: generation.error,
    generation,
    request: generation.request ?? null
  };
  if (generation.status !== "generated" || generation.assetIds.length === 0) {
    return [{ ...base, key: generation.id, assetId: null }];
  }
  return generation.assetIds.map((assetId) => ({
    ...base,
    key: `${generation.id}:${assetId}`,
    assetId
  }));
};

const fromAsset = (asset: Asset): CreateFeedItem | null => {
  const kind = assetKind(asset.content_type);
  const { prompt, generation } = readAssetGenerationMetadata(asset.metadata);
  if (!kind || !generation) {
    return null;
  }
  const createdAt = Date.parse(asset.created_at);
  return {
    key: asset.id,
    kind,
    status: "generated",
    prompt: prompt ?? null,
    model: generation.model_name ?? generation.model ?? null,
    presetIds: [],
    assetId: asset.id,
    asset,
    createdAt: Number.isNaN(createdAt) ? 0 : createdAt,
    error: null,
    generation: null,
    request: requestFromAsset(asset)
  };
};

/**
 * Tracked generations plus older renders, newest first. An asset a tracked
 * generation already produced is listed once, as that generation.
 */
export const buildCreateFeed = (
  generations: readonly GenerationActivity[],
  assets: readonly Asset[]
): CreateFeedItem[] => {
  const tracked = generations
    .filter((generation) => GRID_KINDS.has(generation.kind))
    .flatMap(fromGeneration);
  const seen = new Set(tracked.flatMap((item) => (item.assetId ? [item.assetId] : [])));
  const older = assets
    .filter((asset) => {
      const fresh = !seen.has(asset.id);
      seen.add(asset.id);
      return fresh;
    })
    .map(fromAsset)
    .filter((item): item is CreateFeedItem => item !== null);
  return [...tracked, ...older].sort((a, b) => b.createdAt - a.createdAt);
};

const recordStatus = (status: string): GenerationActivityStatus => {
  switch (status) {
    case "completed":
      return "generated";
    case "cancelled":
      return "cancelled";
    case "failed":
    case "needs_attention":
    case "interrupted":
      return "failed";
    default:
      return "generating";
  }
};

const recordError = (record: GenerationRecord): string | null =>
  record.generation_error ??
  record.provider_error ??
  record.submission_error ??
  record.output_error ??
  null;

/** A server generation row as grid items, one per asset it produced. */
export const fromGenerationRecord = (record: GenerationRecord): CreateFeedItem[] => {
  const startedAt = Date.parse(record.started_at ?? "");
  const base = {
    kind: mediaKindOf(record.capability),
    status: recordStatus(record.status),
    prompt: record.prompt,
    model: record.model || null,
    presetIds: [],
    asset: null,
    createdAt: Number.isNaN(startedAt) ? 0 : startedAt,
    error: recordError(record),
    generation: null,
    // The row keeps provider parameters, not the request, so a reloaded take
    // offers Reuse prompt rather than Retake.
    request: null
  };
  if (base.status !== "generated" || record.asset_ids.length === 0) {
    return [{ ...base, key: record.generation_id, assetId: null }];
  }
  return record.asset_ids.map((assetId) => ({
    ...base,
    key: `${record.generation_id}:${assetId}`,
    assetId
  }));
};

/**
 * A media chat turn as grid items, one per stored output. A turn that made
 * nothing and answered with text failed.
 */
export const fromGenerationTurn = (turn: GenerationTurn): CreateFeedItem[] => {
  const createdAt = Date.parse(turn.createdAt ?? "");
  const base = {
    prompt: turn.prompt || null,
    model: turn.mediaGeneration?.model ?? null,
    presetIds: [],
    asset: null,
    createdAt: Number.isNaN(createdAt) ? 0 : createdAt,
    error: null,
    generation: null,
    // A chat turn's request is not a `generate_media` request.
    request: null
  };
  const outputs: Array<{ kind: GenerationMediaKind; assetId: string | null | undefined }> = [
    ...turn.imageOutputs.map((item) => ({ kind: "image" as const, assetId: item.image?.asset_id })),
    ...turn.videoOutputs.map((item) => ({ kind: "video" as const, assetId: item.video?.asset_id })),
    ...turn.audioOutputs.map((item) => ({ kind: "audio" as const, assetId: item.audio?.asset_id }))
  ];
  const stored = outputs.flatMap(({ kind, assetId }) =>
    assetId
      ? [{ ...base, key: `${turn.id}:${assetId}`, kind, status: "generated" as const, assetId }]
      : []
  );
  if (stored.length > 0 || !turn.errorText) {
    return stored;
  }
  const kind = mediaKindOfMode(turn.mediaGeneration?.mode);
  return [{ ...base, key: turn.id, kind, status: "failed", assetId: null, error: turn.errorText }];
};

const mediaKindOfMode = (mode: string | null | undefined): GenerationMediaKind => {
  if (mode === "audio" || mode === "music") {
    return "audio";
  }
  return mode?.includes("video") || mode === "retake" || mode === "extend" ? "video" : "image";
};

/**
 * One Create tab's takes, newest first: the generations this app tracked for
 * its thread, then the rows the server recorded for it, then the takes in the
 * thread's messages. A take listed twice, matched by request id or asset, is
 * listed once, as the tracked one.
 */
export const buildSessionFeed = (
  sessionId: string,
  generations: readonly GenerationActivity[],
  records: readonly GenerationRecord[],
  turns: readonly GenerationTurn[] = []
): CreateFeedItem[] => {
  const tracked = generations
    .filter((generation) => generation.threadId === sessionId && GRID_KINDS.has(generation.kind))
    .flatMap(fromGeneration);
  const trackedIds = new Set(generations.map((generation) => generation.id));
  const seenAssets = new Set(tracked.flatMap((item) => (item.assetId ? [item.assetId] : [])));
  const recorded = records
    .filter((record) => !(record.request_id && trackedIds.has(record.request_id)))
    .flatMap(fromGenerationRecord)
    .filter((item) => GRID_KINDS.has(item.kind) && !(item.assetId && seenAssets.has(item.assetId)));
  for (const item of recorded) {
    if (item.assetId) {
      seenAssets.add(item.assetId);
    }
  }
  const fromMessages = turns
    .flatMap(fromGenerationTurn)
    .filter((item) => !(item.assetId && seenAssets.has(item.assetId)));
  return [...tracked, ...recorded, ...fromMessages].sort((a, b) => b.createdAt - a.createdAt);
};

/** The `generate_media` modes a retake can send again as they were. */
const RETAKE_MODES: ReadonlySet<string> = new Set([
  "image",
  "image_edit",
  "video",
  "video_edit",
  "video_extend",
  "audio",
  "music"
]);

/** Whether a retake can resend this item's request with a new seed. */
export const canRetake = (item: CreateFeedItem): boolean =>
  item.request !== null &&
  item.prompt !== null &&
  RETAKE_MODES.has(String(item.request.mode)) &&
  typeof item.request.provider === "string" &&
  typeof item.request.model === "string";
