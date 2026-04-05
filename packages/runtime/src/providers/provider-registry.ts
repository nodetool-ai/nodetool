import type { BaseProvider } from "./base-provider.js";

interface ProviderRegistration {
  cls: new (...args: any[]) => BaseProvider;
  kwargs: Record<string, unknown>;
}

type SecretResolver = (
  key: string,
  userId: string
) => Promise<string | null | undefined> | string | null | undefined;
let _secretResolver: SecretResolver | null = null;

const _PROVIDER_REGISTRY = new Map<string, ProviderRegistration>();
// Cache keyed by "providerId:userId" for per-user provider instances
const _providerCache = new Map<string, BaseProvider>();

export function registerProvider(
  providerId: string,
  cls: new (...args: any[]) => BaseProvider,
  kwargs: Record<string, unknown> = {}
): void {
  _PROVIDER_REGISTRY.set(providerId, { cls, kwargs });
}

export function getRegisteredProvider(
  providerId: string
): ProviderRegistration | null {
  return _PROVIDER_REGISTRY.get(providerId) ?? null;
}

/**
 * Set a secret resolver so that providers can resolve API keys from
 * sources beyond process.env (e.g. encrypted secrets DB).
 *
 * The resolver receives (secretKey, userId) so secrets are resolved per-user.
 */
export function setSecretResolver(resolver: SecretResolver): void {
  _secretResolver = resolver;
  // Clear cache so providers are re-created with resolved secrets
  _providerCache.clear();
}

export async function getProvider(
  providerId: string,
  userId = "1"
): Promise<BaseProvider> {
  const cacheKey = `${providerId}:${userId}`;
  const cached = _providerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const registration = _PROVIDER_REGISTRY.get(providerId);
  if (!registration) {
    throw new Error(`No provider registered for "${providerId}"`);
  }

  // Re-resolve any undefined/empty values via secret resolver (DB → env)
  // or direct env var lookup as final fallback
  const kwargs = { ...registration.kwargs };
  for (const [key, value] of Object.entries(kwargs)) {
    if (!value) {
      if (_secretResolver) {
        const resolved = await _secretResolver(key, userId);
        if (resolved) {
          kwargs[key] = resolved;
          continue;
        }
      }
      const envVal = process.env[key];
      if (envVal) {
        kwargs[key] = envVal;
      }
    }
  }

  const instance = new registration.cls(kwargs);
  _providerCache.set(cacheKey, instance);
  return instance;
}

export function clearProviderCache(): number {
  const size = _providerCache.size;
  _providerCache.clear();
  return size;
}

export function listRegisteredProviderIds(): string[] {
  return Array.from(_PROVIDER_REGISTRY.keys());
}

/** Get the secret key name required by a provider (e.g. "OPENAI_API_KEY"), or null. */
export function getProviderSecretKey(providerId: string): string | null {
  const reg = _PROVIDER_REGISTRY.get(providerId);
  if (!reg) return null;
  // The kwargs keys are the secret names; find the first one that looks like a key/token
  for (const key of Object.keys(reg.kwargs)) {
    if (
      key.includes("KEY") ||
      key.includes("TOKEN") ||
      key.includes("SECRET")
    ) {
      return key;
    }
  }
  // No secret — provider is local (ollama, llama_cpp, etc.)
  return null;
}

/** Check if a provider has credentials available for a given user (DB, env, or is local). */
export async function isProviderConfigured(
  providerId: string,
  userId = "1"
): Promise<boolean> {
  const secretKey = getProviderSecretKey(providerId);
  if (!secretKey) return true; // Local provider, always available

  // Check via secret resolver (DB → env)
  if (_secretResolver) {
    const val = await _secretResolver(secretKey, userId);
    if (val) return true;
  }
  // Direct env check
  return Boolean(process.env[secretKey]);
}
