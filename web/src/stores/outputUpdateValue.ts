import type { OutputUpdate } from "./ApiTypes";

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

export const normalizeOutputUpdateValue = (update: OutputUpdate): unknown => {
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
