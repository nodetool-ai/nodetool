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
