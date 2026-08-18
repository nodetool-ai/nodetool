/**
 * Turning one SerpAPI response into something a model can read, and one
 * parameter bag into something SerpAPI will accept.
 *
 * Both directions exist for the same reason. A SerpAPI response is a whole
 * results page — `google` alone answers with organic results, ads, knowledge
 * graph, related questions, pagination, and inline images — and handing all of
 * it back spends a model's context on the twelve keys it did not ask for. A
 * parameter bag is the mirror image: a wrong key is not an error on SerpAPI's
 * side, it is a silently ignored field and a result for a different query, so
 * it has to be caught here against the engine's catalogued contract.
 */

import type { SerpApiEngine } from "./catalog.js";
import { HOST_OWNED_PARAMS, type SerpApiParamValue } from "./client.js";
import { isRecord } from "../utils/type-guards.js";

/** Keys that describe the request rather than its results. */
const METADATA_KEYS: ReadonlySet<string> = new Set([
  "search_metadata",
  "search_parameters",
  "search_information",
  "serpapi_pagination",
  "pagination"
]);

/** How many items of each result array are returned when nothing says. */
export const DEFAULT_MAX_ITEMS = 10;
/** The ceiling on `max_items`, whatever a caller asks for. */
export const MAX_ITEMS_LIMIT = 100;

export interface SummarizeOptions {
  /** Only these top-level result keys. Everything else is named, not sent. */
  readonly fields?: readonly string[];
  readonly maxItems?: number;
}

export interface SearchSummary {
  /** Engine, status, timing, and the parameters SerpAPI says it used. */
  readonly metadata: Record<string, unknown>;
  /** The result keys, trimmed to `maxItems` entries each. */
  readonly results: Record<string, unknown>;
  /** Result keys present in the response but not returned here. */
  readonly omitted: readonly string[];
  /** Result keys whose arrays were cut short, and by how much. */
  readonly truncated: Readonly<Record<string, number>>;
}

/**
 * Trim one response to the keys asked for and the items allowed.
 *
 * Nothing is dropped silently: a key that was left out is named in `omitted`
 * and an array that was cut is counted in `truncated`, so a model can ask for
 * the rest by name instead of guessing that there was more.
 */
export function summarizeSearch(
  body: Readonly<Record<string, unknown>>,
  options: SummarizeOptions = {}
): SearchSummary {
  const maxItems = clampItems(options.maxItems);
  const wanted =
    options.fields === undefined || options.fields.length === 0
      ? undefined
      : new Set(options.fields);

  const metadata: Record<string, unknown> = {};
  const results: Record<string, unknown> = {};
  const omitted: string[] = [];
  const truncated: Record<string, number> = {};

  for (const [key, value] of Object.entries(body)) {
    if (METADATA_KEYS.has(key)) {
      metadata[key] = value;
      continue;
    }
    if (wanted !== undefined && !wanted.has(key)) {
      omitted.push(key);
      continue;
    }
    if (Array.isArray(value) && value.length > maxItems) {
      results[key] = value.slice(0, maxItems);
      truncated[key] = value.length - maxItems;
      continue;
    }
    results[key] = value;
  }

  return { metadata, results, omitted, truncated };
}

function clampItems(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_MAX_ITEMS;
  }
  return Math.min(Math.max(1, Math.floor(requested)), MAX_ITEMS_LIMIT);
}

/** The result keys a response carries, for a caller choosing `fields`. */
export function resultKeys(
  body: Readonly<Record<string, unknown>>
): readonly string[] {
  return Object.keys(body).filter((key) => !METADATA_KEYS.has(key));
}

export interface ParamCheck {
  /** The parameters to send, with every value coerced to a scalar. */
  readonly params: Record<string, SerpApiParamValue>;
  /** Why the call cannot be made as asked. Empty when it can. */
  readonly errors: readonly string[];
}

/**
 * Check a parameter bag against one engine's catalogued contract.
 *
 * Unknown keys are errors rather than warnings on purpose: SerpAPI ignores
 * them, so the run succeeds, bills a search, and answers a question nobody
 * asked. Naming the near-misses is what turns that into a fixable message.
 */
export function checkParams(
  engine: SerpApiEngine,
  raw: Readonly<Record<string, unknown>>
): ParamCheck {
  const known = new Map(engine.parameters.map((p) => [p.name, p] as const));
  const params: Record<string, SerpApiParamValue> = {};
  const errors: string[] = [];

  for (const [name, value] of Object.entries(raw)) {
    if (HOST_OWNED_PARAMS.has(name)) {
      errors.push(
        `"${name}" is set by NodeTool, not by the caller. Remove it.`
      );
      continue;
    }
    if (name === "engine") continue;
    if (value === undefined || value === null) continue;

    const parameter = known.get(name);
    if (parameter === undefined) {
      const near = nearest(name, [...known.keys()]);
      errors.push(
        `"${name}" is not a parameter of the ${engine.engine} engine.` +
          (near === undefined ? "" : ` Did you mean "${near}"?`) +
          " Read get_serpapi_engine_schema for the full list."
      );
      continue;
    }
    const scalar = toScalar(value);
    if (scalar === undefined) {
      errors.push(
        `"${name}" must be a string, number, or boolean — got ${typeof value}.`
      );
      continue;
    }
    const allowed = parameter.options;
    if (allowed !== undefined && !allowed.some((o) => o.value === String(scalar))) {
      errors.push(
        `"${name}" must be one of: ${allowed.map((o) => o.value).join(", ")}.`
      );
      continue;
    }
    params[name] = scalar;
  }

  for (const parameter of engine.parameters) {
    if (parameter.required && !Object.hasOwn(params, parameter.name)) {
      errors.push(
        `"${parameter.name}" (${parameter.label}) is required by the ` +
          `${engine.engine} engine.`
      );
    }
  }

  return { params, errors };
}

function toScalar(value: unknown): SerpApiParamValue | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

/**
 * The closest known name, when one is close enough to be worth suggesting.
 *
 * A prefix or substring relationship covers the mistakes that actually happen
 * — `query` for `q`, `hl_code` for `hl`, `num_results` for `num` — without the
 * cost of an edit-distance pass over 40 names on every rejected parameter.
 */
function nearest(name: string, candidates: readonly string[]): string | undefined {
  const lower = name.toLowerCase();
  return candidates.find(
    (candidate) =>
      candidate.length > 1 &&
      (lower.includes(candidate.toLowerCase()) ||
        candidate.toLowerCase().includes(lower))
  );
}
