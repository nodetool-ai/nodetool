/**
 * One refused provider call, read into what the user should do next.
 *
 * The server stamps the failure class on `provider_call_failed`. A surface
 * that only has the error text (a chat turn that failed before any frame
 * arrived) reads it with the same rules from `@nodetool-ai/protocol`, so both
 * paths sort a failure the same way.
 */
import {
  classifyProviderFailure,
  isAccountProviderFailure,
  type ProviderCallFailed,
  type ProviderFailureKind
} from "@nodetool-ai/protocol";

/** The failure classes an action card names. */
export type ProviderFailureCategory =
  | "billing"
  | "quota"
  | "auth"
  | "model_unavailable"
  | "rate_limit"
  | "other";

export interface ProviderFailureSummary {
  category: ProviderFailureCategory;
  /** Provider id, when the failure or the text names one. */
  provider?: string;
  /** Model id, when the failure or the text names one. */
  model?: string;
  /** True for the classes a user fixes by switching model or fixing the account. */
  switchModel: boolean;
}

const CATEGORY_BY_KIND: Partial<Record<ProviderFailureKind, ProviderFailureCategory>> = {
  payment: "billing",
  quota: "quota",
  auth: "auth",
  not_found: "model_unavailable",
  rate_limit: "rate_limit"
};

/** Where each provider's own billing page is, for the "Add credit" action. */
const BILLING_URLS: Record<string, string> = {
  openai: "https://platform.openai.com/settings/organization/billing/overview",
  anthropic: "https://console.anthropic.com/settings/billing",
  gemini: "https://aistudio.google.com/usage",
  deepseek: "https://platform.deepseek.com/top_up",
  openrouter: "https://openrouter.ai/settings/credits",
  fal: "https://fal.ai/dashboard/billing",
  replicate: "https://replicate.com/account/billing",
  kie: "https://kie.ai/billing",
  xai: "https://console.x.ai/",
  mistral: "https://console.mistral.ai/billing/",
  groq: "https://console.groq.com/settings/billing",
  elevenlabs: "https://elevenlabs.io/app/subscription"
};

export const providerBillingUrl = (provider?: string): string | undefined =>
  provider ? BILLING_URLS[provider.toLowerCase()] : undefined;

/**
 * The HTTP status at the front of an error text, the shape both the SDKs and
 * the server's annotation use ("429 You exceeded your current quota …").
 */
function leadingStatus(text: string): number | null {
  const match = text.match(/^\s*(\d{3})\b/);
  if (!match) return null;
  const status = Number(match[1]);
  return status >= 100 && status <= 599 ? status : null;
}

/** `provider/model` as the server's annotation names the failing call. */
function targetFromText(text: string): { provider?: string; model?: string } {
  const match = text.match(/—\s*([a-z][\w-]*)\/([\w.:@/-]+?)\s+(?:is|has|reports|does|rejected|refused|timed|did)\b/i);
  return match ? { provider: match[1].toLowerCase(), model: match[2] } : {};
}

function summarize(
  kind: ProviderFailureKind | string,
  provider?: string,
  model?: string
): ProviderFailureSummary {
  const category =
    CATEGORY_BY_KIND[kind as ProviderFailureKind] ?? "other";
  return {
    category,
    provider,
    model,
    switchModel: isAccountProviderFailure(kind)
  };
}

/** Read a structured failure frame. */
export function summarizeProviderCallFailure(
  failure: ProviderCallFailed
): ProviderFailureSummary {
  return summarize(failure.kind, failure.provider, failure.model ?? undefined);
}

/** Read an error text that came with no frame. */
export function summarizeProviderErrorText(text: string): ProviderFailureSummary {
  const kind = classifyProviderFailure({
    status: leadingStatus(text),
    message: text
  });
  const target = targetFromText(text);
  return summarize(kind, target.provider, target.model);
}

/**
 * How many failures at the end of the list share the last one's provider,
 * model and class. Two in a row means retrying will not help.
 */
export function trailingRepeatCount(
  failures: readonly Pick<ProviderCallFailed, "provider" | "model" | "kind">[]
): number {
  const last = failures[failures.length - 1];
  if (!last) return 0;
  let count = 0;
  for (let index = failures.length - 1; index >= 0; index -= 1) {
    const failure = failures[index];
    if (
      failure.provider !== last.provider ||
      (failure.model ?? null) !== (last.model ?? null) ||
      failure.kind !== last.kind
    ) {
      break;
    }
    count += 1;
  }
  return count;
}

/** A failure seen this many times in a row stops offering Retry. */
export const REPEAT_FAILURE_THRESHOLD = 2;

interface ModelChoice {
  id: string;
  provider: string;
}

/**
 * A model to switch to after a failure. A billing, quota or key failure is
 * about the provider account, so the switch goes to another provider. A model
 * the provider does not serve is about the model, so another model from the
 * same provider comes first. Free models rank first, because a failure about
 * money is the common case. Returns undefined when nothing else is listed.
 */
export function pickAlternativeModel<T extends ModelChoice>(
  models: readonly T[],
  failing: { provider?: string; model?: string; category: ProviderFailureCategory }
): T | undefined {
  const failingProvider = failing.provider?.toLowerCase();
  const isFailing = (model: T): boolean =>
    model.provider.toLowerCase() === failingProvider && model.id === failing.model;
  const candidates = models.filter((model) => !isFailing(model));
  const isFree = (model: T): boolean => /(^|[/:-])free\b/i.test(model.id);
  const firstOf = (pool: T[]): T | undefined => pool.find(isFree) ?? pool[0];
  const sameProvider = candidates.filter(
    (model) => model.provider.toLowerCase() === failingProvider
  );
  const otherProvider = candidates.filter(
    (model) => model.provider.toLowerCase() !== failingProvider
  );
  if (failing.category === "model_unavailable") {
    return firstOf(sameProvider) ?? firstOf(otherProvider);
  }
  return firstOf(otherProvider);
}
