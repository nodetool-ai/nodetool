/**
 * The Create grid's feed: generations the app tracked (newest first, running
 * ones included) merged with older renders read from the asset list.
 *
 * An older render has no request record, so its settings are read back from the
 * generation metadata stamped on the asset. Assets without that metadata are
 * uploads or workflow outputs, not renders, and stay out of the grid.
 */
import { readAssetGenerationMetadata } from "@nodetool-ai/protocol";
import type { Asset } from "../../stores/ApiTypes";
import type {
  GenerationActivity,
  GenerationActivityStatus,
  GenerationMediaKind,
  GenerationRequestSettings
} from "../../stores/GenerationActivityStore";
import { isCreateMode } from "../../stores/CreateViewStore";

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

const GRID_KINDS: ReadonlySet<GenerationMediaKind> = new Set(["image", "video"]);

/** Whether the grid shows this asset's content type. */
const assetKind = (contentType: string | null | undefined): GenerationMediaKind | null => {
  if (contentType?.startsWith("image/")) {
    return "image";
  }
  if (contentType?.startsWith("video/")) {
    return "video";
  }
  return null;
};

const CAPABILITY_MODE: Record<string, "image" | "video"> = {
  text_to_image: "image",
  text_to_video: "video"
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
  for (const key of ["width", "height", "aspect_ratio", "resolution"] as const) {
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

/** Whether a retake can resend this item as a Create mode. */
export const canRetake = (item: CreateFeedItem): boolean =>
  item.request !== null &&
  item.prompt !== null &&
  isCreateMode(String(item.request.mode)) &&
  typeof item.request.provider === "string" &&
  typeof item.request.model === "string";
