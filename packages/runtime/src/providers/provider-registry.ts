import type { BaseProvider } from "./base-provider.js";

interface ProviderRegistration {
  cls: new (...args: any[]) => BaseProvider;
  kwargs: Record<string, unknown>;
}

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

export async function getProvider(providerId: string): Promise<BaseProvider> {
  const cached = _providerCache.get(providerId);
  if (cached) {
    return cached;
  }

  const registration = _PROVIDER_REGISTRY.get(providerId);
  if (!registration) {
    throw new Error(`No provider registered for "${providerId}"`);
  }

  const instance = new registration.cls(registration.kwargs);
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
