/**
 * The SerpAPI engine catalog — where "discover the endpoints" actually happens.
 *
 * SerpAPI is one endpoint (`/search.json`) whose `engine` parameter selects
 * which of ~120 contracts applies, and each contract has its own parameters.
 * Hand-wrapping them produces the same backlog the Apify actor wrappers did, so
 * nothing here is hand-written: the catalog is read from SerpAPI's own
 * playground, which ships every engine and every parameter — name, label,
 * description, required flag, type, and allowed options — as one JSON blob in a
 * `data-react-props` attribute.
 *
 * That is a page, not a documented API, so the parse is defensive and the
 * failure is named: a page whose shape changed comes back as
 * `catalog_unavailable`, which the capability module reports as "discovery is
 * down, here is why" rather than as an empty engine list that reads like
 * SerpAPI ships nothing.
 *
 * The catalog is cached process-wide with a TTL. One fetch is ~3 MB, and the
 * contract of an engine changes on SerpAPI's release schedule, not per call.
 */

import { SerpApiError, asSerpApiError } from "./errors.js";
import { isRecord, isString } from "../utils/type-guards.js";
import { HOST_OWNED_PARAMS, SERPAPI_BASE } from "./client.js";

/**
 * Parameters the playground lists that are not part of an engine's contract as
 * a caller sees it.
 *
 * `api_key` and `output` belong to the host, and `engine` is the selector that
 * chose this contract in the first place. All three are marked *required* in
 * SerpAPI's own table, so leaving them in would make every checked call demand
 * the one field the caller must never set.
 */
const CALLER_CANNOT_SET: ReadonlySet<string> = new Set([
  ...HOST_OWNED_PARAMS,
  "engine"
]);

/** One parameter of one engine, as the playground describes it. */
export interface SerpApiParameter {
  readonly name: string;
  /** SerpAPI's own display name, e.g. "Search Query". */
  readonly label: string;
  /** The description with its documentation markup flattened to text. */
  readonly description: string;
  readonly required: boolean;
  /** SerpAPI's widget type — "select", "number", "location", … — when given. */
  readonly type?: string;
  /** Allowed values, for the parameters that enumerate them. */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  /** The group the playground files it under, e.g. "localization". */
  readonly group: string;
  /** Present but not offered in the playground UI. */
  readonly hidden: boolean;
}

/** One engine's whole contract. */
export interface SerpApiEngine {
  readonly engine: string;
  /** Derived from the id ("google_scholar" → "Google Scholar"). */
  readonly label: string;
  /** The page this contract was read from, and where a human can read it. */
  readonly playgroundUrl: string;
  readonly parameters: readonly SerpApiParameter[];
}

/** Every engine, plus the shared option lists the localization fields take. */
export interface SerpApiCatalog {
  readonly engines: ReadonlyMap<string, SerpApiEngine>;
  /** `hl` values: language code → language name. */
  readonly languages: readonly { readonly value: string; readonly label: string }[];
  /** `gl` values: country code → country name. */
  readonly countries: readonly { readonly value: string; readonly label: string }[];
  /** `google_domain` values. */
  readonly googleDomains: readonly { readonly value: string; readonly label: string }[];
  readonly fetchedAt: number;
}

/** How long a fetched catalog is reused. */
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

const PLAYGROUND_URL = `${SERPAPI_BASE}/playground`;
const FETCH_TIMEOUT_MS = 60_000;

interface CacheEntry {
  readonly catalog: SerpApiCatalog;
  readonly expiresAt: number;
}

let cached: CacheEntry | undefined;
/** In-flight fetch, so a burst of calls costs one 3 MB download, not five. */
let inFlight: Promise<SerpApiCatalog> | undefined;

export interface CatalogOptions {
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  /** Ignore the cached copy and re-read the page. */
  readonly force?: boolean;
  /** Injected for tests; defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Drop the cached catalog. For tests, and for a forced refresh. */
export function clearSerpApiCatalogCache(): void {
  cached = undefined;
  inFlight = undefined;
}

/** The catalog, from cache when it is fresh and from serpapi.com otherwise. */
export async function loadSerpApiCatalog(
  options: CatalogOptions = {}
): Promise<SerpApiCatalog> {
  const now = options.now ?? Date.now;
  if (options.force !== true && cached !== undefined && cached.expiresAt > now()) {
    return cached.catalog;
  }
  if (options.force !== true && inFlight !== undefined) return inFlight;

  const pending = fetchCatalog(options)
    .then((catalog) => {
      cached = { catalog, expiresAt: now() + CATALOG_TTL_MS };
      return catalog;
    })
    .finally(() => {
      inFlight = undefined;
    });
  inFlight = pending;
  return pending;
}

async function fetchCatalog(options: CatalogOptions): Promise<SerpApiCatalog> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const signal =
    options.signal === undefined
      ? timeout
      : AbortSignal.any([options.signal, timeout]);

  let html: string;
  try {
    const response = await fetchImpl(PLAYGROUND_URL, { signal });
    if (!response.ok) {
      throw new SerpApiError(
        "catalog_unavailable",
        `Could not read the SerpAPI engine catalog: ${PLAYGROUND_URL} answered ${response.status}.`,
        { status: response.status }
      );
    }
    html = await response.text();
  } catch (error) {
    if (error instanceof SerpApiError) throw error;
    const failure = asSerpApiError(error);
    if (failure.kind === "cancelled") throw failure;
    throw new SerpApiError(
      "catalog_unavailable",
      `Could not read the SerpAPI engine catalog: ${failure.message}`,
      { cause: error }
    );
  }

