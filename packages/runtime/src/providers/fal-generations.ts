/**
 * FAL's request history, read through its Platform APIs.
 *
 * Two endpoints answer different halves of a generation, and this module is
 * the one client for both (https://fal.ai/docs/api-reference/platform-apis):
 *
 *  - `GET /v1/models/billing-events` — one record per *charge*: request id,
 *    endpoint, timestamp and the billed cost. Account-wide, so it is what a
 *    listing without an endpoint filter can use. A billing event says a call
 *    was charged, never how it ended, so those records carry
 *    `status: "unknown"` rather than an invented outcome.
 *  - `GET /v1/models/requests/by-endpoint` — one record per *request*: status
 *    code, timings, and with `expand=payloads` the input and output. It
 *    requires at least one endpoint id, so it serves a listing filtered by
 *    model and the second half of a single lookup.
 *
 * Both need an admin-scoped key; NodeTool reuses `FAL_API_KEY` and a key
 * without that scope 401/403s. The caller gets that as a thrown error on a
 * direct read, and as a `note` with null costs when only the cost half fails.
 */

import { createLogger } from "@nodetool-ai/config";
import { isFiniteNumber, isNumber } from "@nodetool-ai/protocol";
import {
  boundedLimit,
  modelFilter,
  providerGeneration,
  type ProviderGeneration,
  type ProviderGenerationLookup,
  type ProviderGenerationPage,
  type ProviderGenerationQuery,
  type ProviderGenerationStatus
} from "./provider-generations.js";

const log = createLogger("nodetool.runtime.fal-generations");

const FAL_PLATFORM_BASE = "https://api.fal.ai/v1";
const BILLING_EVENTS_PATH = "/models/billing-events";
const REQUESTS_PATH = "/models/requests/by-endpoint";
/** `limit` ceiling both endpoints document. */
const MAX_PAGE = 100;
const DEFAULT_PAGE = 50;
/** The window FAL keeps queryable when a request id is given. */
const LOOKUP_WINDOW_DAYS = 90;
const NANO_PER_USD = 1_000_000_000;

/** One file in a FAL result payload. */
export interface FalFile {
  url?: string;
}

/**
 * The output fields FAL models publish media under. A model that names its
 * output something else still yields a record — with no `output_urls`, which
 * is the honest answer for a payload this does not recognize.
 */
export interface FalJsonOutput {
  image?: FalFile;
  images?: FalFile[];
  video?: FalFile;
  videos?: FalFile[];
  audio?: FalFile;
  audio_file?: FalFile;
  model_mesh?: FalFile;
}

export interface FalBillingEvent {
  request_id?: string;
  endpoint_id?: string;
  timestamp?: string;
  output_units?: number | null;
  unit_price?: number | null;
  cost_total?: number | null;
  cost_estimate_nano_usd?: number | null;
}

interface FalBillingEventsResponse {
  billing_events?: FalBillingEvent[];
  next_cursor?: string | null;
}

export interface FalRequestItem {
  request_id?: string;
  endpoint_id?: string;
  started_at?: string | null;
  sent_at?: string | null;
  ended_at?: string | null;
  status_code?: number | null;
  duration?: number | null;
  json_output?: FalJsonOutput;
}

interface FalRequestsResponse {
  items?: FalRequestItem[];
  next_cursor?: string | null;
}

/** How this module reaches FAL. Injectable so tests drive it without network. */
export interface FalGenerationsOptions {
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function buildUrl(path: string, params: [string, string][]): string {
  const query = new URLSearchParams();
  for (const [key, value] of params) {
    if (value.length > 0) query.append(key, value);
  }
  const suffix = query.toString();
  return `${FAL_PLATFORM_BASE}${path}${suffix ? `?${suffix}` : ""}`;
}

/** FAL refused the key: it is missing, invalid, or not admin-scoped. */
export class FalPlatformAuthError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(
      `FAL rejected the platform API key (HTTP ${status}). Reading FAL's ` +
        `generation history needs an admin-scoped FAL_API_KEY.`
    );
    this.name = "FalPlatformAuthError";
    this.status = status;
  }
}

