/**
 * The Apify REST client — the only code in NodeTool that holds the API token.
 *
 * Everything above this file (policy, normalization, the capability module,
 * the sandbox) works in terms of actor ids and plain data. The token is
 * constructor-private, is attached to a request and never to a result, and is
 * scrubbed out of every error before it is thrown, so there is no path by
 * which it reaches guest code, a tool result, a model's context, or a log line.
 *
 * Endpoints, verified against docs.apify.com (v2):
 *
 *   GET  /v2/store                                  actor store search
 *   GET  /v2/acts/:actorId                          actor record
 *   GET  /v2/acts/:actorId/builds/default           build → actorDefinition.input
 *   POST /v2/acts/:actorId/runs                     start a run
 *   GET  /v2/actor-runs/:runId                      poll a run
 *   POST /v2/actor-runs/:runId/abort                abort a run
 *   GET  /v2/datasets/:datasetId/items              dataset page
 *   GET  /v2/key-value-stores/:storeId/records/:key  one record
 *
 * There is deliberately no use of `run-sync-get-dataset-items`. It caps at 300
 * seconds, gives no run id while it blocks, and so cannot be aborted when the
 * surrounding NodeTool run is cancelled. Start-then-poll is one code path that
 * handles a two-second actor and a twenty-minute one, and always has an id to
 * abort.
 */

import { setTimeout as delay } from "node:timers/promises";

import {
  ApifyError,
  asApifyError,
  type ApifyErrorKind,
  type ApifyErrorOptions
} from "./errors.js";
import { isNonBlankString, isRecord, isString } from "../utils/type-guards.js";

/** The public API root. Not configurable: it is also the SSRF answer. */
export const APIFY_API_BASE = "https://api.apify.com";

/** Terminal and non-terminal run states, as the API spells them. */
export const APIFY_RUN_STATUSES = [
  "READY",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "TIMING-OUT",
  "TIMED-OUT",
  "ABORTING",
  "ABORTED"
] as const;

export type ApifyRunStatus = (typeof APIFY_RUN_STATUSES)[number];

/** States that will not change again without a new call. */
const TERMINAL: ReadonlySet<string> = new Set([
  "SUCCEEDED",
  "FAILED",
  "TIMED-OUT",
  "ABORTED"
]);

/** True once the run has settled and polling it again is pointless. */
export function isTerminalRunStatus(status: string): boolean {
  return TERMINAL.has(status);
}

/** One actor run, as much of it as anything above this layer reads. */
export interface ApifyRun {
  readonly id: string;
  readonly actId: string;
  readonly status: string;
  readonly statusMessage?: string;
  readonly defaultDatasetId?: string;
  readonly defaultKeyValueStoreId?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly usageTotalUsd?: number;
  readonly stats?: Record<string, unknown>;
}

/** One store listing entry, unnormalized. */
export type ApifyStoreItem = Record<string, unknown>;

/** One dataset page plus the count the page was taken from. */
export interface ApifyDatasetPage {
  readonly items: readonly unknown[];
  /** Total items in the dataset, from the `X-Apify-Pagination-Total` header. */
  readonly total?: number;
  readonly offset: number;
  readonly limit: number;
}

