import { createLogger } from "@nodetool-ai/config";
import type { BaseProvider } from "./base-provider.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not a behavioural contract.
const log = createLogger("nodetool.runtime.provider-registry");

interface ProviderRegistration {
  cls: new (...args: any[]) => BaseProvider;
  kwargs: Record<string, unknown>;
  // Keys that should be resolved from the secret store / env when available,
  // but are NOT required for the provider to be considered configured. The
  // mapped value is the fallback default used when nothing is resolvable.
  optionalKwargs: Record<string, unknown>;
}

/**
 * Resolve a credential by name. Callers bind any user/account identity into
 * the closure before passing it in — this module deliberately has no notion
 * of users or storage backends.
 */
export type GetSecret = (
  key: string
) => Promise<string | null | undefined> | string | null | undefined;

const _PROVIDER_REGISTRY = new Map<string, ProviderRegistration>();

export function registerProvider(
  providerId: string,
  cls: new (...args: any[]) => BaseProvider,
  kwargs: Record<string, unknown> = {},
  optionalKwargs: Record<string, unknown> = {}
): void {
  _PROVIDER_REGISTRY.set(providerId, { cls, kwargs, optionalKwargs });
}

export function getRegisteredProvider(
  providerId: string
): ProviderRegistration | null {
  return _PROVIDER_REGISTRY.get(providerId) ?? null;
}

export function listRegisteredProviderIds(): string[] {
  return Array.from(_PROVIDER_REGISTRY.keys());
}

/**
 * Build a fresh provider instance, resolving any unset credential kwargs via
 * `getSecret` first, then `process.env` as fallback. The caller owns any
 * caching — instance reuse is a property of a ProcessingContext, not a module
 * global.
 */
export async function getProvider(
  providerId: string,
  getSecret: GetSecret
): Promise<BaseProvider> {
  const registration = _PROVIDER_REGISTRY.get(providerId);
  if (!registration) {
    throw new Error(`No provider registered for "${providerId}"`);
  }

  // A kwarg is "needs resolution" when the registration declares the key with
  // an empty-string / null / undefined value. Valid falsy defaults like `0`
  // or `false` on numeric/boolean kwargs are preserved.
  const kwargs = { ...registration.kwargs };
  for (const [key, value] of Object.entries(kwargs)) {
    if (value === "" || value == null) {
      const fromSecret = await getSecret(key);
      if (fromSecret) {
        kwargs[key] = fromSecret;
        continue;
      }
      const envVal = process.env[key];
      if (envVal) {
        kwargs[key] = envVal;
      }
    }
  }

  // Optional kwargs: resolve from secret store / env when available, else use
  // the registered default. These are not required for the provider to be
  // "configured" (see isProviderConfigured) but still flow into the
  // constructor so user-set values (e.g. LMSTUDIO_API_URL) take effect on
  // every getProvider() call without a restart.
  for (const [key, fallback] of Object.entries(registration.optionalKwargs)) {
    const fromSecret = await getSecret(key);
    if (fromSecret) {
      kwargs[key] = fromSecret;
      continue;
    }
    const envVal = process.env[key];
    if (envVal) {
      kwargs[key] = envVal;
      continue;
    }
    kwargs[key] = fallback;
  }

  return new registration.cls(kwargs);
}

/** Get the secret key name required by a provider (e.g. "OPENAI_API_KEY"), or null. */
export function getProviderSecretKey(providerId: string): string | null {
  const reg = _PROVIDER_REGISTRY.get(providerId);
  if (!reg) return null;
  for (const key of Object.keys(reg.kwargs)) {
    if (
      key.includes("KEY") ||
      key.includes("TOKEN") ||
      key.includes("SECRET")
    ) {
      return key;
    }
  }
  return null;
}

/** Check if a provider's required credentials are resolvable. */
export async function isProviderConfigured(
  providerId: string,
  getSecret: GetSecret
): Promise<boolean> {
  const reg = _PROVIDER_REGISTRY.get(providerId);
  if (!reg) {
    // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
    log.debug("isProviderConfigured: not registered", { providerId });
    return false;
  }

  // Keys starting with "_" are runtime injections (e.g. `_bridge`, `_id` for
  // Python providers) and excluded from the credentials check.
  const required = Object.entries(reg.kwargs)
    .filter(
      ([key, value]) =>
        (value === "" || value == null) && !key.startsWith("_")
    )
    .map(([key]) => key);

  // Stryker disable next-line ConditionalExpression: forcing this false just falls into the empty loop below, which also returns true — equivalent.
  if (required.length === 0) return true;

  for (const key of required) {
    let value = await getSecret(key);
    if (!value) value = process.env[key];
    if (!value) {
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
      log.debug("isProviderConfigured: missing credential", {
        providerId,
        key
      });
      return false;
    }
  }
  return true;
}
