/**
 * The SerpAPI HTTP client — the only code in this layer that holds the API key.
 *
 * Everything above it (the catalog, the capability module, the sandbox) works
 * in terms of engine ids and plain parameter objects. The key is
 * constructor-private, is attached to a request and never to a result, and is
 * scrubbed out of every error before it is thrown, so there is no path by which
 * it reaches guest code, a tool result, a model's context, or a log line.
 *
 * Endpoints, verified against serpapi.com:
 *
 *   GET /search.json?engine=<engine>&…   run any of the catalogued engines
 *   GET /account.json                    plan, searches used, searches left
 *   GET /locations.json?q=&limit=        canonical values for `location`
 *
 * There is one search method for all 120 engines rather than one per engine.
 * That is the whole point of this layer: SerpAPI's own surface is a single
 * endpoint whose `engine` parameter selects the contract, so a wrapper per
 * engine would be a backlog that never catches up with what SerpAPI ships.
 */

import { setTimeout as delay } from "node:timers/promises";

import { SerpApiError, asSerpApiError } from "./errors.js";
import { isNonBlankString, isRecord, isString } from "../utils/type-guards.js";

/** The public API root. Not configurable: it is also the SSRF answer. */
export const SERPAPI_BASE = "https://serpapi.com";

/** Parameter values SerpAPI accepts on the query string. */
export type SerpApiParamValue = string | number | boolean;

export interface SerpApiClientOptions {
  /** Injected for tests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Per-request ceiling, in milliseconds. Not the run's deadline. */
  readonly requestTimeoutMs?: number;
  /** Attempts for a retryable failure, including the first. */
  readonly maxAttempts?: number;
  /** Base backoff, doubled per attempt. */
  readonly retryBaseMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;

/**
 * Parameters the host owns, which a caller may not set.
 *
 * `api_key` is the credential and `output` decides whether the response is JSON
 * at all — a guest that could set either would either exfiltrate the key or
 * hand this layer HTML it cannot parse.
 */
export const HOST_OWNED_PARAMS: ReadonlySet<string> = new Set([
  "api_key",
  "output"
]);

/** Map an HTTP status onto the distinction a caller acts on. */
function kindForStatus(status: number): SerpApiError["kind"] {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "network";
  return "invalid_input";
}

/**
 * Strip anything key-shaped out of a message before it becomes an error.
 *
 * SerpAPI echoes the request in some error bodies, and the key rides on the
 * query string, so redacting at the one place errors are built beats trusting
 * every call site not to log.
 */
function redact(text: string, key: string): string {
  const safe = key.length >= 8 ? text.split(key).join("«redacted»") : text;
  return safe.replace(/\bapi_key=[A-Za-z0-9]+/g, "api_key=«redacted»");
}

/** Whether the caller's signal has fired *now*. Mutable, so re-read it. */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted;
}

/** Wait, waking early if the caller's signal fires. Never rejects. */
async function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  await delay(ms, undefined, { signal }).catch(() => undefined);
}

/** One account record, as much of it as anything above this layer reads. */
export interface SerpApiAccount {
  readonly plan?: string;
  readonly searchesPerMonth?: number;
  readonly thisMonthUsage?: number;
  readonly totalSearchesLeft?: number;
}

/** One location suggestion, as `location` wants it spelled. */
export interface SerpApiLocation {
  readonly name: string;
  readonly canonicalName: string;
  readonly countryCode?: string;
  readonly targetType?: string;
  readonly reach?: number;
}

export class SerpApiClient {
  readonly #key: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;
  readonly #maxAttempts: number;
  readonly #retryBaseMs: number;

