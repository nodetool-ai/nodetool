/**
 * The `serpapi` capability module — every SerpAPI engine as one gated surface,
 * with the engine list and each engine's parameters discovered rather than
 * hand-written.
 *
 * The point of this module is what it is *not*: it is not a Google node, a
 * Scholar node, and a Walmart node. SerpAPI publishes one endpoint whose
 * `engine` parameter selects which of ~120 contracts applies, and wrapping them
 * one at a time produces a wrapper backlog that never catches up — the same
 * trade the Apify actor wrappers lost. So NodeTool exposes the primitive — list
 * the engines, read one engine's contract, run it — and lets an agent compose
 * the rest. `list_serpapi_engines` and `get_serpapi_engine_schema` read
 * SerpAPI's own engine table, so an engine SerpAPI ships tomorrow is callable
 * tomorrow, with no diff here.
 *
 * The `web_search` capability stays what it is: one query, normalized results,
 * whichever SERP provider this install configured. This module is the layer
 * under it for the questions a plain web search cannot ask.
 *
 * What the surface costs, and how it is bounded:
 *
 * - **The key stays here.** Guest code calls `serpapi_search`; it never sees
 *   `SERPAPI_API_KEY`. Every HTTP call happens on the host, and the client
 *   redacts the key out of errors before they are thrown.
 * - **`api_key` and `output` are host-owned.** A caller that sets either is
 *   refused rather than obeyed, so the credential slot cannot be overwritten
 *   and the response cannot be switched to HTML this layer cannot parse.
 * - **Parameters are checked before the call.** SerpAPI ignores an unknown
 *   parameter, so a typo is a billed search that answers a different question.
 *   Checking against the catalogued contract turns that into a message.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";

import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  getSerpApiAccountSpec,
  getSerpApiEngineSchemaSpec,
  getSerpApiLocationsSpec,
  listSerpApiEnginesSpec,
  serpApiSearchSpec
} from "./serpapi.specs.js";
import { SerpApiClient } from "../serpapi/client.js";
import { SerpApiError, asSerpApiError } from "../serpapi/errors.js";
import {
  loadSerpApiCatalog,
  type SerpApiCatalog,
  type SerpApiEngine
} from "../serpapi/catalog.js";
import {
  DEFAULT_MAX_ITEMS,
  checkParams,
  resultKeys,
  summarizeSearch
} from "../serpapi/normalize.js";
import { isRecord, isString } from "../utils/type-guards.js";

/** The secret this module reads, and the name the SERP provider layer uses. */
const SECRET_NAME = "SERPAPI_API_KEY";

/**
 * Resolve the key the way every other external module does: the run's secret
 * store first, the environment second, and a message a user can act on when
 * neither has it.
 */
export async function resolveSerpApiKey(
  context: Pick<ProcessingContext, "getSecret">
): Promise<string> {
  const fromContext = await context.getSecret(SECRET_NAME).catch(() => null);
  const value = fromContext ?? process.env[SECRET_NAME];
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new SerpApiError(
    "auth",
    `No SerpAPI key is configured. Add ${SECRET_NAME} in Settings → Secrets ` +
      "(get one at https://serpapi.com/manage-api-key)."
  );
}

/** Build a client for this run, or fail with the reason a user can act on. */
async function clientFor(context: ProcessingContext): Promise<SerpApiClient> {
  return new SerpApiClient(await resolveSerpApiKey(context));
}

/** The run-scoped cancellation signal, which every SerpAPI call threads through. */
function signalOf(run: CapabilityRun): AbortSignal | undefined {
  return run.context.signal;
}

/**
 * Every capability answers `{ok: false, error, kind}` rather than throwing.
 *
 * A model that gets an exception sees a stack it cannot act on; a model that
 * gets a classified refusal — no key, unknown engine, missing parameter — can
 * fix the call itself, which is the difference between one wasted turn and a
 * dead branch.
 */
async function guarded(
  body: () => Promise<unknown>
): Promise<unknown> {
  try {
    return await body();
  } catch (error) {
    return asSerpApiError(error).toResult();
  }
}

async function catalogFor(run: CapabilityRun): Promise<SerpApiCatalog> {
  const signal = signalOf(run);
  return loadSerpApiCatalog(signal === undefined ? {} : { signal });
}

/** One engine's contract, or a refusal naming the near-misses. */
function requireEngine(
  catalog: SerpApiCatalog,
  engine: string
): SerpApiEngine {
  const found = catalog.engines.get(engine);
  if (found !== undefined) return found;
  const near = [...catalog.engines.keys()]
    .filter((id) => id.includes(engine) || engine.includes(id))
    .slice(0, 10);
  throw new SerpApiError(
    "unknown_engine",
    `SerpAPI has no "${engine}" engine.` +
      (near.length === 0
        ? " Call list_serpapi_engines to see what it does have."
        : ` Closest: ${near.join(", ")}.`),
    { engine }
  );
}

function requireString(
  params: Record<string, unknown>,
  key: string
): string {
  const value = params[key];
  if (!isString(value) || value.trim().length === 0) {
    throw new SerpApiError("invalid_input", `"${key}" is required.`);
  }
  return value.trim();
}

function readInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

// ---------------------------------------------------------------------------
// list_serpapi_engines
// ---------------------------------------------------------------------------

