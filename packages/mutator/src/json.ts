/** A value `JSON.parse` can return. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function isText(value: JsonValue | undefined): value is string {
  return typeof value === "string";
}

export function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
