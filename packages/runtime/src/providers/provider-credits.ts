/**
 * Remaining provider credit: read from the provider's own balance endpoint
 * where one exists, remembered per credential, and marked exhausted when a
 * call fails because the account cannot pay.
 *
 * A provider whose account is empty fails every call it gets, and model
 * discovery kept offering it. {@link readProviderCredit} answers from a short
 * cache, so model search can skip an empty account without a request per
 * search, and the settings page can show what is left.
 *
 * Only documented endpoints that accept the same key the provider already
 * uses are probed. A provider missing from {@link CREDIT_ENDPOINTS} reports
 * nothing, which the UI shows as unknown. The per-provider findings, including
 * the providers that have no such endpoint, are in `docs/providers.md`.
 */

// No Node built-ins here: `base-provider.ts` imports this module, and the
// runtime barrel reaches the browser worker bundle.

import { KIMI_BASE_URLS, resolveKimiBaseURL } from "./moonshot-region.js";

/**
 * - `available`: the account has credit.
 * - `low`: credit is left, but less than a tenth of the limit, or under one
 *   unit of currency.
 * - `exhausted`: no credit is left. Calls will fail until the user tops up.
 */
export type ProviderCreditState = "available" | "low" | "exhausted";

/** What `remaining` counts. Currency amounts carry `currency` too. */
export type ProviderCreditUnit = "currency" | "credits" | "characters";

export interface ProviderCredit {
  state: ProviderCreditState;
  /** Amount left, in `unit`. Absent when the provider does not say. */
  remaining?: number;
  /** The cap `remaining` counts down from, when the provider has one. */
  limit?: number;
  unit?: ProviderCreditUnit;
  /** ISO 4217 code, uppercase, for `unit: "currency"`. */
  currency?: string;
  /** `balance_endpoint`: read from the provider. `call_failure`: a call was refused for payment. */
  source: "balance_endpoint" | "call_failure";
  /** One English line an agent or log can show as-is. */
  summary: string;
  /** `Date.now()` when this was learned. */
  checkedAt: number;
}

/** Region and base-URL settings a fetcher reads, such as `KIMI_REGION`. */
export type CreditSettings = Readonly<Record<string, string | undefined>>;

type CreditFetcher = (
  value: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  settings: CreditSettings
) => Promise<ProviderCredit | null>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

async function getJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Record<string, unknown> | null> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json", ...headers },
    signal
  });
  if (!response.ok) return null;
  try {
    return record(await response.json());
  } catch {
    return null;
  }
}

