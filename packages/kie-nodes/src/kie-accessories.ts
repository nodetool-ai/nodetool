/**
 * Request params for the structured inputs the Element and Shot nodes build
 * (`list[video_element]`, `list[shot]`), in KIE's Kling 3.0 shapes:
 * - video_element → `{ name, description, element_input_urls }`, referenced in
 *   the prompt as `@name`
 * - shot → `{ prompt, duration }`, with the multi-shot switch turned on and
 *   the clip duration set to the shots' total
 */

import { readShots, readVideoElements } from "@nodetool-ai/protocol";
import type { NodeValue } from "@nodetool-ai/node-sdk";

export const KIE_ACCESSORY_TYPES: ReadonlySet<string> = new Set([
  "list[video_element]",
  "list[shot]"
]);

/** Uploads a media ref of `kind` and answers its KIE URL. */
export type KieAccessoryUpload = (
  kind: "image" | "video",
  ref: unknown
) => Promise<string>;

interface KieAccessoryField {
  name: string;
  type: string;
  values?: string[];
  max?: number;
}

function checkMax(field: KieAccessoryField, count: number, noun: string): void {
  if (field.max !== undefined && count > field.max) {
    throw new Error(
      `${count} ${noun} are connected; this model takes at most ${field.max}.`
    );
  }
}

/** The duration value `field` takes for `seconds`, or null when it has none. */
function durationValue(
  field: KieAccessoryField,
  seconds: number
): string | number | null {
  if (field.values?.length) {
    return field.values.find((value) => Number(value) === seconds) ?? null;
  }
  return field.type === "int" || field.type === "float"
    ? seconds
    : String(seconds);
}

/**
 * Write the accessory fields of `fields` into `params`, the request built so
 * far. `paramName` maps a field name to its request key.
 */
export async function applyKieAccessoryParams(
  fields: readonly KieAccessoryField[],
  valueOf: (name: string) => NodeValue,
  params: Record<string, unknown>,
  paramName: (name: string) => string,
  upload: KieAccessoryUpload
): Promise<void> {
  const field = (name: string): KieAccessoryField | undefined =>
    fields.find((candidate) => candidate.name === name);

  for (const elementField of fields.filter(
    (candidate) => candidate.type === "list[video_element]"
  )) {
    const elements = readVideoElements(valueOf(elementField.name));
    checkMax(elementField, elements.length, "elements");
    if (elements.length === 0) continue;
    const items: Record<string, unknown>[] = [];
    for (const [index, element] of elements.entries()) {
      // An unnamed element answers to @Element1, @Element2, as on fal.
      const name = element.name || `Element${index + 1}`;
      const urls = element.video
        ? [await upload("video", element.video)]
        : [
            await upload("image", element.frontal_image),
            ...(await Promise.all(
              element.reference_images.map((ref) => upload("image", ref))
            ))
          ];
      items.push({ name, description: name, element_input_urls: urls });
    }
    params[paramName(elementField.name)] = items;
  }

  for (const shotField of fields.filter(
    (candidate) => candidate.type === "list[shot]"
  )) {
    const shots = readShots(valueOf(shotField.name));
    checkMax(shotField, shots.length, "shots");
    if (shots.length === 0) continue;
    const seconds = shots.map((shot) => Math.max(1, Math.round(shot.duration)));
    params[paramName(shotField.name)] = shots.map((shot, index) => ({
      prompt: shot.prompt,
      duration: seconds[index]
    }));
    for (const flag of ["multi_shots", "customize_multi_shots"]) {
      if (field(flag)) params[paramName(flag)] = true;
    }
    if (field("prefer_multi_shots")) {
      params[paramName("prefer_multi_shots")] = false;
    }
    const durationField = field("duration");
    if (durationField) {
      const total = seconds.reduce((sum, value) => sum + value, 0);
      const duration = durationValue(durationField, total);
      if (duration === null) {
        throw new Error(
          `The shots add up to ${total} s, which this model cannot make. ` +
            `Allowed lengths: ${durationField.values!.join(", ")} s.`
        );
      }
      params[paramName("duration")] = duration;
    }
  }
}
