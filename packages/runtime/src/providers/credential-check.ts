/**
 * Cheap liveness check for a provider credential.
 *
 * A key pasted into onboarding is stored blind today: a typo, a revoked key, or
 * a key from the wrong account only surfaces later, as a 401 in the middle of a
 * run. {@link checkCredential} spends one small request against the provider's
 * own listing endpoint and reports what it learned.
 *
 * Model enumeration (`getAvailableLanguageModels`) cannot answer this: every
 * provider swallows a failed listing and returns `[]` or a static fallback, so
 * an empty list means "rejected", "offline", and "manifest-only" all at once.
 * The probe table below therefore reads the status code directly, and answers
 * `unverifiable` — never `valid` — whenever the status doesn't decide it.
 */

import { classifyProviderFailure } from "@nodetool-ai/protocol";
import { resolveAlibabaBaseURL } from "./alibaba-provider.js";
import { resolveBytePlusBaseURL } from "./byteplus-provider.js";

/**
 * - `valid` — the provider accepted the credential.
 * - `invalid` — the provider rejected it (401/403). Fix the key.
 * - `unverifiable` — nothing was learned: no probe for this provider, the
 *   request timed out, the network failed, or the provider answered something
 *   that says nothing about the credential (429, 5xx).
 */
export type CredentialCheckStatus = "valid" | "invalid" | "unverifiable";

/**
 * What a working key can pay for, when the provider lets a cheap request tell.
 *
 * - `ok` — a test request went through.
 * - `no_credit` — the key works, but the account has no credit or billing.
 * - `no_quota` — the key works, but has no quota left, as a free-tier key with
 *   no quota for the tested model does.
 * - `free_tier` — the key works on a free tier with tight limits.
 */
export type CredentialAccountState = "ok" | "no_credit" | "no_quota" | "free_tier";

export interface CredentialAccount {
  state: CredentialAccountState;
  /** One line the UI can show as-is. */
  message: string;
}

export interface CredentialCheckResult {
  status: CredentialCheckStatus;
  /** One line the UI can show as-is. */
  message: string;
  /**
   * Set only for a `valid` key whose provider has an account probe that
   * answered. Absent means nothing was learned about credit or quota.
   */
  account?: CredentialAccount;
}

interface CredentialProbe {
  /** Provider label used in messages. */
  label: string;
  /** Endpoint to GET. Receives the credential for providers that key the URL. */
  url: (value: string) => string;
  /** Auth headers for the request. */
  headers: (value: string) => Record<string, string>;
}

/**
 * Providers with a cheap, side-effect-free authenticated GET. URLs mirror the
 * bases the providers themselves use (see the sibling `*-provider.ts` files) —
 * a provider missing here reports `unverifiable`, which is the honest answer,
 * not a failure.
 */
