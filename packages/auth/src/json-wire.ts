/**
 * The shape of decoded JSON, before any field of it is trusted.
 *
 * Auth providers read bodies that arrive from an identity service over the
 * network. Typing those bodies as `unknown` (or as an open `Record<string,
 * unknown>`) pushes the question of what is in them to every read site; naming
 * the wire shape once answers it here, and the field-level readers below are
 * the only place a wire value turns into a domain value.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A decoded JSON object — the only wire shape with readable fields. */
export type JsonObject = { [key: string]: JsonValue };

/**
 * Whether a decoded body is a JSON object. Generic in the caller's type so it
 * narrows whatever the caller holds, rather than taking bare `unknown`.
 */
export function isJsonObject<T>(value: T): value is T & JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a wire value arrived as text with something in it. Generic in the
 * caller's type so it narrows a JWT claim or an `unknown` just as well as a
 * `JsonValue`.
 */
export function isNonEmptyString<T>(value: T): value is T & string {
  return typeof value === "string" && value !== "";
}

/** Whether a wire value arrived as a real number. */
export function isFiniteNumber<T>(value: T): value is T & number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * A wire field read as an identifier: text, or a number rendered as text.
 * Anything else — `null`, an object, a missing field — reads as `undefined`
 * rather than as the string `"null"`.
 */
export function readIdentifier(
  body: JsonObject,
  field: string
): string | undefined {
  const value = body[field];
  if (isNonEmptyString(value)) return value;
  return isFiniteNumber(value) ? String(value) : undefined;
}

/** A wire field read as a non-empty string, or `undefined` if it is anything else. */
export function readString(
  body: JsonObject,
  field: string
): string | undefined {
  const value = body[field];
  return isNonEmptyString(value) ? value : undefined;
}
