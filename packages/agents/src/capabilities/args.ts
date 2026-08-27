/**
 * Guest and model calls miss the documented argument shape in a few
 * predictable ways: camelCase keys where the schema is snake_case, a lone
 * string where the first required field is a string, a name plus an options
 * object, `id` where the schema says `workflow_id`. Fold those here so every
 * entrance (import, belt, MCP) agrees.
 *
 * Nested records are left alone — Apify actor input keeps its own names.
 *
 * What is left over after folding is checked rather than passed on. A call
 * that supplied arguments but not the required ones used to reach the
 * implementation with the key `undefined`, and the implementation then reported
 * on the *entity*: `get_workflow({ id })` came back "Workflow undefined was not
 * found", which reads as a missing workflow and is really a misspelled
 * argument. The report belongs to the call.
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
 *
 * Throws when the folded record is still missing a required field, naming the
 * call rather than letting the implementation report on an entity it looked up
 * under `undefined`.
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
    return checked(spec, withIdAlias(spec, withSnakeCaseAliases(first)));
  }
  if (isString(first)) {
    const key = firstRequiredStringKey(spec.inputSchema);
    if (key === undefined) {
      throw new Error(oneObjectMessage(spec));
    }
    const extra = extraRecord(args[1], spec, args.length);
    if (key in extra) {
      return checked(spec, withSnakeCaseAliases(extra));
    }
    return checked(spec, withSnakeCaseAliases({ ...extra, [key]: first }));
  }
  if (isRecord(first) && args.length === 2 && isRecord(args[1])) {
    return checked(
      spec,
      withIdAlias(spec, withSnakeCaseAliases({ ...first, ...args[1] }))
    );
  }
  throw new Error(oneObjectMessage(spec));
}

/**
 * Copy a bare `id` onto the one required `*_id` key when that key is absent.
 *
 * Only when there is exactly one such key, so nothing has to be guessed: a spec
 * requiring both `workflow_id` and `job_id` gets no alias and the missing-key
 * report below instead. `get_workflow`, `run_workflow`, `debug_workflow` and
 * every other single-subject capability are what this covers, and `id` is what
 * a caller reaches for after `create_workflow` answered with a record whose own
 * field is `id`.
 */
function withIdAlias(
  spec: CapabilityArgSpec,
  args: Record<string, unknown>
): Record<string, unknown> {
  const id = args["id"];
  if (id === undefined || id === null) return args;
  const [key, ...rest] = requiredKeys(spec.inputSchema).filter((name) =>
    name.endsWith("_id")
  );
  if (key === undefined || rest.length > 0) return args;
  if (args[key] !== undefined && args[key] !== null) return args;
  return { ...args, [key]: id };
}

/**
 * The required keys a record does not carry. `null` counts as missing: it is
 * what a guest reaching for an absent field passes, and `String(null)` reaching
 * a lookup is the same wrong answer `undefined` gives.
 */
function missingRequiredArgs(
  spec: CapabilityArgSpec,
  args: Record<string, unknown>
): string[] {
  return requiredKeys(spec.inputSchema).filter(
    (key) => args[key] === undefined || args[key] === null
  );
}

/**
 * Name the call, the keys it is missing, and — when it passed something — what
 * it passed instead, which is usually the whole diagnosis.
 *
 * A key that is present but null/undefined has to be called out, or the report
 * contradicts itself: `edit_storyboard({storyboard_id, ops})` with an unset
 * variable read "missing required argument storyboard_id. Got: storyboard_id,
 * ops", which sends the caller hunting for a spelling that was already right
 * instead of at the value that never got computed.
 */
function missingArgsMessage(
  spec: CapabilityArgSpec,
  missing: readonly string[],
  args: Record<string, unknown>
): string {
  const plural = missing.length === 1 ? "argument" : "arguments";
  const got = Object.keys(args);
  const gotPart =
    got.length > 0 ? ` Got: ${got.join(", ")}.` : " Got no arguments.";
  const empty = missing.filter((key) => key in args);
  const emptyPart =
    empty.length === 0
      ? ""
      : ` ${empty.join(", ")} ${empty.length === 1 ? "was" : "were"} ` +
        `passed as null/undefined — the key is right, the value is missing.`;
  return (
    `${spec.name}: missing required ${plural} ${missing.join(", ")}.` +
    gotPart +
    emptyPart
  );
}

/**
 * Refuse a call that brought arguments but not the required ones. A call with
 * no arguments at all is left alone: `{}` reaching the implementation is the
 * documented shape for the several capabilities whose schema requires nothing,
 * and for the rest the implementation's own "x is required" already names the
 * field rather than an entity.
 */
function checked(
  spec: CapabilityArgSpec,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (Object.keys(args).length === 0) return args;
  const missing = missingRequiredArgs(spec, args);
  if (missing.length > 0) {
    throw new Error(missingArgsMessage(spec, missing, args));
  }
  return args;
}

function requiredKeys(schema: JsonSchema): string[] {
  const required = schema.required;
  if (!Array.isArray(required)) return [];
  return required.filter((key): key is string => isString(key));
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
  const properties = schema.properties;
  for (const key of requiredKeys(schema)) {
    const field = isRecord(properties) ? properties[key] : undefined;
    if (isRecord(field) && field.type === "string") {
      return key;
    }
  }
  return undefined;
}

function oneObjectMessage(spec: CapabilityArgSpec): string {
  const keys = requiredKeys(spec.inputSchema);
  const shape = keys.length > 0 ? ` ({ ${keys.join(", ")} })` : "";
  return `${spec.name} takes one arguments object${shape}`;
}
