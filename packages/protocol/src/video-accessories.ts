/**
 * Structured inputs some video models take beside the prompt: keyframes pinned
 * to times (FLUX 3 Keyframes), elements the prompt names (Kling Elements) and
 * shots of a multi-shot clip (Kling `multi_prompt`).
 *
 * The types are provider-neutral. The Keyframe, Element and Shot nodes build
 * them, and each provider factory translates them into its own request shape
 * (uploading the media, converting seconds to frames).
 */

import type { ImageRef, VideoRef } from "./api-types.js";
import { isNonEmptyString, isRecord, isString } from "./predicates.js";

/** An image the generated clip passes through at `time` seconds. */
export interface VideoKeyframe {
  type: "keyframe";
  image: ImageRef;
  /** Seconds from the start of the clip. */
  time: number;
}

/**
 * A character or object the prompt refers to. Either a frontal image with up
 * to three reference views, or a video of the element.
 */
export interface VideoElement {
  type: "video_element";
  /** The name the prompt uses for it (`@name`), empty for none. */
  name: string;
  frontal_image: ImageRef | null;
  reference_images: ImageRef[];
  video: VideoRef | null;
  /** Provider voice bound to the element, empty for none. */
  voice_id: string;
}

/** One shot of a multi-shot clip. */
export interface VideoShot {
  type: "shot";
  prompt: string;
  /** Seconds. */
  duration: number;
}

/** Most reference views a Kling element takes beside its frontal image. */
export const MAX_ELEMENT_REFERENCE_IMAGES = 3;

/** True when a media ref points at something: a uri, an asset or inline data. */
export function isMediaRefSet(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.uri) ||
    isNonEmptyString(value.asset_id) ||
    (value.data !== null && value.data !== undefined)
  );
}

/**
 * The items of a list input: an array, one item, or a JSON string of either.
 * Nested arrays are flattened, since collected list edges can deliver
 * `[[a, b], c]`.
 */