async function falGet<T>(
  apiKey: string,
  url: string,
  options: FalGenerationsOptions
): Promise<T> {
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const init: RequestInit = {
    headers: { Authorization: `Key ${apiKey}` }
  };
  if (options.signal) init.signal = options.signal;
  const res = await fetchFn(url, init);
  if (res.status === 401 || res.status === 403) {
    throw new FalPlatformAuthError(res.status);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `FAL platform API ${res.status} for ${url}: ${body.slice(0, 500)}`
    );
  }
  // SAFETY: each caller passes the response interface documented for the
  // endpoint in that URL, and every field of those interfaces is optional, so
  // a payload missing one narrows to undefined rather than lying.
  return (await res.json()) as T;
}

function costOf(event: FalBillingEvent): number | null {
  if (isFiniteNumber(event.cost_total)) return event.cost_total;
  const nano = event.cost_estimate_nano_usd;
  return isFiniteNumber(nano) ? nano / NANO_PER_USD : null;
}

/** Outputs FAL still hosts for a request, from the payloads it returns. */
export function falOutputUrls(output: FalJsonOutput | undefined): string[] {
  if (!output) return [];
  const files: (FalFile | undefined)[] = [
    output.image,
    output.video,
    output.audio,
    output.audio_file,
    output.model_mesh,
    ...(output.images ?? []),
    ...(output.videos ?? [])
  ];
  const urls: string[] = [];
  for (const file of files) {
    const url = file?.url;
    if (url !== undefined && url.length > 0) urls.push(url);
  }
  return urls;
}

/**
 * A request's outcome from its HTTP status. A request FAL has accepted but not
 * finished has no `ended_at` and no status code yet — that is `running`, not a
 * missing value.
 */
export function falRequestStatus(
  item: FalRequestItem
): ProviderGenerationStatus {
  const code = item.status_code;
  if (!isNumber(code)) {
    return item.ended_at ? "unknown" : "running";
  }
  if (code >= 200 && code < 400) return "completed";
  if (code >= 400) return "failed";
  return "unknown";
}

/** FAL's `status` filter for the statuses it can express. */
function falStatusFilter(status: ProviderGenerationStatus | undefined): string {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  return "";
}

function fromBillingEvent(event: FalBillingEvent): ProviderGeneration | null {
  const requestId = event.request_id;
  if (requestId === undefined || requestId.length === 0) return null;
  return providerGeneration({
    provider: "fal_ai",
    request_id: requestId,
    model: event.endpoint_id ?? null,
    // A charge is not an outcome. `by-endpoint` is what knows how it ended.
    status: "unknown",
    created_at: event.timestamp ?? null,
    cost: costOf(event),
    currency: "USD",
    quantity: event.output_units ?? null,
    unit_price: event.unit_price ?? null
  });
}

function fromRequestItem(
  item: FalRequestItem,
  event: FalBillingEvent | undefined
): ProviderGeneration | null {
  const requestId = item.request_id;
  if (requestId === undefined || requestId.length === 0) return null;
  return providerGeneration({
    provider: "fal_ai",
    request_id: requestId,
    model: item.endpoint_id ?? event?.endpoint_id ?? null,
    status: falRequestStatus(item),
    created_at: item.started_at ?? item.sent_at ?? event?.timestamp ?? null,
    completed_at: item.ended_at ?? null,
    duration_seconds: item.duration ?? null,
    cost: event ? costOf(event) : null,
    currency: event ? "USD" : null,
    quantity: event?.output_units ?? null,
    unit_price: event?.unit_price ?? null,
    output_urls: falOutputUrls(item.json_output)
  });
}

/** One billing event by request id, or null when FAL has not posted one. */
export async function falBillingEvent(
  apiKey: string,
  requestId: string,
  options: FalGenerationsOptions = {}
): Promise<FalBillingEvent | null> {
  const url = buildUrl(BILLING_EVENTS_PATH, [
    ["request_id", requestId],
    ["start", isoDaysAgo(LOOKUP_WINDOW_DAYS)]
  ]);
  const body = await falGet<FalBillingEventsResponse>(apiKey, url, options);
  return (
    (body.billing_events ?? []).find((e) => e.request_id === requestId) ?? null
  );
}

/**
 * The billed cost of one FAL request, in USD, or null when no billing event
 * exists for it yet. The reconciler's lookup — see `fal-billing.ts` in
 * `@nodetool-ai/fal-nodes` for the retry that surrounds it.
 */
export async function falRequestCost(
  apiKey: string,
  requestId: string,
  options: FalGenerationsOptions = {}
): Promise<{
  cost: number;
  currency: string;
  quantity: number | null;
  unit_price: number | null;
} | null> {
  const event = await falBillingEvent(apiKey, requestId, options);
  if (!event) return null;
  const cost = costOf(event);
  if (cost === null) return null;
  return {
    cost,
    currency: "USD",
    quantity: event.output_units ?? null,
    unit_price: event.unit_price ?? null
  };
}