  return parseSerpApiCatalog(html, (options.now ?? Date.now)());
}

/**
 * Parse the playground page into a catalog.
 *
 * Exported so the parse can be tested against a checked-in page fixture
 * without a network call — the check that matters is that a page shape change
 * is caught, and only a fixture can fail on that.
 */
export function parseSerpApiCatalog(
  html: string,
  fetchedAt: number
): SerpApiCatalog {
  const props = readReactProps(html);
  const rawEngines = props.parameters;
  if (!isRecord(rawEngines) || Object.keys(rawEngines).length === 0) {
    throw new SerpApiError(
      "catalog_unavailable",
      "The SerpAPI playground page carried no engine parameter table. Its " +
        "markup has changed; the catalog parser needs updating."
    );
  }

  const engines = new Map<string, SerpApiEngine>();
  for (const [engine, groups] of Object.entries(rawEngines)) {
    if (!isRecord(groups)) continue;
    engines.set(engine, {
      engine,
      label: engineLabel(engine),
      playgroundUrl: `${PLAYGROUND_URL}?engine=${encodeURIComponent(engine)}`,
      parameters: readParameters(groups)
    });
  }

  return {
    engines,
    languages: readOptionPairs(props.hl_options),
    countries: readOptionPairs(props.gl_options),
    googleDomains: readOptionPairs(props.google_domain_options),
    fetchedAt
  };
}

/**
 * The page mounts its React root with the whole catalog in one HTML-escaped
 * attribute. The value cannot itself contain a raw `"` — it is escaped to
 * `&quot;` — so the attribute ends at the first quote, and a lazy match is
 * exact rather than approximate.
 */
function readReactProps(html: string): Record<string, unknown> {
  const match = /data-react-props="([^"]*)"/.exec(html);
  if (match === null) {
    throw new SerpApiError(
      "catalog_unavailable",
      "The SerpAPI playground page no longer carries a data-react-props " +
        "attribute. Its markup has changed; the catalog parser needs updating."
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(unescapeHtml(match[1])) as unknown;
  } catch (error) {
    throw new SerpApiError(
      "catalog_unavailable",
      "The SerpAPI playground page carried a data-react-props attribute that " +
        "is not JSON. Its markup has changed; the catalog parser needs updating.",
      { cause: error }
    );
  }
  if (!isRecord(parsed)) {
    throw new SerpApiError(
      "catalog_unavailable",
      "The SerpAPI playground props are not an object."
    );
  }
  return parsed;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " "
};

/** Undo the attribute escaping. Numeric forms appear inside descriptions. */
function unescapeHtml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return Object.hasOwn(ENTITIES, entity.toLowerCase())
      ? ENTITIES[entity.toLowerCase()]
      : whole;
  });
}

/**
 * Flatten one parameter's documentation HTML to the text a model reads.
 *
 * Entities are decoded first and tags are stripped until the string stops
 * changing, rather than in one pass. A single pass is incomplete sanitization:
 * `<<b>script>` survives it as `<script`, and decoding afterwards would turn
 * `&lt;script&gt;` back into markup this function claims to have removed.
 */
export function htmlToText(html: string): string {
  let text = unescapeHtml(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li)>/gi, " ");
  let previous = "";
  while (text !== previous) {
    previous = text;
    text = text.replace(/<[^>]*>/g, "");
  }
  return text.replace(/\s+/g, " ").trim();
}

function readParameters(
  groups: Record<string, unknown>
): readonly SerpApiParameter[] {
  const parameters: SerpApiParameter[] = [];
  for (const [group, groupValue] of Object.entries(groups)) {
    if (!isRecord(groupValue)) continue;
    const groupHidden = groupValue.hidden === true;
    const table = groupValue.parameters;
    if (!isRecord(table)) continue;
    for (const [name, value] of Object.entries(table)) {
      if (!isRecord(value) || CALLER_CANNOT_SET.has(name)) continue;
      const options = readOptionPairs(value.options);
      const parameter: {
        -readonly [K in keyof SerpApiParameter]: SerpApiParameter[K];
      } = {
        name,
        label: isString(value.name) ? value.name : name,
        description: isString(value.html) ? htmlToText(value.html) : "",
        required: value.required === true,
        group,
        hidden: groupHidden || value.hidden_from_playground === true
      };
      if (isString(value.type)) parameter.type = value.type;
      if (options.length > 0) parameter.options = options;
      parameters.push(parameter);
    }
  }
  return parameters;
}

/** Read SerpAPI's `[[value, label], …]` option lists. */
function readOptionPairs(
  value: unknown
): readonly { readonly value: string; readonly label: string }[] {
  if (!Array.isArray(value)) return [];
  const pairs: { value: string; label: string }[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length === 0) continue;
    const [raw, label] = entry;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    pairs.push({
      value: String(raw),
      label: isString(label) ? label : String(raw)
    });
  }
  return pairs;
}

/** "google_scholar_author" → "Google Scholar Author". */
function engineLabel(engine: string): string {
  return engine
    .split("_")
    .map((word) => (word.length === 0 ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}
