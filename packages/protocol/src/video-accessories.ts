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
