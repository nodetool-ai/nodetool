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

import { resolveAlibabaBaseURL } from "./alibaba-provider.js";

/**
 * - `valid` — the provider accepted the credential.
 * - `invalid` — the provider rejected it (401/403). Fix the key.
 * - `unverifiable` — nothing was learned: no probe for this provider, the
 *   request timed out, the network failed, or the provider answered something
 *   that says nothing about the credential (429, 5xx).
 */
export type CredentialCheckStatus = "valid" | "invalid" | "unverifiable";

export interface CredentialCheckResult {
  status: CredentialCheckStatus;
  /** One line the UI can show as-is. */
  message: string;
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
  CEREBRAS_API_KEY: {
    label: "Cerebras",
    url: () => "https://api.cerebras.ai/v1/models",
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
  ELEVENLABS_API_KEY: {
    label: "ElevenLabs",
    url: () => "https://api.elevenlabs.io/v1/user",
    headers: (v) => ({ "xi-api-key": v })
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
      return { status: "valid", message: `${probe.label} accepted the key.` };
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
