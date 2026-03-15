import type { BaseProvider } from "./base-provider.js";

interface ProviderRegistration {
  cls: new (...args: any[]) => BaseProvider;
  kwargs: Record<string, unknown>;
}

type SecretResolver = (key: string) => Promise<string | null | undefined> | string | null | undefined;
let _secretResolver: SecretResolver | null = null;

const _PROVIDER_REGISTRY = new Map<string, ProviderRegistration>();
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
 */
export function setSecretResolver(resolver: SecretResolver): void {
  _secretResolver = resolver;
  // Clear cache so providers are re-created with resolved secrets
  _providerCache.clear();
}

export async function getProvider(providerId: string): Promise<BaseProvider> {
  const cached = _providerCache.get(providerId);
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
        const resolved = await _secretResolver(key);
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
  _providerCache.set(providerId, instance);
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
