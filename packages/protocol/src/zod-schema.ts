import { z } from "zod";
import type { ZodType } from "zod";
import { isNumber, isObjectLike, isString } from "./predicates.js";

export type JsonSchema = Record<string, unknown>;
export type ZodOrJsonSchema = ZodType | JsonSchema;

export function isZodSchema(schema: unknown): schema is ZodType {
  return typeof schema === "object" && schema !== null && "_def" in schema;
}

export function zodToJsonSchema(schema: ZodType): JsonSchema {
  try {
    const { $schema: _dialect, ...json } = z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io: "input",
      unrepresentable: "any"
    });
    return json;
  } catch {
    return { type: "object" };
  }
}

/**
 * A tool call's arguments as they arrive: decoded JSON, which is what the
 * coercion helpers below walk and rewrite.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function cloneForMutation(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => cloneForMutation(item));
  }
  if (isObjectLike(value)) {
    const cloned: { [key: string]: JsonValue } = {};
    for (const [key, nested] of Object.entries(value)) {
      cloned[key] = cloneForMutation(nested);
    }
    return cloned;
  }
  return value;
}

/**
 * Keys that reach `Object.prototype` instead of the object itself. A coercion
 * path is built from a Zod issue, and a record schema puts the *caller's* own
 * keys in that path, so a payload naming `__proto__` must not be walked or
 * written through.
 */
const PROTOTYPE_KEYS: ReadonlySet<string | number> = new Set([
  "__proto__",
  "constructor",
  "prototype"
]);

function getValueAtPath(
  value: JsonValue,
  path: Array<string | number>
): JsonValue | undefined {
  let cursor = value;
  for (const segment of path) {
    if (Array.isArray(cursor) && isNumber(segment)) {
      cursor = cursor[segment];
      continue;
    }
    if (PROTOTYPE_KEYS.has(segment)) {
      return undefined;
    }
    if (isObjectLike(cursor) && isString(segment)) {
      // SAFETY: the check above proved `cursor` is an object; an array reached
      // by a string key reads as `undefined`, exactly as it did before.
      cursor = (cursor as { [key: string]: JsonValue })[segment];
      continue;
    }
    return undefined;
  }
  return cursor;
}

function setValueAtPath(
  value: JsonValue,
  path: Array<string | number>,
  nextValue: JsonValue
): boolean {
  if (path.length === 0) {
    return false;
  }
  let cursor = value;
  for (let index = 0; index < path.length - 1; index++) {
    const segment = path[index];
    if (Array.isArray(cursor) && isNumber(segment)) {
      cursor = cursor[segment];
      continue;
    }
    if (PROTOTYPE_KEYS.has(segment)) {
      return false;
    }
    if (isObjectLike(cursor) && isString(segment)) {
      // SAFETY: as in `getValueAtPath` — an object indexed by a string key.
      cursor = (cursor as { [key: string]: JsonValue })[segment];
      continue;
    }
    return false;
  }

  const last = path[path.length - 1];
  if (PROTOTYPE_KEYS.has(last)) {
    return false;
  }
  if (Array.isArray(cursor) && isNumber(last)) {
    cursor[last] = nextValue;
    return true;
  }
  if (isObjectLike(cursor) && isString(last)) {
    // SAFETY: as in `getValueAtPath` — an object indexed by a string key.
    (cursor as { [key: string]: JsonValue })[last] = nextValue;
    return true;
  }
  return false;
}

