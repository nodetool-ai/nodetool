import type { OutputUpdate } from "./ApiTypes";

/**
 * Narrows a loose WebSocket message to {@link OutputUpdate} after verifying
 * the discriminator.  Replaces the `msg as unknown as OutputUpdate` casts
 * that were scattered across hooks/stores.
 */
export function isOutputUpdate(
  msg: { type: string }
): msg is OutputUpdate {
  return msg.type === "output_update";
}

const RICH_OUTPUT_TYPES = new Set([
  "image",
  "audio",
  "video",
  "html",
  "document",
  "model_3d"
]);

const isPlainObject = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const normalizeOutputUpdateValue = (update: OutputUpdate) => {
  if (!RICH_OUTPUT_TYPES.has(update.output_type)) {
    return update.value;
  }

  if (isPlainObject(update.value) && typeof update.value.type === "string") {
    return update.value;
  }

  if (isPlainObject(update.value)) {
    return {
      type: update.output_type,
      ...update.value
    };
  }

  return {
    type: update.output_type,
    data: update.value
  };
};
