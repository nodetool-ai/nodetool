/** Decoded JSON and the `document` unwrapping shared by the debug targets. */
import { isRecord, isString } from "./predicates.js";

/** A decoded JSON document, before anything validates its shape. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * The document a target carries, unwrapping a `document` field (string or
 * object) when there is one. Never throws — an unreadable document is a
 * validation finding, not a crash.
 */
export function documentOf(raw: unknown): JsonValue {
  // SAFETY: a target is read from a JSON file or a json column, so every
  // branch below carries decoded JSON.
  if (!isRecord(raw)) return raw as JsonValue;
  const inner = raw.document;
  if (isString(inner)) {
    try {
      return JSON.parse(inner);
    } catch {
      return inner;
    }
  }
  // SAFETY: same JSON provenance as the branch above.
  if (inner !== undefined) return inner as JsonValue;
  return raw as JsonValue;
}