function formatAmount(amount: number, unit: ProviderCreditUnit, currency?: string): string {
  if (unit === "currency") {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
  return `${Math.round(amount).toLocaleString("en-US")} ${unit}`;
}

/** Build a credit record from an amount and an optional cap. */
export function creditFromAmount(input: {
  label: string;
  remaining: number;
  unit: ProviderCreditUnit;
  currency?: string;
  limit?: number;
  /** Overage billing: the account keeps working past zero. */
  canExceed?: boolean;
  checkedAt?: number;
}): ProviderCredit {
  const { label, remaining, unit, currency, limit } = input;
  const exhausted = remaining <= 0 && !input.canExceed;
  const low =
    !exhausted &&
    (limit !== undefined && limit > 0
      ? remaining / limit < 0.1
      : unit === "currency" && remaining < 1);
  const state: ProviderCreditState = exhausted ? "exhausted" : low ? "low" : "available";
  const amount = formatAmount(Math.max(remaining, 0), unit, currency);
  const credit: ProviderCredit = {
    state,
    remaining,
    unit,
    source: "balance_endpoint",
    summary: exhausted
      ? `${label} has no credit left. Top up with the provider before using it.`
      : `${label} has ${amount}${limit !== undefined ? ` of ${formatAmount(limit, unit, currency)}` : ""} left.`,
    checkedAt: input.checkedAt ?? Date.now()
  };
  if (currency) credit.currency = currency;
  if (limit !== undefined) credit.limit = limit;
  return credit;
}

/**
 * Providers with a documented balance endpoint that takes the provider's own
 * key. Each fetcher returns null when the answer does not decide anything,
 * such as a key without billing permission.
 */
const CREDIT_ENDPOINTS: Record<string, CreditFetcher> = {
  // GET /api/v1/key describes the calling key. `limit_remaining` is null for a
  // key with no spending cap, and the account balance itself needs a
  // management key (/api/v1/credits), so an uncapped key reports nothing.
  openrouter: async (value, fetchImpl, signal) => {
    const body = await getJson(
      fetchImpl,
      "https://openrouter.ai/api/v1/key",
      { Authorization: `Bearer ${value}` },
      signal
    );
    const data = record(body?.data);
    const remaining = num(data?.limit_remaining);
    if (remaining === undefined) return null;
    return creditFromAmount({
      label: "OpenRouter",
      remaining,
      unit: "currency",
      currency: "USD",
      limit: num(data?.limit)
    });
  },

  deepseek: async (value, fetchImpl, signal) => {
    const body = await getJson(
      fetchImpl,
      "https://api.deepseek.com/user/balance",
      { Authorization: `Bearer ${value}` },
      signal
    );
    if (!body) return null;
    const infos = Array.isArray(body.balance_infos) ? body.balance_infos : [];
    const first = record(infos[0]);
    const total = num(first?.total_balance);
    if (total === undefined) {
      return body.is_available === false
        ? creditFromAmount({ label: "DeepSeek", remaining: 0, unit: "currency" })
        : null;
    }
    const currency = typeof first?.currency === "string" ? first.currency.toUpperCase() : undefined;
    // `is_available` is DeepSeek's own verdict and wins over the amount.
    return creditFromAmount({
      label: "DeepSeek",
      remaining: body.is_available === false ? 0 : total,
      unit: "currency",
      currency
    });
  },

  // GET /v1/users/me/balance on the host `KIMI_REGION` selects. The two
  // platforms bill in different currencies: USD on platform.kimi.ai
  // (https://platform.kimi.ai/docs/api/balance.md), CNY on the mainland
  // platform.kimi.com (https://platform.kimi.com/docs/api/balance.md).
  moonshot: async (value, fetchImpl, signal, settings) => {
    const baseURL = resolveKimiBaseURL(settings.KIMI_REGION);
    const body = await getJson(
      fetchImpl,
      `${baseURL}/users/me/balance`,
      { Authorization: `Bearer ${value}` },
      signal
    );
    const remaining = num(record(body?.data)?.available_balance);
    if (remaining === undefined) return null;
    return creditFromAmount({
      label: "Moonshot",
      remaining,
      unit: "currency",
      currency: baseURL === KIMI_BASE_URLS.china ? "CNY" : "USD"
    });
  },

  // KIE answers errors with HTTP 200 and the status in `code`.
  kie: async (value, fetchImpl, signal) => {
    const body = await getJson(
      fetchImpl,
      "https://api.kie.ai/api/v1/chat/credit",
      { Authorization: `Bearer ${value}` },
      signal
    );
    if (num(body?.code) !== 200) return null;
    const remaining = num(body?.data);
    if (remaining === undefined) return null;
    return creditFromAmount({ label: "KIE", remaining, unit: "credits" });
  },

  // Needs a key with the `billing:usage:read` permission. A plain API key
  // answers 403 and reports nothing.
  fal_ai: async (value, fetchImpl, signal) => {
    const body = await getJson(
      fetchImpl,
      "https://api.fal.ai/v1/account/billing?expand=credits",
      { Authorization: `Key ${value}` },
      signal
    );
    const credits = record(body?.credits);
    const remaining = num(credits?.current_balance);
    if (remaining === undefined) return null;
    return creditFromAmount({
      label: "fal",
      remaining,
      unit: "currency",
      currency: typeof credits?.currency === "string" ? credits.currency.toUpperCase() : "USD"
    });
  },

  elevenlabs: async (value, fetchImpl, signal) => {
    const body = await getJson(
      fetchImpl,
      "https://api.elevenlabs.io/v1/user/subscription",
      { "xi-api-key": value },
      signal
    );
    const used = num(body?.character_count);
    const limit = num(body?.character_limit);
    if (used === undefined || limit === undefined) return null;
    const extension = body?.max_credit_limit_extension;
    const canExceed =
      body?.can_extend_character_limit === true &&
      (extension === "unlimited" || (num(extension) ?? 0) > 0);
    return creditFromAmount({
      label: "ElevenLabs",
      remaining: limit - used,
      limit,
      unit: "credits",
      canExceed
    });
  },

  meshy: async (value, fetchImpl, signal) => {
    const body = await getJson(
      fetchImpl,
      "https://api.meshy.ai/openapi/v1/balance",
      { Authorization: `Bearer ${value}` },
      signal
    );
    const remaining = num(body?.balance);
    if (remaining === undefined) return null;
    return creditFromAmount({ label: "Meshy", remaining, unit: "credits" });
  },

  topaz: async (value, fetchImpl, signal) => {
    const body = await getJson(
      fetchImpl,
      "https://api.topazlabs.com/account/v1/credits/balance",
      { "X-API-Key": value },
      signal
    );
    const remaining = num(body?.available_credits);
    if (remaining === undefined) return null;
    return creditFromAmount({ label: "Topaz", remaining, unit: "credits" });
  },

  atlascloud: async (value, fetchImpl, signal) => {
    const body = await getJson(
      fetchImpl,
      "https://api.atlascloud.ai/public/v1/balance",
      { Authorization: `Bearer ${value}` },
      signal
    );
    const available = record(body?.available);
    const remaining = num(available?.value);
    if (remaining === undefined) return null;
    return creditFromAmount({
      label: "Atlas Cloud",
      remaining,
      unit: "currency",
      currency: typeof available?.currency === "string" ? available.currency.toUpperCase() : "USD"
    });
  },

  // `token` is the key's own allowance, `user` the account balance. The key
  // can spend whichever is smaller, unless the key is unlimited.
  evolink: async (value, fetchImpl, signal) => {
    const body = await getJson(
      fetchImpl,
      "https://api.evolink.ai/v1/credits",
      { Authorization: `Bearer ${value}` },
      signal
    );
    const data = record(body?.data);
    const user = num(record(data?.user)?.remaining_credits);
    if (user === undefined) return null;
    const token = record(data?.token);
    const tokenRemaining = num(token?.remaining_credits);
    const remaining =
      token?.unlimited_credits === true || tokenRemaining === undefined
        ? user
        : Math.min(user, tokenRemaining);
    return creditFromAmount({ label: "Evolink", remaining, unit: "credits" });
  },

  // Comfy reports the balance only inside its usage time series. Amounts are
  // cents despite the `_micros` suffix.
  comfy_cloud: async (value, fetchImpl, signal) => {
    const body = await getJson(
      fetchImpl,
      "https://cloud.comfy.org/api/billing/usage/timeseries?months=1&granularity=month",
      { "X-API-Key": value },
      signal
    );
    const balance = record(record(body?.summary)?.balance);
    const cents = num(balance?.amount_micros);
    if (cents === undefined) return null;
    return creditFromAmount({
      label: "Comfy",
      remaining: cents / 100,
      unit: "currency",
      currency: typeof balance?.currency === "string" ? balance.currency.toUpperCase() : "USD"
    });
  }
};

/** Whether NodeTool can read this provider's remaining credit. */
export const hasCreditEndpoint = (providerId: string): boolean =>
  providerId in CREDIT_ENDPOINTS;

/** Provider ids with a balance endpoint. */
export const creditEndpointProviderIds = (): string[] => Object.keys(CREDIT_ENDPOINTS);

export interface FetchProviderCreditOptions {
  timeoutMs?: number;
  /**
   * The provider's region settings, resolved as provider construction
   * resolves them. A fetcher whose provider has regions reads its host here.
   */
  settings?: CreditSettings;
  /** Injected for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Ask the provider for its remaining credit. Never throws. Null means nothing
 * was learned: no endpoint, a refused or failed request, or an answer that
 * says nothing about the balance.
 */
export async function fetchProviderCredit(
  providerId: string,
  value: string,
  options: FetchProviderCreditOptions = {}
): Promise<ProviderCredit | null> {
  const fetcher = CREDIT_ENDPOINTS[providerId];
  if (!fetcher || !value) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetcher(value, options.fetchImpl ?? fetch, controller.signal, options.settings ?? {});
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/** How long a balance read stays fresh. */
export const CREDIT_TTL_MS = 10 * 60 * 1000;
/**
 * How long a payment refusal keeps a provider out of model search. Shorter
 * than a balance read is not useful: a top-up takes the user minutes, and the
 * settings page re-reads the balance on demand.
 */
export const EXHAUSTED_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  credit: ProviderCredit | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ProviderCredit | null>>();

/**
 * 53-bit string hash (cyrb53). A cache key only needs to tell two credentials
 * of one provider apart, not resist an attacker, and it keeps `node:crypto`
 * out of the browser bundle.
 */
function hashCredential(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * The cache key for one credential: the provider id plus a hash of the key,
 * so two users on one server never share an entry and the key itself is
 * never held as a map key. Credential-free providers use the id alone.
 */
export function creditAccountKey(providerId: string, value: string | undefined): string {
  if (!value) return providerId;
  return `${providerId}:${hashCredential(value)}`;
}

/** What a provider instance needs to read and record its credit. */
export interface CreditAccount {
  providerId: string;
  key: string;
  /** Reads the balance with the instance's credential. Absent without an endpoint. */
  fetch?: () => Promise<ProviderCredit | null>;
}

/** Bind a provider credential to the cache. */
export function creditAccountFor(
  providerId: string,
  value: string | undefined,
  options: FetchProviderCreditOptions = {}
): CreditAccount {
  const account: CreditAccount = {
    providerId,
    key: creditAccountKey(providerId, value)
  };
  if (value && hasCreditEndpoint(providerId)) {
    account.fetch = () => fetchProviderCredit(providerId, value, options);
  }
  return account;
}

/** The cached credit for an account, or undefined when nothing fresh is known. */
export function cachedProviderCredit(key: string, now = Date.now()): ProviderCredit | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }
  return entry.credit;
}

export interface ReadProviderCreditOptions {
  /** Ignore the cache and ask the provider again. */
  refresh?: boolean;
  /** Answer from the cache only. A stale entry starts a refresh in the background. */
  cachedOnly?: boolean;
}

/**
 * The account's credit: fresh from the cache, else read from the provider.
 * Concurrent reads of one account share one request.
 */
export async function readProviderCredit(
  account: CreditAccount,
  options: ReadProviderCreditOptions = {}
): Promise<ProviderCredit | null> {
  if (!options.refresh) {
    const cached = cachedProviderCredit(account.key);
    if (cached !== undefined) return cached;
  }
  if (!account.fetch) return null;
  if (options.cachedOnly) {
    void refreshCredit(account);
    return null;
  }
  return refreshCredit(account);
}

function refreshCredit(account: CreditAccount): Promise<ProviderCredit | null> {
  const pending = inFlight.get(account.key);
  if (pending) return pending;
  const fetchCredit = account.fetch;
  if (!fetchCredit) return Promise.resolve(null);
  const request = fetchCredit()
    .then((credit) => {
      // A failed read must not erase a payment refusal recorded meanwhile.
      const existing = cachedProviderCredit(account.key);
      if (credit || existing === undefined) {
        cache.set(account.key, { credit, expiresAt: Date.now() + CREDIT_TTL_MS });
      }
      return credit ?? existing ?? null;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(account.key));
  inFlight.set(account.key, request);
  return request;
}

/**
 * Remember that a call on this account was refused because it cannot pay.
 * Model search skips the provider until the entry expires or a balance read
 * shows credit again.
 */
export function markProviderCreditExhausted(key: string, providerLabel: string): ProviderCredit {
  const credit: ProviderCredit = {
    state: "exhausted",
    source: "call_failure",
    summary: `${providerLabel} refused a call for lack of credit. Top up with the provider, then test the key in Settings.`,
    checkedAt: Date.now()
  };
  cache.set(key, { credit, expiresAt: Date.now() + EXHAUSTED_TTL_MS });
  return credit;
}

/** Forget what is known about one account, or every account with no key. */
export function clearProviderCredit(key?: string): void {
  if (key === undefined) {
    cache.clear();
    inFlight.clear();
    return;
  }
  cache.delete(key);
}

/** Why model search should skip this account, or null when it should not. */
export function creditBlockReason(credit: ProviderCredit | null | undefined): string | null {
  return credit?.state === "exhausted" ? credit.summary : null;
}
