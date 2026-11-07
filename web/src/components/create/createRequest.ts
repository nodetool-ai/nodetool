/**
 * Builds the `generate_media` requests one press of Create sends.
 *
 * The settings come from MediaGenerationStore through the chat composer's own
 * request builder, so the model and size a person picked in either place carry
 * to the other. Each take is its own request with its own seed. Providers that
 * take no seed ignore the field, so the batch still yields separate takes.
 *
 * The composer's modes are named for what a person does ("animate", "retake");
 * `generate_media` names the provider task. `wireRequest` translates one into
 * the other and places the attached references where each mode reads them.
 */
import type { GenerateMediaRequest } from "@nodetool-ai/protocol";
import type { MediaGenerationRequest } from "../../stores/MediaGenerationStore";
import {
  referenceKind,
  type CreateMode,
  type CreateReference
} from "../../stores/CreateViewStore";
import {
  buildMediaGenerationRequest,
  type MediaRequestSettings
} from "../chat/composer/mediaGenerationRequest";

/** The slices of MediaGenerationStore the Create modes read. */
export type CreateSettings = MediaRequestSettings;

/** The `generate_media` payload: a media request plus the prompt and a seed. */
export type CreateRequestData = GenerateMediaRequest & {
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

/** The attached references, split by media family, in attach order. */
const splitReferences = (references: readonly CreateReference[]) => ({
  images: references.filter((item) => referenceKind(item) === "image"),
  videos: references.filter((item) => referenceKind(item) === "video")
});

const imageRefs = (items: readonly CreateReference[]) =>
  items.map((item) => ({ type: "image" as const, asset_id: item.assetId }));

const videoRefs = (items: readonly CreateReference[]) =>
  items.map((item) => ({ type: "video" as const, asset_id: item.assetId }));

/** Drop empty fields: the server's reference schema rejects a `null`. */
const compact = (request: Record<string, unknown>): GenerateMediaRequest =>
  Object.fromEntries(
    Object.entries(request).filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        !(Array.isArray(value) && value.length === 0)
    )
  ) as GenerateMediaRequest;

/** The `generate_media` payload for one composer request and its references. */
export const wireRequest = (
  request: MediaGenerationRequest,
  references: readonly CreateReference[]
): GenerateMediaRequest => {
  const { mode, extend_direction: extendDirection, ...settings } = request;
  const { images, videos } = splitReferences(references);
  // A batch is N requests, so each asks for one result.
  const base = { ...settings, variations: 1 };
  switch (mode) {
    case "image":
      return compact({ ...base, mode: "image" });
    case "image_edit":
      return compact({
        ...base,
        mode: "image_edit",
        source_asset_id: images[0]?.assetId,
        reference_images: imageRefs(images.slice(1))
      });
    case "video":
      return compact({ ...base, mode: "video" });
    case "image_to_video":
      // `generate_media` animates when a video request names a source image.
      return compact({ ...base, mode: "video", source_asset_id: images[0]?.assetId });
    case "reference_to_video":
      return compact({
        ...base,
        mode: "video",
        capability: "reference_to_video",
        reference_images: imageRefs(images),
        reference_videos: videoRefs(videos)
      });
    case "retake":
      return compact({
        ...base,
        mode: "video_edit",
        source_asset_id: videos[0]?.assetId,
        reference_images: imageRefs(images)
      });
    case "extend":
      return compact({
        ...base,
        mode: "video_extend",
        source_asset_id: videos[0]?.assetId,
        extension_mode: extendDirection
      });
    case "audio":
      return compact({ ...base, mode: "audio" });
    case "music":
      return compact({ ...base, mode: "music" });
    default:
      throw new Error(`The Create view cannot send ${mode} requests.`);
  }
};

/** The settings of `mode`, without prompt or seed. */
export const createSettingsRequest = (
  mode: CreateMode,
  settings: CreateSettings,
  references: readonly CreateReference[] = []
): GenerateMediaRequest =>
  wireRequest(buildMediaGenerationRequest(mode, settings), references);

/** One request per take, each with its own seed. */
export const buildCreateBatch = (
  mode: CreateMode,
  settings: CreateSettings,
  prompt: string,
  count: number,
  references: readonly CreateReference[] = [],
  seeds: readonly number[] = batchSeeds(count)
): CreateRequestData[] => {
  const base = createSettingsRequest(mode, settings, references);
  return Array.from({ length: count }, (_, index) => ({
    ...base,
    prompt,
    seed: seeds[index]
  }));
};

/** The model slice each mode reads from MediaGenerationStore. */
const MODE_SLICE: Record<CreateMode, keyof Omit<CreateSettings, "presetIds">> = {
  image: "image",
  image_edit: "imageEdit",
  video: "video",
  image_to_video: "imageToVideo",
  reference_to_video: "referenceToVideo",
  retake: "retake",
  extend: "extend",
  audio: "audio",
  music: "music"
};

/** The model picked for `mode`, or null. */
export const createModelFor = (
  mode: CreateMode,
  settings: CreateSettings
): { id?: string | null; provider?: string | null } | null =>
  settings[MODE_SLICE[mode]].model ?? null;

/** What each mode needs attached before it can run. */
export type CreateInputNeed = "image" | "video" | "image-or-video";

export const CREATE_INPUT_NEEDS: Partial<Record<CreateMode, CreateInputNeed>> = {
  image_edit: "image",
  image_to_video: "image",
  reference_to_video: "image-or-video",
  retake: "video",
  extend: "video"
};

/** Why a request cannot be sent, or null when it can. */
export type CreateBlocker = "no-prompt" | "no-model" | "no-image" | "no-video" | "no-reference";

const INPUT_BLOCKER: Record<CreateInputNeed, CreateBlocker> = {
  image: "no-image",
  video: "no-video",
  "image-or-video": "no-reference"
};

/** Whether the attached references satisfy what `mode` needs. */
export const hasNeededInput = (
  mode: CreateMode,
  references: readonly CreateReference[]
): boolean => {
  const need = CREATE_INPUT_NEEDS[mode];
  if (!need) {
    return true;
  }
  const { images, videos } = splitReferences(references);
  if (need === "image") {
    return images.length > 0;
  }
  if (need === "video") {
    return videos.length > 0;
  }
  return images.length > 0 || videos.length > 0;
};

export const createBlocker = (
  mode: CreateMode,
  settings: CreateSettings,
  prompt: string,
  references: readonly CreateReference[] = []
): CreateBlocker | null => {
  if (!prompt.trim()) {
    return "no-prompt";
  }
  const need = CREATE_INPUT_NEEDS[mode];
  if (need && !hasNeededInput(mode, references)) {
    return INPUT_BLOCKER[need];
  }
  const model = createModelFor(mode, settings);
  return model?.id && model.provider ? null : "no-model";
};