/** A key-value record's bytes and declared type. */
export interface ApifyRecord {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface ApifyClientOptions {
  /** Injected for tests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Per-request ceiling, in milliseconds. Not the run's deadline. */
  readonly requestTimeoutMs?: number;
  /** Attempts for a retryable failure, including the first. */
  readonly maxAttempts?: number;
  /** Base backoff, doubled per attempt. */
  readonly retryBaseMs?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 500;

/**
 * Apify's actor id in a URL is `owner~name`, not `owner/name`. Accepting the
 * slash form everywhere and converting here is not a convenience: the slash
 * form is what every actor page, every doc, and therefore every model writes,
 * and sending it unconverted produces a 404 that reads like a missing actor.
 */
export function toActorPathId(actorId: string): string {
  return actorId.trim().replace(/\//g, "~");
}

/** The canonical `owner/name` form, for display and allowlist comparison. */
export function toCanonicalActorId(actorId: string): string {
  return actorId.trim().replace(/~/g, "/");
}

/** Map an HTTP status onto the distinction a caller acts on. */
function kindForStatus(status: number, apifyType?: string): ApifyErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "actor_not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "network";
  if (apifyType === "insufficient-permissions") return "auth";
  return "invalid_input";
}

/**
 * Strip anything token-shaped out of a message before it becomes an error.
 *
 * Apify echoes request context in some error bodies, and a token pasted into an
 * actor input field would come back in a validation message. Redacting at the
 * one place errors are built beats trusting every call site not to log.
 */
function redact(text: string, token: string): string {
  const safe = token.length >= 8 ? text.split(token).join("«redacted»") : text;
  return safe.replace(/\bapify_api_[A-Za-z0-9]{10,}\b/g, "«redacted»");
}

/** Drop `readonly` so an options bag can be filled in field by field. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Wait, waking early if the caller's signal fires. Never rejects. */
async function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  await delay(ms, undefined, { signal }).catch(() => undefined);
}

/**
 * Whether the caller's signal has fired *now*.
 *
 * A function rather than an inline `signal?.aborted === true`: the flag is
 * mutable, and the compiler narrows it to `false` after the check at the top of
 * a retry attempt, which would make the identical check inside the `catch`
 * unreachable — exactly the check that separates a cancelled run from a timed
 * out request.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && signal.aborted;
}

/** Read Apify's `{error: {type, message}}` envelope, tolerating anything else. */
function readErrorBody(body: unknown): { type?: string; message?: string } {
  if (!isRecord(body) || !isRecord(body.error)) return {};
  const { type, message } = body.error;
  const parsed: { type?: string; message?: string } = {};
  if (isString(type)) parsed.type = type;
  if (isString(message)) parsed.message = message;
  return parsed;
}

export class ApifyClient {
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #requestTimeoutMs: number;
  readonly #maxAttempts: number;
  readonly #retryBaseMs: number;

  constructor(token: string, options: ApifyClientOptions = {}) {
    if (!isNonBlankString(token)) {
      throw new ApifyError(
        "auth",
        "No Apify API token is configured. Add APIFY_API_TOKEN in Settings → Secrets."
      );
    }
    this.#token = token;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  }

  /**
   * One request, with the retry policy the error kinds imply.
   *
   * Only `rate_limited` and `network` come back round: an invalid input or a
   * rejected token fails the same way every time, and a *run* is never retried
   * here at all, because a second start is a second charge.
   */
  async #request(
    path: string,
    init: RequestInit & { query?: Record<string, unknown> },
    signal: AbortSignal | undefined,
    context: { actorId?: string; runId?: string } = {}
  ): Promise<Response> {
    const url = new URL(path, APIFY_API_BASE);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    let lastError: ApifyError | undefined;
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt++) {
      if (isAborted(signal)) {
        throw new ApifyError("cancelled", "The Apify call was cancelled", context);
      }
      // Two reasons to give up on one attempt: the surrounding run was
      // cancelled, or this single request hung. They are combined rather than
      // chosen between, so a slow request inside a live run still times out.
      const timeout = AbortSignal.timeout(this.#requestTimeoutMs);
      const composite =
        signal === undefined ? timeout : AbortSignal.any([signal, timeout]);

      try {
        const response = await this.#fetch(url.toString(), {
          ...init,
          signal: composite,
          headers: {
            ...(init.headers ?? {}),
            Authorization: `Bearer ${this.#token}`,
            Accept: "application/json"
          }
        });
        if (response.ok) return response;

        const body = await response
          .clone()
          .json()
          .catch(() => undefined);
        const { type, message } = readErrorBody(body);
        const retryAfter = Number(response.headers?.get?.("retry-after") ?? "");
        const options: Mutable<ApifyErrorOptions> = {
          status: response.status,
          ...context
        };
        if (type !== undefined) options.apifyType = type;
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          options.retryAfterSeconds = retryAfter;
        }
        lastError = new ApifyError(
          kindForStatus(response.status, type),
          redact(
            message ?? `Apify request failed with HTTP ${response.status}`,
            this.#token
          ),
          options
        );
      } catch (e) {
        // A cancelled *outer* run must not be mistaken for a hung request: the
        // composite signal fires for both, so the caller's signal decides.
        if (isAborted(signal)) {
          throw new ApifyError(
            "cancelled",
            "The Apify call was cancelled",
            context
          );
        }
        lastError = asApifyError(e);
        if (lastError.kind === "cancelled") {
          lastError = new ApifyError(
            "network",
            `Apify request timed out after ${this.#requestTimeoutMs}ms`,
            context
          );
        }
      }

