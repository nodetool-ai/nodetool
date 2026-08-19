/**
 * Guest and model calls miss the documented argument shape in a few
 * predictable ways: camelCase keys where the schema is snake_case, a lone
 * string where the first required field is a string, a name plus an options
 * object. Fold those here so every entrance (import, belt, MCP) agrees.
 *
 * Nested records are left alone — Apify actor input keeps its own names.
 */

import type { JsonSchema } from "@nodetool-ai/runtime";

import { isRecord, isString } from "../utils/type-guards.js";

export interface CapabilityArgSpec {
  readonly name: string;
  readonly inputSchema: JsonSchema;
}

/**
 * Copy camelCase keys onto their snake_case form when the snake_case key is
 * absent. `actorId` becomes `actor_id`; an already-set `actor_id` wins.
 */
export function withSnakeCaseAliases(
  args: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  for (const [key, value] of Object.entries(args)) {
    if (!/[A-Z]/.test(key)) continue;
    const snake = key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
    if (!(snake in out)) {
      out[snake] = value;
    }
  }
  return out;
}

/**
 * Turn the argument list a guest call produced into the one record the
 * implementation reads.
 *
 * A leading string fills the first required string field when that field is
 * missing from a following options object — `save_asset("reel.mp4", {source})`
 * and `get_apify_actor_schema("owner/name")`.
 */
export function coerceCapabilityArgs(
  spec: CapabilityArgSpec,
  args: readonly unknown[]
): Record<string, unknown> {
  const first = args[0];
  if (args.length === 0 || first === undefined || first === null) {
    return {};
  }
  if (isRecord(first) && args.length === 1) {
    return withSnakeCaseAliases(first);
  }
  if (isString(first)) {
    const key = firstRequiredStringKey(spec.inputSchema);
    if (key === undefined) {
      throw new Error(oneObjectMessage(spec));
    }
    const extra = extraRecord(args[1], spec, args.length);
    if (key in extra) {
      return withSnakeCaseAliases(extra);
    }
    return withSnakeCaseAliases({ ...extra, [key]: first });
  }
  if (isRecord(first) && args.length === 2 && isRecord(args[1])) {
    return withSnakeCaseAliases({ ...first, ...args[1] });
  }
  throw new Error(oneObjectMessage(spec));
}

function extraRecord(
  second: unknown,
  spec: CapabilityArgSpec,
  length: number
): Record<string, unknown> {
  if (length <= 1 || second === undefined) {
    return {};
  }
  if (!isRecord(second)) {
    throw new Error(oneObjectMessage(spec));
  }
  return second;
}

function firstRequiredStringKey(schema: JsonSchema): string | undefined {
  const required = schema.required;
  if (!Array.isArray(required)) return undefined;
  const properties = schema.properties;
  for (const key of required) {
    if (!isString(key)) continue;
    const field = isRecord(properties) ? properties[key] : undefined;
    if (isRecord(field) && field.type === "string") {
      return key;
    }
  }
  return undefined;
}

function oneObjectMessage(spec: CapabilityArgSpec): string {
  const required = spec.inputSchema.required;
  const keys = Array.isArray(required)
    ? required.filter((key): key is string => isString(key))
    : [];
  const shape = keys.length > 0 ? ` ({ ${keys.join(", ")} })` : "";
  return `${spec.name} takes one arguments object${shape}`;
}