const PROBES: Record<string, CredentialProbe> = {
  OPENAI_API_KEY: {
    label: "OpenAI",
    url: () => "https://api.openai.com/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  ANTHROPIC_API_KEY: {
    label: "Anthropic",
    url: () => "https://api.anthropic.com/v1/models?limit=1",
    headers: (v) => ({ "x-api-key": v, "anthropic-version": "2023-06-01" })
  },
  GEMINI_API_KEY: {
    label: "Gemini",
    url: (v) =>
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(v)}`,
    headers: () => ({})
  },
  GROQ_API_KEY: {
    label: "Groq",
    url: () => "https://api.groq.com/openai/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  MISTRAL_API_KEY: {
    label: "Mistral",
    url: () => "https://api.mistral.ai/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  OPENROUTER_API_KEY: {
    label: "OpenRouter",
    url: () => "https://openrouter.ai/api/v1/key",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  REQUESTY_API_KEY: {
    label: "Requesty",
    url: () => "https://router.requesty.ai/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  OPPER_API_KEY: {
    label: "Opper",
    url: () => "https://api.opper.ai/v3/compat/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  CHEAPER_INFERENCE_API_KEY: {
    label: "Cheaper Inference",
    url: () => "https://api.cheaperinference.com/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  API_ROUTE_API_KEY: {
    label: "API Route",
    url: () => "https://global.api-route.com/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  RUNCRATE_API_KEY: {
    label: "Runcrate",
    url: () => "https://api.runcrate.ai/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  STANDARDCOMPUTE_API_KEY: {
    label: "Standard Compute",
    url: () => "https://api.stdcmpt.com/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  // /v1/models is public on UberLLM; /v1/balance answers 401 without a valid key.
  UBERLLM_API_KEY: {
    label: "UberLLM",
    url: () => "https://api.uberllm.dev/v1/balance",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  DEEPSEEK_API_KEY: {
    label: "DeepSeek",
    url: () => "https://api.deepseek.com/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  XAI_API_KEY: {
    label: "xAI",
    url: () => "https://api.x.ai/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  DASHSCOPE_API_KEY: {
    label: "Alibaba Cloud",
    url: () => `${resolveAlibabaBaseURL()}/models`,
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  BYTEPLUS_ARK_API_KEY: {
    label: "BytePlus",
    url: () => `${resolveBytePlusBaseURL()}/models`,
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  CEREBRAS_API_KEY: {
    label: "Cerebras",
    url: () => "https://api.cerebras.ai/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  META_API_KEY: {
    label: "Meta AI",
    url: () => "https://api.meta.ai/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  TOGETHER_API_KEY: {
    label: "Together AI",
    url: () => "https://api.together.xyz/v1/models",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  COHERE_API_KEY: {
    label: "Cohere",
    url: () => "https://api.cohere.com/v2/models?page_size=1",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  HF_TOKEN: {
    label: "Hugging Face",
    url: () => "https://huggingface.co/api/whoami-v2",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  },
  SARVAM_API_KEY: {
    label: "Sarvam AI",
    url: () => "https://api.sarvam.ai/v2/models",
    headers: (v) => ({ "api-subscription-key": v })
  },
  ELEVENLABS_API_KEY: {
    label: "ElevenLabs",
    url: () => "https://api.elevenlabs.io/v1/user",
    headers: (v) => ({ "xi-api-key": v })
  },
  // Lists the account's pods: the same REST base the worker provider uses
  // (`packages/compute/src/providers/runpod-rest.ts`). Read-only.
  RUNPOD_API_KEY: {
    label: "RunPod",
    url: () => "https://rest.runpod.io/v1/pods",
    headers: (v) => ({ Authorization: `Bearer ${v}` })
  }
};

/** Whether a probe exists for this secret key. */
export const isCredentialVerifiable = (secretKey: string): boolean =>
  secretKey in PROBES;

/** Secret keys {@link checkCredential} can actually decide. */
export const verifiableCredentialKeys = (): string[] => Object.keys(PROBES);

export interface CheckCredentialOptions {
  /** Per-check budget. A check that overruns reports `unverifiable`. */
  timeoutMs?: number;
  /** Injected for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 6000;

type CredentialChecker = (
  secretKey: string,
  value: string
) => Promise<CredentialCheckResult>;

let checkerOverride: CredentialChecker | null = null;

/**
 * Replace every {@link checkCredential} call, or restore the probes with
 * `null`. Hermetic test hosts set it so a test key passes onboarding with no
 * network, the same way their fake providers stand in for the real ones.
 */
export function setCredentialCheckOverride(checker: CredentialChecker | null): void {
  checkerOverride = checker;
}

/**
 * Probe `value` against the provider that owns `secretKey`.
 *
 * Never throws: every failure mode resolves to a result, because the caller's
 * question ("can I save this key?") always has an answer.
 */
export async function checkCredential(
  secretKey: string,
  value: string,
  options: CheckCredentialOptions = {}
): Promise<CredentialCheckResult> {
  if (checkerOverride) {
    return checkerOverride(secretKey, value);
  }
  const probe = PROBES[secretKey];
  if (!probe) {
    return {
      status: "unverifiable",
      message: `NodeTool has no quick check for ${secretKey} — the key was taken as given.`
    };
  }
  if (!value) {
    return { status: "invalid", message: "No key was provided." };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await doFetch(probe.url(value), {
      method: "GET",
      headers: probe.headers(value),
      signal: controller.signal
    });
    if (response.ok) {
      const account = await checkAccount(secretKey, value, response, {
        fetchImpl: doFetch,
        signal: controller.signal
      });
      const result: CredentialCheckResult = {
        status: "valid",
        message: `${probe.label} accepted the key.`
      };
      if (account) {
        result.message = account.message;
        result.account = account;
      }
      return result;
    }
    if (response.status === 401 || response.status === 403) {
      return {
        status: "invalid",
        message: `${probe.label} rejected the key (${response.status}). Check that you copied it in full and that it is still active.`
      };
    }
    return {
      status: "unverifiable",
      message: `${probe.label} answered ${response.status}, which says nothing about the key. It was saved unverified.`
    };
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    return {
      status: "unverifiable",
      message: aborted
        ? `${probe.label} did not answer within ${Math.round(timeoutMs / 1000)}s. The key was saved unverified.`
        : `Could not reach ${probe.label} to check the key. It was saved unverified.`
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Account probes: credit and quota
// ---------------------------------------------------------------------------

/**
 * A listing endpoint accepts a key whatever the account can pay for, so a key
 * on an empty account or a zero-quota free tier passes the check above and
 * fails on its first real call. Most of the sessions that saved a key failed
 * exactly that way. For the providers below, one more request tells: a
 * balance endpoint where there is one, otherwise a one-token request to the
 * provider's cheapest model, which costs a fraction of a cent. A probe that
 * cannot decide returns null, never a guess.
 */
interface AccountProbeContext {
  fetchImpl: typeof fetch;
  signal: AbortSignal;
}

type AccountProbe = (
  value: string,
  listing: Response,
  context: AccountProbeContext
) => Promise<CredentialAccount | null>;

/** Read a JSON body, or null when it is not JSON. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Turn the answer to a one-token test request into an account state, using
 * the same classes the runtime puts on a failed call.
 */
async function accountFromTestRequest(
  response: Response,
  messages: { ok: string; noCredit: string; noQuota: string }
): Promise<CredentialAccount | null> {
  if (response.ok) return { state: "ok", message: messages.ok };
  const body = await response.text().catch(() => "");
  const kind = classifyProviderFailure({ status: response.status, message: body });
  if (kind === "payment") return { state: "no_credit", message: messages.noCredit };
  if (kind === "quota") return { state: "no_quota", message: messages.noQuota };
  // A model id that moved, an overloaded provider: nothing about the account.
  return null;
}

const ACCOUNT_PROBES: Record<string, AccountProbe> = {
  OPENROUTER_API_KEY: async (_value, listing) => {
    // The probe endpoint is `/api/v1/key`, which already describes the key.
    const data = record(record(await readJson(listing))?.data);
    if (!data) return null;
    const remaining = data.limit_remaining;
    if (typeof remaining === "number" && remaining <= 0) {
      return {
        state: "no_credit",
        message:
          "OpenRouter accepted the key, but its credit limit is used up. Add credit or raise the key's limit on openrouter.ai."
      };
    }
    if (data.is_free_tier === true) {
      return {
        state: "free_tier",
        message:
          "OpenRouter accepted the key. The account has never bought credit, so only free models work, with a small daily request limit."
      };
    }
    return { state: "ok", message: "OpenRouter accepted the key and has credit." };
  },

  DEEPSEEK_API_KEY: async (value, _listing, { fetchImpl, signal }) => {
    const response = await fetchImpl("https://api.deepseek.com/user/balance", {
      method: "GET",
      headers: { Authorization: `Bearer ${value}`, Accept: "application/json" },
      signal
    });
    if (!response.ok) return null;
    const body = record(await readJson(response));
    if (body?.is_available === false) {
      return {
        state: "no_credit",
        message:
          "DeepSeek accepted the key, but the account balance is empty. Top up on platform.deepseek.com before using it."
      };
    }
    return body?.is_available === true
      ? { state: "ok", message: "DeepSeek accepted the key and has balance." }
      : null;
  },

  OPENAI_API_KEY: async (value, _listing, { fetchImpl, signal }) => {
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${value}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }]
      }),
      signal
    });
    return accountFromTestRequest(response, {
      ok: "OpenAI accepted the key and answered a test request.",
      noCredit:
        "OpenAI accepted the key, but the account has no credit. Add credit under Billing on platform.openai.com.",
      noQuota:
        "OpenAI accepted the key, but it has no quota left. Check the project's limits on platform.openai.com."
    });
  },

  ANTHROPIC_API_KEY: async (value, _listing, { fetchImpl, signal }) => {
    const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": value,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }]
      }),
      signal
    });
    return accountFromTestRequest(response, {
      ok: "Anthropic accepted the key and answered a test request.",
      noCredit:
        "Anthropic accepted the key, but the credit balance is too low. Buy credits under Billing on console.anthropic.com.",
      noQuota:
        "Anthropic accepted the key, but it has reached its usage limit. Check the limits on console.anthropic.com."
    });
  },

  GEMINI_API_KEY: async (value, _listing, { fetchImpl, signal }) => {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(value)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "hi" }] }],
          generationConfig: { maxOutputTokens: 1 }
        }),
        signal
      }
    );
    return accountFromTestRequest(response, {
      // Veo and Imagen are paid-tier only on the Gemini API, and nothing a
      // key answers says which tier it is on, so the note goes with every key.
      ok: "Gemini accepted the key and answered a test request. Video (Veo) and Imagen need billing enabled on the key's Google Cloud project.",
      noCredit:
        "Gemini accepted the key, but the Google Cloud project has no billing. Enable billing in Google AI Studio.",
      noQuota:
        "Gemini accepted the key, but it has no quota left, which is common for free-tier keys. Enable billing in Google AI Studio for video, images and higher limits."
    });
  }
};

async function checkAccount(
  secretKey: string,
  value: string,
  listing: Response,
  context: AccountProbeContext
): Promise<CredentialAccount | null> {
  const probe = ACCOUNT_PROBES[secretKey];
  if (!probe) return null;
  try {
    return await probe(value, listing, context);
  } catch {
    // A failed account probe leaves the key check standing on its own.
    return null;
  }
}
