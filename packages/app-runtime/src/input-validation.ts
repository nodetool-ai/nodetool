/** Input admission shared by browser and headless app runtimes. */

import { isRecord, isString } from "./predicates.js";

const REQUIRED_MEDIA_NODE_TYPES = new Set([
  "nodetool.input.ImageInput",
  "nodetool.input.ImageListInput",
  "nodetool.input.VideoInput",
  "nodetool.input.VideoListInput",
  "nodetool.input.AudioInput",
  "nodetool.input.AudioListInput",
  "nodetool.input.RealtimeAudioInput",
  "nodetool.input.DocumentInput"
]);

const isEmptyValue = (value: unknown): boolean => {
  if (value == null) return true;
  if (isString(value)) return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
};

/** True when a required media input has no usable value to send. */
export const isMissingRequiredMediaValue = (
  nodeType: string,
  value: unknown
): boolean => REQUIRED_MEDIA_NODE_TYPES.has(nodeType) && isEmptyValue(value);

const REQUIRED_MODEL_NODE_TYPES = new Set([
  "nodetool.input.LanguageModelInput",
  "nodetool.input.ImageModelInput",
  "nodetool.input.VideoModelInput",
  "nodetool.input.TTSModelInput",
  "nodetool.input.ASRModelInput",
  "nodetool.input.MusicModelInput",
  "nodetool.input.EmbeddingModelInput"
]);

const isUnsetModel = (value: unknown): boolean =>
  !isRecord(value) ||
  !isString(value.provider) ||
  value.provider === "" ||
  value.provider === "empty" ||
  !isString(value.id) ||
  value.id === "";

/**
 * True when a model input has no model to run with. A value the operation sends
 * replaces the node's own model, so the node's model counts only without one.
 */
export const isMissingRequiredModelValue = (
  nodeType: string,
  value: unknown,
  nodeValue: unknown
): boolean =>
  REQUIRED_MODEL_NODE_TYPES.has(nodeType) &&
  isUnsetModel(value === undefined ? nodeValue : value);

/** The label of the first widget in a UI tree that uses this binding. */
export const findWidgetLabel = (
  tree: unknown,
  binding: string
): string | undefined => {
  if (Array.isArray(tree)) {
    for (const item of tree) {
      const label = findWidgetLabel(item, binding);
      if (label !== undefined) return label;
    }
    return undefined;
  }
  if (!isRecord(tree)) return undefined;
  if (tree.binding === binding && isString(tree.label) && tree.label !== "") {
    return tree.label;
  }
  return findWidgetLabel(Object.values(tree), binding);
};
