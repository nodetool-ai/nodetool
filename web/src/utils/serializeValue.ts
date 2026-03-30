/**
 * Serializes a value to a string representation.
 *
 * Handles primitives (strings, numbers, booleans) and attempts to JSON-serialize objects.
 * Returns null for null/undefined inputs or if serialization fails.
 *
 * @param value - The value to serialize (can be any type)
 * @returns The serialized string, or null if serialization fails
 *
 * @example
 * ```ts
 * serializeValue("hello") // "hello"
 * serializeValue(42) // "42"
 * serializeValue({ foo: "bar" }) // '{\n  "foo": "bar"\n}'
 * serializeValue(null) // null
 * ```
 */
export const serializeValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return null;
  }
};

