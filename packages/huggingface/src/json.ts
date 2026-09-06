/**
 * The JSON this package reads — `config.json`, `model_index.json`, safetensors
 * headers, llama.cpp manifests — is written by third parties. `JSON.parse`
 * returns a value with no contract, so every read goes through a decoder here
 * rather than through a type assertion.
 */

/** Any value `JSON.parse` can produce. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

/** A JSON object. Reading an absent key yields `undefined`. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/** True when the value is a JSON object rather than an array or a scalar. */
export function isJsonObject(
  value: JsonValue | undefined
): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the value is a JSON string. */
export function isJsonString(value: JsonValue | undefined): value is string {
  return typeof value === "string";
}

/** True when the value is a JSON number. */
export function isJsonNumber(value: JsonValue | undefined): value is number {
  return typeof value === "number";
}

/** Parse JSON text into an object; `null` when it is not valid JSON, or not an object. */
export function parseJsonObject(text: string): JsonObject | null {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return isJsonObject(parsed) ? parsed : null;
}

/** Read a field as a string; `null` when it is absent or another type. */
export function jsonString(value: JsonValue | undefined): string | null {
  return isJsonString(value) ? value : null;
}

/** Read a field as an object; `null` when it is absent or another type. */
export function jsonObject(value: JsonValue | undefined): JsonObject | null {
  return isJsonObject(value) ? value : null;
}

/** Read a field as an array of numbers; `null` when any element is not one. */
export function jsonNumberArray(value: JsonValue | undefined): number[] | null {
  if (!Array.isArray(value)) return null;
  const numbers = value.filter(isJsonNumber);
  return numbers.length === value.length ? numbers : null;
}

/** Read a field as an array of JSON values; `null` when it is not an array. */
export function jsonArray(value: JsonValue | undefined): JsonValue[] | null {
  return Array.isArray(value) ? value : null;
}
