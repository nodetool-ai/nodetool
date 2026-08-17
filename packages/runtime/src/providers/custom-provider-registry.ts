/**
 * Registration of user-defined OpenAI-compatible providers.
 *
 * The host loads the catalog — from the database, a config file, whatever it
 * has — and calls {@link syncCustomProviders} with it. Only the slug and its
 * optional model list are baked in; the base URL and API key are declared as
 * kwarg *names*, so the registry resolves them per user through the caller's
 * `getSecret` on every `getProvider()` call, and an env var of the same name
 * works with no database row at all.
 */

import {
  customProviderApiKeyKey,
  customProviderBaseUrlKey,
  customProviderId,
  isCustomProviderId,
  type CustomProvider
} from "@nodetool-ai/protocol";
import { CustomOpenAIProvider } from "./custom-openai-provider.js";
import {
  listRegisteredProviderIds,
  registerProvider,
  unregisterProvider
} from "./provider-registry.js";

function register(definition: CustomProvider): string {
  const providerId = customProviderId(definition.slug);
  const baseUrlKey = customProviderBaseUrlKey(definition.slug);
  const apiKeyKey = customProviderApiKeyKey(definition.slug);

  registerProvider(
    providerId,
    CustomOpenAIProvider,
    {
      _providerId: providerId,
      _baseUrlKey: baseUrlKey,
      _apiKeyKey: apiKeyKey,
      _models: definition.models ?? [],
      // Empty declares "resolve me": the registry asks getSecret, then env, on
      // every instantiation. It is also the only required kwarg, so a user who
      // has not set a URL sees the provider as unconfigured rather than broken.
      [baseUrlKey]: ""
    },
    // Endpoints that accept anonymous requests are common enough — a local
    // router, a LAN gateway — that a missing key must not make the provider
    // unavailable.
    { [apiKeyKey]: "" }
  );
  return providerId;
}

/**
 * Make the registry match `definitions`: register each one and drop every
 * `custom_*` id that is no longer in the list. Returns the ids now registered.
 */
export function syncCustomProviders(
  definitions: readonly CustomProvider[]
): string[] {
  const wanted = new Set(definitions.map((d) => customProviderId(d.slug)));
  for (const id of listCustomProviderIds()) {
    if (!wanted.has(id)) unregisterProvider(id);
  }
  return definitions.map(register);
}

/** Every `custom_*` id currently in the registry. */
export function listCustomProviderIds(): string[] {
  return listRegisteredProviderIds().filter(isCustomProviderId);
}
