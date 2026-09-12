/**
 * The provider-side generation record: what a provider itself knows about the
 * media calls an account made, read back from the provider's own API.
 *
 * NodeTool keeps its own record of every generation this installation ran —
 * the `predictions` table behind `nodetool generations`
 * (docs/media-generation-tracking-design.md). That record is local: it cannot
 * see a generation made from another machine, from the provider's own web UI,
 * or from a run whose row was lost, and it carries an estimate until a
 * reconciler replaces it with the billed amount.
 *
 * A provider that keeps its own request history can answer for all of those.
 * {@link BaseProvider.listGenerations} and {@link BaseProvider.getGeneration}
 * are where that history is exposed, in one shape across providers, so a
 * caller reconciling spend or hunting a lost asset does not write a client per
 * provider. A provider without such an API keeps the base methods and throws
 * {@link ProviderGenerationsUnsupportedError}, which is a capability answer,
 * not a failure: `providerCapabilities` reports `list_generations` and
 * `get_generation` only for the providers that override them.
 */

import type { ProviderId } from "./types.js";

/**
 * A generation's state at the provider. `unknown` is its own answer: a record
 * derived from a billing event says a call was charged without saying how it
 * ended, and reporting that as `completed` would invent an outcome.
 */
export type ProviderGenerationStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

/** One provider-side generation, in the shape every provider answers with. */
export interface ProviderGeneration {
  provider: ProviderId;
  /** The provider's own request id — what `provider_request_id` holds locally. */
  request_id: string;
  /** The endpoint or model that ran, when the provider names one. */
  model: string | null;
  status: ProviderGenerationStatus;
  /** ISO timestamps, as the provider reports them. */
  created_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  /** What the provider billed, not an estimate. Null when it does not say. */
  cost: number | null;
  currency: string | null;
  quantity: number | null;
  unit_price: number | null;
  /** Output media the provider still hosts. Empty when it reports none. */
  output_urls: string[];
  /** The generation's own failure, when the provider reports one. */
  error: string | null;
}

/** Filters a provider listing understands. Every field is optional. */
export interface ProviderGenerationQuery {
  /** Endpoint / model ids to list, when the provider filters by them. */
  model?: string | readonly string[];
  status?: ProviderGenerationStatus;
  /** ISO timestamp; generations started before it are left out. */
  since?: string;
  /** ISO timestamp, exclusive upper bound. */
  until?: string;
  limit?: number;
  /** The `next_cursor` of a previous page. */
  cursor?: string | null;
  signal?: AbortSignal;
}

export interface ProviderGenerationPage {
  generations: ProviderGeneration[];
  next_cursor: string | null;
  /**
   * What this page could not answer — a provider whose listing carries cost
   * but not outcome says so here rather than guessing a status.
   */
  note: string | null;
}

/** What a single-generation lookup can be told besides the request id. */
export interface ProviderGenerationLookup {
  /** The endpoint / model id, when the caller knows it. Narrows the query. */
  model?: string;
  signal?: AbortSignal;
}

/** Raised by the base methods: this provider exposes no generation history. */
export class ProviderGenerationsUnsupportedError extends Error {
  readonly provider: string;
  readonly operation: "list" | "get";

  constructor(provider: string, operation: "list" | "get") {
    super(
      `${provider} does not expose provider-side generations (${operation}). ` +
        `Read the local record with the generations capabilities instead.`
    );
    this.name = "ProviderGenerationsUnsupportedError";
    this.provider = provider;
    this.operation = operation;
  }
}

/** Whether a thrown value is the "no generation history here" answer. */
export function isProviderGenerationsUnsupported(
  error: unknown
): error is ProviderGenerationsUnsupportedError {
  return error instanceof ProviderGenerationsUnsupportedError;
}

/**
 * A generation record with every field present, so each provider's mapper
 * fills in only what its API reports and nothing is silently absent.
 */
export function providerGeneration(
  fields: Partial<ProviderGeneration> & {
    provider: ProviderId;
    request_id: string;
  }
): ProviderGeneration {
  return {
    provider: fields.provider,
    request_id: fields.request_id,
    model: fields.model ?? null,
    status: fields.status ?? "unknown",
    created_at: fields.created_at ?? null,
    completed_at: fields.completed_at ?? null,
    duration_seconds: fields.duration_seconds ?? null,
    cost: fields.cost ?? null,
    currency: fields.currency ?? null,
    quantity: fields.quantity ?? null,
    unit_price: fields.unit_price ?? null,
    output_urls: fields.output_urls ?? [],
    error: fields.error ?? null
  };
}

/** Bound a caller's page size to what a provider's API accepts. */
export function boundedLimit(
  limit: number | undefined,
  fallback: number,
  max: number
): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(1, Math.floor(limit)), max);
}

/** The `model` filter as a list, whichever form the caller passed. */
export function modelFilter(
  model: string | readonly string[] | undefined
): string[] {
  if (model === undefined) return [];
  const list = Array.isArray(model) ? [...model] : [String(model)];
  return list.filter((id) => id.length > 0);
}