function listItems(value: unknown): unknown[] {
  if (value === null || value === undefined || value === "") return [];
  if (isString(value)) {
    try {
      return listItems(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.flatMap((item) => listItems(item));
  return [value];
}

/** The keyframes in a `list[keyframe]` value, ordered by time. */
export function readKeyframes(value: unknown): VideoKeyframe[] {
  const keyframes: VideoKeyframe[] = [];
  for (const item of listItems(value)) {
    if (!isRecord(item) || !isMediaRefSet(item.image)) continue;
    const time = Number(item.time);
    keyframes.push({
      type: "keyframe",
      image: item.image as ImageRef,
      time: Number.isFinite(time) && time > 0 ? time : 0
    });
  }
  return keyframes.sort((a, b) => a.time - b.time);
}

/** The elements in a `list[video_element]` value, in the order given. */
export function readVideoElements(value: unknown): VideoElement[] {
  const elements: VideoElement[] = [];
  for (const item of listItems(value)) {
    if (!isRecord(item)) continue;
    const frontal = isMediaRefSet(item.frontal_image)
      ? (item.frontal_image as ImageRef)
      : null;
    const video = isMediaRefSet(item.video) ? (item.video as VideoRef) : null;
    const references = Array.isArray(item.reference_images)
      ? (item.reference_images.filter(isMediaRefSet) as ImageRef[])
      : [];
    if (!frontal && !video) continue;
    elements.push({
      type: "video_element",
      name: isString(item.name) ? item.name.trim() : "",
      frontal_image: frontal,
      reference_images: references,
      video,
      voice_id: isString(item.voice_id) ? item.voice_id.trim() : ""
    });
  }
  return elements;
}

/** The shots in a `list[shot]` value, in the order given. */
export function readShots(value: unknown): VideoShot[] {
  const shots: VideoShot[] = [];
  for (const item of listItems(value)) {
    if (!isRecord(item)) continue;
    const prompt = isString(item.prompt) ? item.prompt.trim() : "";
    if (!prompt) continue;
    const duration = Number(item.duration);
    shots.push({
      type: "shot",
      prompt,
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0
    });
  }
  return shots;
}

/**
 * The frame a keyframe lands on at `fps`, kept inside `[0, durationSec * fps]`.
 */
export function keyframeFrameIndex(
  time: number,
  fps: number,
  durationSec: number
): number {
  const last = Math.round(durationSec * fps);
  return Math.min(last, Math.max(0, Math.round(time * fps)));
}

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Rewrite `@name` mentions of named elements to the `@ElementN` tags the model
 * reads, numbering elements in list order. Longer names are replaced first so
 * `@hero2` is not read as `@hero` followed by "2".
 */
export function tagElementMentions(
  prompt: string,
  elements: readonly Pick<VideoElement, "name">[]
): string {
  const named = elements
    .map((element, index) => ({ name: element.name, tag: `@Element${index + 1}` }))
    .filter((entry) => entry.name !== "")
    .sort((a, b) => b.name.length - a.name.length);
  let result = prompt;
  for (const { name, tag } of named) {
    const pattern = new RegExp(`@${escapeRegExp(name)}(?![\\w-])`, "gi");
    result = result.replace(pattern, tag);
  }
  return result;
}

/**
 * How a model family writes a reference marker in the prompt.
 * `plain` is `image 1`, `bracket` is `[Image 1]`, `at` is `@image1`,
 * `at_underscore` is `@image_1`, `at_title` is `@Image1`, `character` is
 * `character1` (images only, video numbers stay plain).
 */
export type ReferenceMarkerStyle = "plain" | "bracket" | "at" | "at_underscore" | "at_title" | "character";

interface MarkerRule {
  /** Matches when the model id starts with one of these. Omit to match all. */
  readonly modelIdPrefix?: readonly string[];
  /** Matches when the model id contains one of these. Omit to match all. */
  readonly modelIdContains?: readonly string[];
  readonly style: ReferenceMarkerStyle;
}

/** Rules per provider. The first matching rule wins. No match is `plain`. */
const MARKER_RULES: Readonly<Record<string, readonly MarkerRule[]>> = {
  dreamina: [{ style: "bracket" }],
  // HappyHorse names reference images `character1`, `character2`
  // (kie-codegen/fixtures/docs/market_happyhorse_reference-to-video.md:133).
  // Kie configs: only kling-4.0 documents `@image_1`, only grok-imagine
  // documents `@image1`. Every other kie id documents no marker.
  kie: [
    { modelIdPrefix: ["happyhorse"], style: "character" },
    { modelIdPrefix: ["kling-4.0/"], style: "at_underscore" },
    { modelIdPrefix: ["grok-imagine/"], style: "at" }
  ],
  // fal-manifest.json: cite inputs as `@Image1`, `@Video1`.
  fal: [
    { modelIdContains: ["happy-horse"], style: "character" },
    { modelIdContains: ["kling", "seedance"], style: "at_title" }
  ],
  comfy_cloud: [{ modelIdPrefix: ["wan/happyhorse"], style: "character" }]
};

/** The marker style a provider and model read in a reference-to-video prompt. */
export function referenceMarkerStyle(
  provider: string,
  modelId: string
): ReferenceMarkerStyle {
  const id = modelId.toLowerCase();
  for (const rule of MARKER_RULES[provider.toLowerCase()] ?? []) {
    const prefixOk =
      !rule.modelIdPrefix || rule.modelIdPrefix.some((p) => id.startsWith(p));
    const containsOk =
      !rule.modelIdContains || rule.modelIdContains.some((p) => id.includes(p));
    if (prefixOk && containsOk) return rule.style;
  }
  return "plain";
}

/**
 * Rewrite whole-word `image N` and `video N` tokens into a marker style.
 * Markers already in a style (`[Image 2]`, `@image2`, `@image_2`) stay as they are.
 */
export function tagReferenceNumbers(
  prompt: string,
  style: ReferenceMarkerStyle
): string {
  if (style === "plain") return prompt;
  return prompt.replace(
    /(?<![\w@[])\b(image|video)\s+(\d+)\b/gi,
    (match: string, kind: string, n: string) => {
      const lower = kind.toLowerCase();
      if (style === "character") return lower === "image" ? `character${n}` : match;
      const title = lower === "image" ? "Image" : "Video";
      if (style === "at_title") return `@${title}${n}`;
      if (style === "at") return `@${lower}${n}`;
      if (style === "at_underscore") return `@${lower}_${n}`;
      return `[${title} ${n}]`;
    }
  );
}
