import { z } from "zod";
import type { ZodType } from "zod";

export type JsonSchema = Record<string, unknown>;
export type ZodOrJsonSchema = ZodType | JsonSchema;

export function isZodSchema(schema: unknown): schema is ZodType {
  return typeof schema === "object" && schema !== null && "_def" in schema;
}

export function zodToJsonSchema(schema: ZodType) {
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
  if (value && typeof value === "object") {
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
    if (Array.isArray(cursor) && typeof segment === "number") {
      cursor = cursor[segment];
      continue;
    }
    if (PROTOTYPE_KEYS.has(segment)) {
      return undefined;
    }
    if (cursor && typeof cursor === "object" && typeof segment === "string") {
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
    if (Array.isArray(cursor) && typeof segment === "number") {
      cursor = cursor[segment];
      continue;
    }
    if (PROTOTYPE_KEYS.has(segment)) {
      return false;
    }
    if (cursor && typeof cursor === "object" && typeof segment === "string") {
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
  if (Array.isArray(cursor) && typeof last === "number") {
    cursor[last] = nextValue;
    return true;
  }
  if (cursor && typeof cursor === "object" && typeof last === "string") {
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
  if (typeof value !== "string") {
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
    throw parsed.error;
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
    throw parsed.error;
  }

  return schema.parse(coercedArgs);
}