      if (!lastError.retryable || attempt === this.#maxAttempts) break;
      const backoff =
        lastError.retryAfterSeconds !== undefined
          ? lastError.retryAfterSeconds * 1000
          : this.#retryBaseMs * 2 ** (attempt - 1);
      await sleep(backoff, signal);
    }
    throw lastError ?? new ApifyError("network", "Apify request failed", context);
  }

  async #json<T>(
    path: string,
    init: RequestInit & { query?: Record<string, unknown> },
    signal: AbortSignal | undefined,
    context: { actorId?: string; runId?: string } = {}
  ): Promise<T> {
    const response = await this.#request(path, init, signal, context);
    const body = (await response.json().catch(() => undefined)) as unknown;
    // Every documented v2 endpoint wraps its payload in `data`; the dataset
    // items endpoint is the exception and returns a bare array.
    if (isRecord(body) && "data" in body) return body.data as T;
    return body as T;
  }

  /** Search the actor store. `responseFormat=agent` is Apify's own compact form. */
  async searchActors(
    params: {
      query?: string;
      limit?: number;
      offset?: number;
      category?: string;
      sortBy?: string;
      pricingModel?: string;
    },
    signal?: AbortSignal
  ): Promise<readonly ApifyStoreItem[]> {
    const data = await this.#json<unknown>(
      "/v2/store",
      {
        method: "GET",
        query: {
          search: params.query,
          limit: params.limit,
          offset: params.offset,
          category: params.category,
          sortBy: params.sortBy,
          pricingModel: params.pricingModel
        }
      },
      signal
    );
    const items = isRecord(data) ? data.items : data;
    return Array.isArray(items) ? (items as ApifyStoreItem[]) : [];
  }

  /** One actor's record. */
  async getActor(
    actorId: string,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const data = await this.#json<unknown>(
      `/v2/acts/${encodeURIComponent(toActorPathId(actorId))}`,
      { method: "GET" },
      signal,
      { actorId }
    );
    if (!isRecord(data)) {
      throw new ApifyError("actor_not_found", `Actor ${actorId} not found`, {
        actorId
      });
    }
    return data;
  }

  /**
   * The actor's default build, which is where the machine-readable input
   * schema lives (`actorDefinition.input`). There is no separate schema
   * endpoint — this is the authoritative source, so nothing here parses a
   * README.
   */
  async getDefaultBuild(
    actorId: string,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const data = await this.#json<unknown>(
      `/v2/acts/${encodeURIComponent(toActorPathId(actorId))}/builds/default`,
      { method: "GET" },
      signal,
      { actorId }
    );
    if (!isRecord(data)) {
      throw new ApifyError(
        "actor_not_found",
        `Actor ${actorId} has no default build to read an input schema from`,
        { actorId }
      );
    }
    return data;
  }

  /** Start a run. Returns as soon as Apify has accepted it. */
  async startRun(
    params: {
      actorId: string;
      input: Record<string, unknown>;
      memoryMbytes?: number;
      timeoutSecs?: number;
      maxItems?: number;
      build?: string;
    },
    signal?: AbortSignal
  ): Promise<ApifyRun> {
    return this.#json<ApifyRun>(
      `/v2/acts/${encodeURIComponent(toActorPathId(params.actorId))}/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params.input),
        query: {
          memory: params.memoryMbytes,
          timeout: params.timeoutSecs,
          maxItems: params.maxItems,
          build: params.build
        }
      },
      signal,
      { actorId: params.actorId }
    );
  }

  /** One poll of a run. */
  async getRun(runId: string, signal?: AbortSignal): Promise<ApifyRun> {
    return this.#json<ApifyRun>(
      `/v2/actor-runs/${encodeURIComponent(runId)}`,
      { method: "GET" },
      signal,
      { runId }
    );
  }

  /**
   * Abort a run.
   *
   * Idempotent by the API's own contract: a run already in a terminal state is
   * left alone rather than erroring. The call deliberately does **not** take
   * the caller's abort signal — it is what runs *because* the caller was
   * cancelled, and passing the aborted signal would cancel the cleanup.
   */
  async abortRun(runId: string, gracefully = false): Promise<ApifyRun | null> {
    try {
      return await this.#json<ApifyRun>(
        `/v2/actor-runs/${encodeURIComponent(runId)}/abort`,
        { method: "POST", query: { gracefully: gracefully ? "true" : undefined } },
        undefined,
        { runId }
      );
    } catch (e) {
      // Losing a race with the run finishing on its own is the success case.
      const error = asApifyError(e);
      if (error.status === 400 || error.status === 404) return null;
      throw error;
    }
  }

  /** One page of a dataset, with the dataset's total when the header carries it. */
  async getDatasetItems(
    params: {
      datasetId: string;
      offset?: number;
      limit?: number;
      clean?: boolean;
      fields?: readonly string[];
    },
    signal?: AbortSignal
  ): Promise<ApifyDatasetPage> {
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 100;
    const response = await this.#request(
      `/v2/datasets/${encodeURIComponent(params.datasetId)}/items`,
      {
        method: "GET",
        query: {
          offset,
          limit,
          format: "json",
          clean: params.clean === true ? "true" : undefined,
          fields:
            params.fields === undefined || params.fields.length === 0
              ? undefined
              : params.fields.join(",")
        }
      },
      signal
    );
    const body = (await response.json().catch(() => undefined)) as unknown;
    const totalHeader = Number(
      response.headers?.get?.("x-apify-pagination-total") ?? ""
    );
    const page: { items: unknown[]; total?: number; offset: number; limit: number } =
      { items: Array.isArray(body) ? body : [], offset, limit };
    if (Number.isFinite(totalHeader)) page.total = totalHeader;
    return page;
  }

  /**
   * One key-value record's raw bytes. This is where an actor's non-tabular
   * output lives — a screenshot's PNG, a crawl's rendered HTML, the `OUTPUT`
   * key — so it returns bytes and a content type, not parsed JSON.
   */
  async getKeyValueRecord(
    storeId: string,
    key: string,
    signal?: AbortSignal
  ): Promise<ApifyRecord | null> {
    try {
      const response = await this.#request(
        `/v2/key-value-stores/${encodeURIComponent(storeId)}/records/${encodeURIComponent(key)}`,
        { method: "GET" },
        signal
      );
      const buffer = await response.arrayBuffer();
      return {
        bytes: new Uint8Array(buffer),
        contentType:
          response.headers?.get?.("content-type") ?? "application/octet-stream"
      };
    } catch (e) {
      const error = asApifyError(e, "dataset_failed");
      // A missing key is an answer, not a failure: many actors write OUTPUT
      // only when they have something to put there.
      if (error.status === 404) return null;
      throw error;
    }
  }
}