const listSerpApiEngines: CapabilityExport = {
  spec: listSerpApiEnginesSpec,
  impl: (run, params) =>
    guarded(async () => {
      const catalog = await catalogFor(run);
      const query = isString(params.query) ? params.query.toLowerCase() : "";
      const limit = Math.min(Math.max(1, readInteger(params.limit, 50)), 200);

      const matched = [...catalog.engines.values()].filter(
        (engine) =>
          query.length === 0 ||
          engine.engine.toLowerCase().includes(query) ||
          engine.label.toLowerCase().includes(query)
      );

      return {
        ok: true,
        total: matched.length,
        returned: Math.min(matched.length, limit),
        engines: matched.slice(0, limit).map((engine) => ({
          engine: engine.engine,
          name: engine.label,
          required: engine.parameters
            .filter((parameter) => parameter.required)
            .map((parameter) => parameter.name),
          parameter_count: engine.parameters.length,
          playground_url: engine.playgroundUrl
        })),
        note:
          "Read one engine's parameters with get_serpapi_engine_schema before " +
          "calling serpapi_search."
      };
    })
};

// ---------------------------------------------------------------------------
// get_serpapi_engine_schema
// ---------------------------------------------------------------------------

const getSerpApiEngineSchema: CapabilityExport = {
  spec: getSerpApiEngineSchemaSpec,
  impl: (run, params) =>
    guarded(async () => {
      const catalog = await catalogFor(run);
      const engine = requireEngine(catalog, requireString(params, "engine"));
      const includeHidden = params.include_hidden === true;

      const parameters = engine.parameters
        .filter((parameter) => includeHidden || !parameter.hidden)
        .map((parameter) => {
          const described: Record<string, unknown> = {
            name: parameter.name,
            label: parameter.label,
            description: parameter.description,
            required: parameter.required,
            group: parameter.group
          };
          if (parameter.type !== undefined) described.type = parameter.type;
          if (parameter.options !== undefined) {
            described.options = parameter.options.map((option) => option.value);
          }
          return described;
        });

      return {
        ok: true,
        engine: engine.engine,
        name: engine.label,
        playground_url: engine.playgroundUrl,
        required: engine.parameters
          .filter((parameter) => parameter.required)
          .map((parameter) => parameter.name),
        parameters,
        note:
          "Pass these under `params` to serpapi_search. `location` values " +
          "come from get_serpapi_locations."
      };
    })
};

// ---------------------------------------------------------------------------
// serpapi_search
// ---------------------------------------------------------------------------

const serpApiSearch: CapabilityExport = {
  spec: serpApiSearchSpec,
  impl: (run, params) =>
    guarded(async () => {
      const engineId = requireString(params, "engine");
      const raw = isRecord(params.params) ? params.params : {};
      const catalog = await catalogFor(run);
      const engine = requireEngine(catalog, engineId);

      const checked = checkParams(engine, raw);
      if (checked.errors.length > 0) {
        return {
          ok: false,
          error: `The parameters do not match the ${engine.engine} engine.`,
          error_kind: "invalid_input",
          retryable: false,
          engine: engine.engine,
          issues: checked.errors
        };
      }

      const client = await clientFor(run.context);
      const body = await client.search(
        engine.engine,
        checked.params,
        signalOf(run)
      );

      const fields = Array.isArray(params.fields)
        ? params.fields.filter(isString)
        : undefined;
      // `summarizeSearch` clamps `maxItems` itself, so this only supplies the
      // default; the ceiling lives next to the trimming it bounds.
      const trim: { fields?: readonly string[]; maxItems: number } = {
        maxItems: readInteger(params.max_items, DEFAULT_MAX_ITEMS)
      };
      if (fields !== undefined && fields.length > 0) trim.fields = fields;
      const summary = summarizeSearch(body, trim);

      return {
        ok: true,
        engine: engine.engine,
        available_keys: resultKeys(body),
        ...summary
      };
    })
};

// ---------------------------------------------------------------------------
// get_serpapi_account
// ---------------------------------------------------------------------------

const getSerpApiAccount: CapabilityExport = {
  spec: getSerpApiAccountSpec,
  impl: (run) =>
    guarded(async () => {
      const client = await clientFor(run.context);
      const account = await client.account(signalOf(run));
      return { ok: true, ...account };
    })
};

// ---------------------------------------------------------------------------
// get_serpapi_locations
// ---------------------------------------------------------------------------

const getSerpApiLocations: CapabilityExport = {
  spec: getSerpApiLocationsSpec,
  impl: (run, params) =>
    guarded(async () => {
      const client = await clientFor(run.context);
      const limit = Math.min(Math.max(1, readInteger(params.limit, 10)), 50);
      const locations = await client.locations(
        requireString(params, "query"),
        limit,
        signalOf(run)
      );
      return {
        ok: true,
        locations: locations.map((location) => ({
          name: location.name,
          // The value the `location` parameter wants — not `name`, which is
          // ambiguous across the several Austins SerpAPI knows about.
          location: location.canonicalName,
          country_code: location.countryCode,
          target_type: location.targetType,
          reach: location.reach
        }))
      };
    })
};

export const SERPAPI_CAPABILITIES: readonly CapabilityExport[] = [
  listSerpApiEngines,
  getSerpApiEngineSchema,
  serpApiSearch,
  getSerpApiAccount,
  getSerpApiLocations
];

export const module: CapabilityModule = {
  module: "serpapi",
  exports: SERPAPI_CAPABILITIES
};
