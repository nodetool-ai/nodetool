/**
 * Builds the `generate_media` requests one press of Create sends.
 *
 * The settings come from MediaGenerationStore, the same slices the chat
 * composer reads, so the model and size a person picked in either place carry
 * to the other. Each take is its own request with its own seed. Providers that
 * take no seed ignore the field, so the batch still yields separate takes.
 */
import {
  resolveImageSize,
  type MediaGenerationRequest
} from "../../stores/MediaGenerationStore";
import type useMediaGenerationStore from "../../stores/MediaGenerationStore";
import type { CreateMode } from "../../stores/CreateViewStore";

type MediaSettings = ReturnType<typeof useMediaGenerationStore.getState>;

/** The slices of MediaGenerationStore the Create modes read. */
export type CreateSettings = Pick<MediaSettings, "image" | "video" | "presetIds">;

/** The `generate_media` payload: a media request plus the prompt and a seed. */
export type CreateRequestData = MediaGenerationRequest & {
  prompt: string;
  seed?: number;
};

/** Seeds are positive 31-bit integers, which every provider accepts. */
const SEED_RANGE = 2 ** 31;

export const randomSeed = (): number => {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] % SEED_RANGE;
};

/** `count` distinct seeds, consecutive from a random start so none repeat. */
export const batchSeeds = (count: number, start: number = randomSeed()): number[] =>
  Array.from({ length: count }, (_, index) => (start + index) % SEED_RANGE);

/** The settings of `mode`, without prompt or seed. */
export const createSettingsRequest = (
  mode: CreateMode,
  settings: CreateSettings
): MediaGenerationRequest => {
  if (mode === "image") {
    const { image } = settings;
    const { width, height } = resolveImageSize(image.resolution, image.aspectRatio);
    return {
      mode: "image",
      provider: image.model?.provider ?? null,
      model: image.model?.id ?? null,
      width,
      height,
      aspect_ratio: image.aspectRatio,
      resolution: image.resolution,
      // A batch is N requests, so each asks for one image.
      variations: 1
    };
  }
  const { video } = settings;
  const request: MediaGenerationRequest = {
    mode: "video",
    provider: video.model?.provider ?? null,
    model: video.model?.id ?? null,
    aspect_ratio: video.aspectRatio,
    resolution: video.resolution,
    duration: video.duration
  };
  const presetIds = settings.presetIds.video;
  if (presetIds && presetIds.length > 0) {
    request.preset_ids = presetIds;
  }
  return request;
};

/** One request per take, each with its own seed. */
export const buildCreateBatch = (
  mode: CreateMode,
  settings: CreateSettings,
  prompt: string,
  count: number,
  seeds: readonly number[] = batchSeeds(count)
): CreateRequestData[] => {
  const base = createSettingsRequest(mode, settings);
  return Array.from({ length: count }, (_, index) => ({
    ...base,
    prompt,
    seed: seeds[index]
  }));
};

/** Why a request cannot be sent, or null when it can. */
export type CreateBlocker = "no-prompt" | "no-model";

export const createBlocker = (
  mode: CreateMode,
  settings: CreateSettings,
  prompt: string
): CreateBlocker | null => {
  if (!prompt.trim()) {
    return "no-prompt";
  }
  const model = mode === "image" ? settings.image.model : settings.video.model;
  return model?.id && model.provider ? null : "no-model";
};
