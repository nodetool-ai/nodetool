/**
 * Central expansion of {@link EntityReference}s attached to modality params.
 *
 * Consumers (nodes, the chat WebSocket, CLI) attach `entities` to generation
 * params; {@link BaseProvider} calls {@link applyEntityReferences} on the call
 * arguments before the concrete provider runs, so every provider gets the same
 * behavior without knowing entities exist:
 *
 *   - descriptors are appended to the prompt as a `Consistency references:`
 *     block — the same shape the Apply Entities node and the runtime's
 *     entity-mention expansion produce;
 *   - on image-editing methods, reference image bytes are appended to the
 *     source-image list after the caller's own images (multi-image providers
 *     use them as references; single-image providers ignore them), and each
 *     appended image's line names its 1-based position in the final list
 *     (`- Image 2 (Harbor): …`) so the model can tell which image is which;
 *   - the `entities` field is stripped so nested delegation (e.g. the base
 *     `imageToImages` fallback calling `imageToImage`) never applies twice.
 */

import type { EntityReference } from "./types.js";

/** Methods whose first argument is a `Uint8Array[]` that accepts references. */
const IMAGE_LIST_METHODS = new Set([
  "imageToImage",
  "imageToImages",
  "inpaint",
  "inpaintImages"
]);

/**
 * Position of the params argument per entity-bearing method. Video methods
 * take media positionally too, but only get the text expansion — appending
 * entity images to `imageToVideo`'s list would change which frame animates.
 */
const PARAMS_INDEX: Record<string, number> = {
  textToImage: 0,
  textToImages: 0,
  imageToImage: 1,
  imageToImages: 1,
  inpaint: 1,
  inpaintImages: 1,
  textToVideo: 0,
  imageToVideo: 1,
  videoToVideo: 1
};

interface EntityBearingParams {
  prompt?: string | null;
  entities?: EntityReference[] | null;
}

const hasEntityParams = (value: unknown): value is EntityBearingParams =>
  !!value &&
  typeof value === "object" &&
  Array.isArray((value as EntityBearingParams).entities);

const appendConsistencyBlock = (prompt: string, lines: string[]): string => {
  if (lines.length === 0) {
    return prompt;
  }
  const block = `Consistency references:\n${lines.join("\n")}`;
  return prompt.trim().length > 0 ? `${prompt}\n\n${block}` : block;
};

/** Append the entities' descriptors to a prompt as a consistency block. */
export const injectEntityDescriptors = (
  prompt: string,
  entities: EntityReference[]
): string =>
  appendConsistencyBlock(
    prompt,
    entities
      .filter((e) => !!e.descriptor && e.descriptor.trim().length > 0)
      .map((e) => `- ${e.name}: ${e.descriptor!.trim()}`)
  );

/**
 * Expand `params.entities` in a modality method's call arguments. Returns the
 * original array untouched when the method doesn't take entities or none are
 * attached; otherwise returns a new args array with the prompt expanded, the
 * reference images appended (image-editing methods only), and `entities`
 * stripped from the params.
 */
export function applyEntityReferences(
  method: string,
  args: unknown[]
): unknown[] {
  const paramsIndex = PARAMS_INDEX[method];
  if (paramsIndex === undefined) return args;
  const params = args[paramsIndex];
  if (!hasEntityParams(params) || params.entities!.length === 0) return args;
  const entities = params.entities!;

  const next = [...args];
  let prompt: string;
  if (IMAGE_LIST_METHODS.has(method)) {
    // Appended reference images are attributed in the prompt by their 1-based
    // position in the final image list, counting the caller's own images.
    const images = Array.isArray(args[0]) ? (args[0] as Uint8Array[]) : [];
    const appended: Uint8Array[] = [];
    const lines: string[] = [];
    for (const entity of entities) {
      const image =
        entity.image instanceof Uint8Array && entity.image.length > 0
          ? entity.image
          : null;
      const descriptor = entity.descriptor?.trim();
      if (image) {
        appended.push(image);
        const position = images.length + appended.length;
        lines.push(
          `- Image ${position} (${entity.name})${descriptor ? `: ${descriptor}` : ""}`
        );
      } else if (descriptor) {
        lines.push(`- ${entity.name}: ${descriptor}`);
      }
    }
    prompt = appendConsistencyBlock(params.prompt ?? "", lines);
    if (appended.length > 0) {
      next[0] = [...images, ...appended];
    }
  } else {
    prompt = injectEntityDescriptors(params.prompt ?? "", entities);
  }

  const nextParams: EntityBearingParams = { ...params, prompt };
  delete nextParams.entities;
  next[paramsIndex] = nextParams;
  return next;
}