  constructor(key: string, options: SerpApiClientOptions = {}) {
    if (!isNonBlankString(key)) {
      throw new SerpApiError(
        "auth",
        "No SerpAPI key is configured. Add SERPAPI_API_KEY in Settings → Secrets."
      );
    }
    this.#key = key;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  }

  /**
   * Run one search on any engine.
   *
   * `params` is passed through as the engine's own contract spells it — this
   * client knows nothing about what `google_scholar` wants and
   * `walmart_product` does not. Validation against the catalogued schema
   * happens a layer up, where the schema lives.
   */
  async search(
    engine: string,
    params: Readonly<Record<string, SerpApiParamValue>>,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const query = new URLSearchParams({ engine, output: "json" });
    for (const [name, value] of Object.entries(params)) {
      if (HOST_OWNED_PARAMS.has(name)) continue;
      if (value === undefined || value === null) continue;
      query.set(name, String(value));
    }
    const body = await this.#getJson("/search.json", query, signal, engine);
    // SerpAPI answers 200 with an `error` string for engine-level refusals —
    // an unsupported parameter combination, a query it will not run — so the
    // status alone does not separate success from failure here.
    if (isString(body.error)) {
      throw new SerpApiError("invalid_input", redact(body.error, this.#key), {
        engine
      });
    }
    return body;
  }

  /** Plan and remaining searches, so a caller can see its own budget. */
  async account(signal?: AbortSignal): Promise<SerpApiAccount> {
    const body = await this.#getJson("/account.json", new URLSearchParams(), signal);
    const account: {
      -readonly [K in keyof SerpApiAccount]: SerpApiAccount[K];
    } = {};
    if (isString(body.plan_name)) account.plan = body.plan_name;
    if (typeof body.searches_per_month === "number") {
      account.searchesPerMonth = body.searches_per_month;
    }
    if (typeof body.this_month_usage === "number") {
      account.thisMonthUsage = body.this_month_usage;
    }
    if (typeof body.total_searches_left === "number") {
      account.totalSearchesLeft = body.total_searches_left;
    }
    return account;
  }

  /**
   * Canonical values for the `location` parameter.
   *
   * A guessed location string is not an error on SerpAPI's side — it is an
   * unsupported-location refusal or, worse, results for somewhere else — so
   * every engine with a `location` parameter needs this lookup first.
   */
  async locations(
    query: string,
    limit: number,
    signal?: AbortSignal
  ): Promise<readonly SerpApiLocation[]> {
    const search = new URLSearchParams({ q: query, limit: String(limit) });
    const body = await this.#getArray("/locations.json", search, signal);
    return body.filter(isRecord).map((row) => {
      const location: {
        -readonly [K in keyof SerpApiLocation]: SerpApiLocation[K];
      } = {
        name: isString(row.name) ? row.name : "",
        canonicalName: isString(row.canonical_name) ? row.canonical_name : ""
      };
      if (isString(row.country_code)) location.countryCode = row.country_code;
      if (isString(row.target_type)) location.targetType = row.target_type;
      if (typeof row.reach === "number") location.reach = row.reach;
      return location;
    });
  }

  async #getJson(
    path: string,
    query: URLSearchParams,
    signal: AbortSignal | undefined,
    engine?: string
  ): Promise<Record<string, unknown>> {
    const body = await this.#request(path, query, signal, engine);
    if (!isRecord(body)) {
      throw new SerpApiError(
        "network",
        `SerpAPI returned a ${typeof body} where an object was expected.`,
        engine === undefined ? {} : { engine }
      );
    }
    return body;
  }

  async #getArray(
    path: string,
    query: URLSearchParams,
    signal: AbortSignal | undefined
  ): Promise<readonly unknown[]> {
    const body = await this.#request(path, query, signal);
    if (!Array.isArray(body)) {
      throw new SerpApiError(
        "network",
        `SerpAPI returned a ${typeof body} where an array was expected.`
      );
    }
    return body;
  }

  async #request(
    path: string,
    query: URLSearchParams,
    signal: AbortSignal | undefined,
    engine?: string
  ): Promise<unknown> {
    // Set last so a caller-supplied `api_key` can never win the slot.
    query.set("api_key", this.#key);
    const url = `${SERPAPI_BASE}${path}?${query.toString()}`;

    let lastError: SerpApiError | undefined;
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      if (isAborted(signal)) {
        throw new SerpApiError("cancelled", "The run was cancelled.");
      }
      try {
        return await this.#attempt(url, signal, engine);
      } catch (error) {
        if (isAborted(signal)) {
          throw new SerpApiError("cancelled", "The run was cancelled.");
        }
        lastError = asSerpApiError(error);
        if (!lastError.retryable || attempt === this.#maxAttempts) break;
        await sleep(this.#retryBaseMs * 2 ** (attempt - 1), signal);
      }
    }
    throw lastError ?? new SerpApiError("network", "SerpAPI request failed.");
  }

  async #attempt(
    url: string,
    signal: AbortSignal | undefined,
    engine?: string
  ): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.#requestTimeoutMs);
    const merged =
      signal === undefined ? timeout : AbortSignal.any([signal, timeout]);

    const response = await this.#fetch(url, {
      signal: merged,
      headers: { accept: "application/json" }
    });
    const text = await response.text();

    if (!response.ok) {
      const detail = readErrorText(text);
      throw new SerpApiError(
        kindForStatus(response.status),
        `SerpAPI request failed (${response.status}): ${redact(detail, this.#key)}`,
        engine === undefined
          ? { status: response.status }
          : { status: response.status, engine }
      );
    }

    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new SerpApiError(
        "network",
        "SerpAPI returned a body that is not JSON.",
        { cause: error }
      );
    }
  }
}

/** Read SerpAPI's `{error}` envelope out of a failure body, or keep the text. */
function readErrorText(text: string): string {
  try {
    const body: unknown = JSON.parse(text);
    if (isRecord(body) && isString(body.error)) return body.error;
  } catch {
    // Not JSON — SerpAPI serves an HTML error page for some failures, and the
    // raw text is still the most useful thing to report.
  }
  return text.slice(0, 500);
}
