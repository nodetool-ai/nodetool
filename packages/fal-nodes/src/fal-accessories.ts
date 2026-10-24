/**
 * Request args for the structured model inputs the Keyframe, Element and Shot
 * nodes build (`list[keyframe]`, `list[video_element]`, `list[shot]`).
 *
 * The values are provider-neutral; this turns them into fal's shapes:
 * - keyframe → `{ image_url, frame_index }` (FLUX 3 Keyframes)
 * - video_element → `{ frontal_image_url, reference_image_urls, video_url, voice_id }` (Kling)
 * - shot → `{ prompt, duration }` (Kling `multi_prompt`)
 */

import {
  keyframeFrameIndex,
  readKeyframes,
  readShots,
  readVideoElements,
  tagElementMentions,
  type VideoElement
} from "@nodetool-ai/protocol";
import type { NodeValue } from "@nodetool-ai/node-sdk";

/**
 * Frames per second fal's keyframe models count `frame_index` in. fal does not
 * state it; its FLUX 3 example puts frame 120 at the end of a 5 second clip.
 */
export const FAL_KEYFRAME_FPS = 24;

export const ACCESSORY_PROP_TYPES: ReadonlySet<string> = new Set([
  "list[keyframe]",
  "list[video_element]",
  "list[shot]"
]);

export function isAccessoryPropType(propType: string): boolean {
  return ACCESSORY_PROP_TYPES.has(propType.toLowerCase());
}

/** Uploads a media ref and answers a URL fal can read, or null. */
export type AccessoryUpload = (
  ref: Record<string, unknown>
) => Promise<string | null>;

interface AccessoryField {
  name: string;
  propType: string;
  apiParamName?: string;
  required: boolean;
  max?: number;
  enumValues?: (string | number)[];
}

async function uploadOrThrow(
  upload: AccessoryUpload,
  ref: unknown,
  what: string
): Promise<string> {
  const url = await upload(ref as Record<string, unknown>);
  if (!url) {
    throw new Error(`${what} could not be read or uploaded to fal.`);
  }
  return url;
}

function checkMax(field: AccessoryField, count: number, noun: string): void {
  if (field.max !== undefined && count > field.max) {
    throw new Error(
      `${count} ${noun} are connected; this model takes at most ${field.max}.`
    );
  }
}

async function elementArgs(
  elements: VideoElement[],
  upload: AccessoryUpload
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  for (const [index, element] of elements.entries()) {
    const label = `Element ${index + 1}${element.name ? ` (${element.name})` : ""}`;
    const item: Record<string, unknown> = {};
    if (element.video) {
      item.video_url = await uploadOrThrow(upload, element.video, `${label} video`);
    } else {
      item.frontal_image_url = await uploadOrThrow(
        upload,
        element.frontal_image,
        `${label} frontal image`
      );
      const references: string[] = [];
      for (const ref of element.reference_images) {
        references.push(await uploadOrThrow(upload, ref, `${label} reference image`));
      }
      // Kling takes 1 to 3 reference views; with none, the frontal view is
      // the only one it has.
      item.reference_image_urls = references.length
        ? references
        : [item.frontal_image_url];
    }
    if (element.voice_id) item.voice_id = element.voice_id;
    items.push(item);
  }
  return items;
}

/** The duration value the field's enum spells `seconds` with, or null. */
function durationValue(
  field: AccessoryField | undefined,
  seconds: number
): string | number | null {
  if (!field?.enumValues?.length) return seconds;
  const match = field.enumValues.find((value) => Number(value) === seconds);
  return match ?? null;
}

/**
 * Write the accessory fields into `args`, the request built so far. Mentions
 * of named elements in the prompt (or shot prompts) become `@ElementN`.
 */
export async function applyAccessoryArgs(
  fields: readonly AccessoryField[],
  valueOf: (name: string) => NodeValue,
  args: Record<string, unknown>,
  upload: AccessoryUpload
): Promise<void> {
  const accessories = fields.filter((field) =>
    isAccessoryPropType(field.propType)
  );
  if (accessories.length === 0) return;
  const byType = (type: string): AccessoryField | undefined =>
    accessories.find((field) => field.propType.toLowerCase() === type);
  const apiName = (field: AccessoryField): string =>
    field.apiParamName ?? field.name;
  const durationField = fields.find((field) => field.name === "duration");

  let elements: VideoElement[] = [];
  const elementField = byType("list[video_element]");
  if (elementField) {
    elements = readVideoElements(valueOf(elementField.name));
    checkMax(elementField, elements.length, "elements");
    if (elements.length > 0) {
      args[apiName(elementField)] = await elementArgs(elements, upload);
    }
    if (typeof args.prompt === "string") {
      args.prompt = tagElementMentions(args.prompt, elements);
    }
  }

  const shotField = byType("list[shot]");
  if (shotField) {
    const shots = readShots(valueOf(shotField.name));
    checkMax(shotField, shots.length, "shots");
    if (shots.length > 0) {
      const seconds = shots.map((shot) => Math.max(1, Math.round(shot.duration)));
      // Shot durations go as strings: fal's Kling shot durations are the same
      // enum of "3".."15" as the clip's, and a numeric string also passes an
      // integer field.
      args[apiName(shotField)] = shots.map((shot, index) => ({
        prompt: tagElementMentions(shot.prompt, elements),
        duration: String(seconds[index])
      }));
      // `prompt` and `multi_prompt` are exclusive, and the clip is as long
      // as its shots.
      delete args.prompt;
      const total = seconds.reduce((sum, value) => sum + value, 0);
      const duration = durationValue(durationField, total);
      if (duration === null) {
        throw new Error(
          `The shots add up to ${total} s, which this model cannot make. ` +
            `Allowed lengths: ${durationField!.enumValues!.join(", ")} s.`
        );
      }
      if (durationField) args[apiName(durationField)] = duration;
      if (fields.some((field) => field.name === "shot_type")) {
        args.shot_type = "customize";
      }
    }
  }

  const keyframeField = byType("list[keyframe]");
  if (keyframeField) {
    const keyframes = readKeyframes(valueOf(keyframeField.name));
    if (keyframes.length === 0 && keyframeField.required) {
      throw new Error(
        "Connect at least one Keyframe node with an image to the keyframes input."
      );
    }
    checkMax(keyframeField, keyframes.length, "keyframes");
    const requested = Number(args.duration);
    const durationSec =
      Number.isFinite(requested) && requested > 0
        ? requested
        : Math.ceil(keyframes.at(-1)?.time ?? 0);
    const items: Record<string, unknown>[] = [];
    const seen = new Map<number, number>();
    for (const keyframe of keyframes) {
      const frame = keyframeFrameIndex(keyframe.time, FAL_KEYFRAME_FPS, durationSec);
      const clash = seen.get(frame);
      if (clash !== undefined) {
        throw new Error(
          `Keyframes at ${clash} s and ${keyframe.time} s land on the same frame ` +
            `of a ${durationSec} s video. Move one of them.`
        );
      }
      seen.set(frame, keyframe.time);
      items.push({
        image_url: await uploadOrThrow(
          upload,
          keyframe.image,
          `The keyframe image at ${keyframe.time} s`
        ),
        frame_index: frame
      });
    }
    if (items.length > 0) args[apiName(keyframeField)] = items;
  }
}
