/**
 * Sort the rows of an OpenAI-compatible `GET /models` listing into chat, image
 * and video models.
 *
 * The OpenAI listing shape has no field for what a model produces, so an
 * aggregator that serves chat, image and video models from one endpoint lists
 * them side by side. Two signals separate them, in order of trust:
 *
 * 1. Vendor metadata. Several gateways add a `type` (`"image"`, `"video"`,
 *    `"chat"`), and OpenRouter-style listings carry `output_modalities`.
 * 2. The model id. Image and video families have recognisable names
 *    (`flux`, `dall-e`, `seedream`, `kling`, `veo`, `sora`, …).
 *
 * The result feeds model pickers, so it errs toward offering a model: a
 * misclassified id costs the user a failed call with the endpoint's own error,
 * while a missing one leaves them with no way to pick it at all.
 */

import { isNonEmptyString, isRecord, isString } from "@nodetool-ai/protocol";

export type ListedModelKind = "language" | "image" | "video";

export interface ListedModelClassification {
  kind: ListedModelKind;
  /**
   * `metadata` when a field the endpoint sent decided the kind, `id` when only
   * the name did, `default` when neither said anything and it counts as chat.
   */
  source: "metadata" | "id" | "default";
}

/** Fields gateways use to name a model's type or task. */
const TYPE_FIELDS = ["type", "model_type", "task", "category", "mode"];

/**
 * Short family names only count at the start of an id segment, so `gen-4`
 * does not fire inside `imagen-4` and `sora` not inside `diaspora`.
 */
const WORD_START = "(?:^|[^a-z0-9])";

/**
 * Checked before {@link IMAGE_ID_PATTERN}: image-to-video ids name both media
 * (`kling-image-to-video`), and the output is what decides the picker.
 */
const VIDEO_ID_PATTERN = new RegExp(
  "video|kling|hailuo|seedance|runway|pixverse|mochi|" +
    `${WORD_START}(?:sora|veo-?\\d|wan-?\\d|wanx|gen-?4|pika|vidu|luma|ray-?2|ltx-?v|t2v|i2v)`
);

const IMAGE_ID_PATTERN = new RegExp(
  "image|dall-?e|flux|sdxl|stable-?diffusion|imagen|seedream|midjourney|" +
    "ideogram|recraft|kolors|hidream|playground-v|cogview|" +
    `${WORD_START}(?:sd-?3|t2i)`
);

function kindFromTypeValue(value: string): ListedModelKind | null {
  const lower = value.toLowerCase();
  if (lower.includes("video")) return "video";
  if (lower.includes("image")) return "image";
  if (/(chat|text|language|llm|completion)/.test(lower)) return "language";
  return null;
}

function outputModalities(row: Record<string, unknown>): string[] | null {
  const direct = row.output_modalities;
  const nested = isRecord(row.architecture)
    ? row.architecture.output_modalities
    : undefined;
  const value = Array.isArray(direct) ? direct : nested;
  if (!Array.isArray(value)) return null;
  return value.filter(isString).map((m) => m.toLowerCase());
}

function kindFromMetadata(
  row: Record<string, unknown>
): ListedModelKind | null {
  const modalities = outputModalities(row);
  if (modalities && modalities.length > 0) {
    if (modalities.includes("video")) return "video";
    // A chat model that can also draw (`["image", "text"]`) answers on the
    // chat route; only an image-only output means the images endpoint.
    if (modalities.includes("image") && !modalities.includes("text")) {
      return "image";
    }
    return "language";
  }
  for (const field of TYPE_FIELDS) {
    const value = row[field];
    if (isNonEmptyString(value)) {
      const kind = kindFromTypeValue(value);
      if (kind) return kind;
    }
  }
  return null;
}

/** Kind of a model judged by its id alone. */
export function kindFromModelId(id: string): ListedModelKind {
  const lower = id.toLowerCase();
  if (VIDEO_ID_PATTERN.test(lower)) return "video";
  if (IMAGE_ID_PATTERN.test(lower)) return "image";
  return "language";
}

/** Classify one `GET /models` row. */
export function classifyListedModel(
  row: Record<string, unknown> & { id: string }
): ListedModelClassification {
  const fromMetadata = kindFromMetadata(row);
  if (fromMetadata) return { kind: fromMetadata, source: "metadata" };
  const fromId = kindFromModelId(row.id);
  if (fromId !== "language") return { kind: fromId, source: "id" };
  return { kind: "language", source: "default" };
}