/**
 * List FAL's own record of this account's generations, newest first.
 *
 * With a `model` filter the request history answers, so each row carries a
 * real status and its outputs, and one billing call fills the costs in.
 * Without one, only the account-wide billing feed can answer, so the rows
 * carry cost but `status: "unknown"` — the `note` says so.
 */
export async function falListGenerations(
  apiKey: string,
  query: ProviderGenerationQuery = {},
  options: FalGenerationsOptions = {}
): Promise<ProviderGenerationPage> {
  const limit = boundedLimit(query.limit, DEFAULT_PAGE, MAX_PAGE);
  const endpoints = modelFilter(query.model);
  const window: [string, string][] = [
    ["start", query.since ?? ""],
    ["end", query.until ?? ""]
  ];

  if (endpoints.length === 0) {
    const url = buildUrl(BILLING_EVENTS_PATH, [
      ...window,
      ["limit", String(limit)],
      ["cursor", query.cursor ?? ""]
    ]);
    const body = await falGet<FalBillingEventsResponse>(apiKey, url, options);
    const generations = (body.billing_events ?? [])
      .map(fromBillingEvent)
      .filter((row): row is ProviderGeneration => row !== null);
    return {
      generations,
      next_cursor: body.next_cursor ?? null,
      note:
        "FAL lists account-wide generations through its billing feed, which " +
        "records the charge and not the outcome. Pass a model (endpoint id) " +
        "to read status, timings and outputs."
    };
  }

  const url = buildUrl(REQUESTS_PATH, [
    ...window,
    ["endpoint_id", endpoints.join(",")],
    ["limit", String(limit)],
    ["cursor", query.cursor ?? ""],
    ["status", falStatusFilter(query.status)],
    ["expand", "payloads"]
  ]);
  const body = await falGet<FalRequestsResponse>(apiKey, url, options);
  const items = body.items ?? [];

  // The request history carries no cost, so one billing call over the same
  // window and endpoints supplies it. A key without billing scope leaves the
  // costs null rather than failing a listing that otherwise answered.
  const costs = new Map<string, FalBillingEvent>();
  let note: string | null = null;
  if (items.length > 0) {
    const billingUrl = buildUrl(BILLING_EVENTS_PATH, [
      ...window,
      ["endpoint_id", endpoints.join(",")],
      ["limit", String(MAX_PAGE)]
    ]);
    try {
      const billing = await falGet<FalBillingEventsResponse>(
        apiKey,
        billingUrl,
        options
      );
      for (const event of billing.billing_events ?? []) {
        if (event.request_id) costs.set(event.request_id, event);
      }
    } catch (err) {
      log.warn(`FAL billing lookup failed, listing without costs: ${err}`);
      note = `Costs are missing: the FAL billing feed answered ${String(err)}.`;
    }
  }

  const generations = items
    .map((item) =>
      fromRequestItem(item, costs.get(item.request_id ?? "") ?? undefined)
    )
    .filter((row): row is ProviderGeneration => row !== null);
  return { generations, next_cursor: body.next_cursor ?? null, note };
}

/**
 * One FAL generation by request id. The billing feed finds it account-wide and
 * names its endpoint; the request history then adds status, timings and
 * outputs. A caller that already knows the endpoint passes it as `model`, and
 * the lookup works even before FAL posts the charge.
 */
export async function falGetGeneration(
  apiKey: string,
  requestId: string,
  lookup: ProviderGenerationLookup = {},
  options: FalGenerationsOptions = {}
): Promise<ProviderGeneration | null> {
  const event = await falBillingEvent(apiKey, requestId, options);
  const endpointId = lookup.model ?? event?.endpoint_id ?? null;
  if (endpointId === null) {
    return event ? fromBillingEvent(event) : null;
  }

  const url = buildUrl(REQUESTS_PATH, [
    ["endpoint_id", endpointId],
    ["request_id", requestId],
    ["start", isoDaysAgo(LOOKUP_WINDOW_DAYS)],
    ["expand", "payloads"]
  ]);
  const body = await falGet<FalRequestsResponse>(apiKey, url, options);
  const item = (body.items ?? []).find((i) => i.request_id === requestId);
  if (!item) return event ? fromBillingEvent(event) : null;
  return fromRequestItem(item, event ?? undefined);
}