function coerceStringValueForExpectedType(
  value: JsonValue | undefined,
  expected: "boolean" | "number"
): JsonValue | undefined {
  if (!isString(value)) {
    return value;
  }

  const normalized = value.trim();
  if (expected === "boolean") {
    const lower = normalized.toLowerCase();
    if (lower === "true") {
      return true;
    }
    if (lower === "false") {
      return false;
    }
    return value;
  }

  if (!normalized) {
    return value;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : value;
}

/**
 * The keys a schema accepts at its top level, when it has a shape to read.
 *
 * A strict object refuses an unrecognized key by name and says nothing about
 * what it would have taken, so a caller that guessed `{trackId, index}` for
 * `{target, toIndex}` learns only that both guesses were wrong. Each wrong
 * guess is a round trip, which is what made strict schemas expensive to author
 * against.
 */
function topLevelKeys(schema: ZodType): string[] {
  const shape = (schema as { shape?: unknown }).shape;
  if (!isObjectLike(shape)) return [];
  return Object.keys(shape);
}

/**
 * The field map of the object a schema is, looking through the wrappers a
 * field carries — `.optional()`, `.default()`, `.nullable()` — to the object
 * underneath. Null for anything that is not an object schema.
 */
function objectShape(schema: unknown): Record<string, unknown> | null {
  let current = schema;
  for (let depth = 0; depth < 8; depth++) {
    const shape = (current as { shape?: unknown } | undefined)?.shape;
    if (isObjectLike(shape)) return shape as Record<string, unknown>;
    const inner = (current as { _def?: { innerType?: unknown } } | undefined)
      ?._def?.innerType;
    if (inner === undefined) return null;
    current = inner;
  }
  return null;
}

/**
 * The keys accepted at `path`, for a refusal inside a nested bag.
 *
 * A strict style bag refuses `background.cornerRadius` by name and, without
 * this, says nothing about `radiusPx` sitting right beside it — the same dead
 * end {@link withAcceptedKeys} exists to close, one level down.
 */
function keysAtPath(schema: ZodType, path: readonly PropertyKey[]): string[] {
  let current: unknown = schema;
  for (const segment of path) {
    const shape = objectShape(current);
    if (!shape) return [];
    current = shape[String(segment)];
    if (current === undefined) return [];
  }
  return Object.keys(objectShape(current) ?? {});
}

/**
 * Per-schema advice for a key that is refused but reasonable to have guessed.
 *
 * Listing the accepted keys answers "what may I send"; it does not answer
 * "where did the thing I wanted go". `add_text_clip` refuses `x`/`y` and lists
 * thirteen style fields, none of which is obviously the position — the caller
 * reads the list, sees no coordinates, and concludes text cannot be placed.
 * A key with a remedy says where it went instead.
 */
const KEY_REMEDIES = new WeakMap<ZodType, Record<string, string>>();

/**
 * Attach remedies to a schema, by the key each one is about. Returns the same
 * schema so it can wrap a definition in place.
 */
export function withKeyRemedies<TSchema extends ZodType>(
  schema: TSchema,
  remedies: Record<string, string>
): TSchema {
  const accepted = new Set(topLevelKeys(schema));
  for (const key of Object.keys(remedies)) {
    if (accepted.has(key)) {
      throw new Error(
        `withKeyRemedies: "${key}" is a key this schema accepts, so it is ` +
          "never refused and the remedy would never be read."
      );
    }
  }
  KEY_REMEDIES.set(schema, { ...(KEY_REMEDIES.get(schema) ?? {}), ...remedies });
  return schema;
}

/** The remedies that apply to the keys one refusal actually named. */
function remediesFor(schema: ZodType, keys: readonly string[]): string[] {
  const table = KEY_REMEDIES.get(schema);
  if (!table) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    const remedy = table[key];
    if (remedy === undefined || seen.has(remedy)) continue;
    seen.add(remedy);
    out.push(remedy);
  }
  return out;
}

/**
 * Rewrite a top-level `unrecognized_keys` issue to name the keys the schema
 * does accept, plus any remedy registered for the keys it refused.
 *
 * The error stays a `ZodError` so every caller that formats issues keeps
 * working; only the sentence the model reads gets longer.
 */
function withAcceptedKeys(error: z.ZodError, schema: ZodType): z.ZodError {
  const accepted = topLevelKeys(schema);
  if (accepted.length === 0) return error;
  let changed = false;
  const issues = error.issues.map((issue) => {
    if (issue.code !== "unrecognized_keys") return issue;
    if (issue.path.length > 0) {
      const nested = keysAtPath(schema, issue.path);
      if (nested.length === 0) return issue;
      changed = true;
      return {
        ...issue,
        message:
          `${issue.message}. \`${issue.path.join(".")}\` accepts: ` +
          `${nested.join(", ")}.`
      };
    }
    changed = true;
    const advice = remediesFor(schema, issue.keys);
    return {
      ...issue,
      message:
        `${issue.message}. This op accepts: ${accepted.join(", ")}.` +
        (advice.length > 0 ? ` ${advice.join(" ")}` : "")
    };
  });
  return changed ? new z.ZodError(issues) : error;
}

export function parseWithTypeCoercion<TSchema extends ZodType>(
  schema: TSchema,
  args: unknown
): z.output<TSchema> {
  const parsed = schema.safeParse(args);
  if (parsed.success) {
    return parsed.data;
  }

  const coercibleIssues: Array<{
    issue: z.ZodIssue;
    expected: "boolean" | "number";
  }> = [];
  for (const issue of parsed.error.issues) {
    if (issue.code !== "invalid_type") {
      continue;
    }
    const expected: string = issue.expected;
    if (expected === "boolean" || expected === "number") {
      coercibleIssues.push({ issue, expected });
    }
  }
  if (coercibleIssues.length === 0) {
    throw withAcceptedKeys(parsed.error, schema);
  }

  // SAFETY: `args` are a tool call's arguments — decoded JSON — which is the
  // domain the coercion helpers below walk.
  let coercedArgs = cloneForMutation(args as JsonValue);
  let changed = false;
  for (const { issue, expected } of coercibleIssues) {
    const path = issue.path.filter(
      (segment: unknown): segment is string | number =>
        typeof segment === "string" || typeof segment === "number"
    );
    const currentValue = getValueAtPath(coercedArgs, path);
    const nextValue = coerceStringValueForExpectedType(currentValue, expected);
    // `coerceStringValueForExpectedType` answers with its input or with a
    // boolean/number, so an `undefined` result means the input was `undefined`
    // — the first arm already covers it.
    if (nextValue === currentValue || nextValue === undefined) {
      continue;
    }
    if (path.length === 0) {
      // A scalar-root schema (z.number()/z.boolean()) surfaces its issue with an
      // empty path; setValueAtPath can't write the root, so replace the whole
      // value directly. Without this, top-level scalar coercion always threw.
      coercedArgs = nextValue;
      changed = true;
    } else if (setValueAtPath(coercedArgs, path, nextValue)) {
      changed = true;
    }
  }

  if (!changed) {
    throw withAcceptedKeys(parsed.error, schema);
  }

  return schema.parse(coercedArgs);
}

