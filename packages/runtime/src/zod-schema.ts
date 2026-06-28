import { z } from "zod";
import type { ZodType } from "zod";

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
    }) as JsonSchema;
    return json;
  } catch {
    return { type: "object" };
  }
}

function cloneForMutation(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneForMutation(item));
  }
  if (value && typeof value === "object") {
    const cloned: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      cloned[key] = cloneForMutation(nested);
    }
    return cloned;
  }
  return value;
}

function getValueAtPath(value: unknown, path: Array<string | number>): unknown {
  let cursor = value;
  for (const segment of path) {
    if (Array.isArray(cursor) && typeof segment === "number") {
      cursor = cursor[segment];
      continue;
    }
    if (cursor && typeof cursor === "object" && typeof segment === "string") {
      cursor = (cursor as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return cursor;
}

function setValueAtPath(
  value: unknown,
  path: Array<string | number>,
  nextValue: unknown
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
    if (cursor && typeof cursor === "object" && typeof segment === "string") {
      cursor = (cursor as Record<string, unknown>)[segment];
      continue;
    }
    return false;
  }

  const last = path[path.length - 1];
  if (Array.isArray(cursor) && typeof last === "number") {
    cursor[last] = nextValue;
    return true;
  }
  if (cursor && typeof cursor === "object" && typeof last === "string") {
    (cursor as Record<string, unknown>)[last] = nextValue;
    return true;
  }
  return false;
}

function coerceStringValueForExpectedType(
  value: unknown,
  expected: "boolean" | "number"
): unknown {
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

export function parseWithTypeCoercion(
  schema: ZodType,
  args: unknown
): unknown {
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

  const coercedArgs = cloneForMutation(args);
  let changed = false;
  for (const { issue, expected } of coercibleIssues) {
    const path = issue.path.filter(
      (segment: unknown): segment is string | number =>
        typeof segment === "string" || typeof segment === "number"
    );
    const currentValue = getValueAtPath(coercedArgs, path);
    const nextValue = coerceStringValueForExpectedType(currentValue, expected);
    if (
      nextValue !== currentValue &&
      setValueAtPath(coercedArgs, path, nextValue)
    ) {
      changed = true;
    }
  }

  if (!changed) {
    throw parsed.error;
  }

  return schema.parse(coercedArgs);
}

