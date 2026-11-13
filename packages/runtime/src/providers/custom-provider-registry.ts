/**
 * Registration of user-defined OpenAI-compatible providers.
 *
 * The host loads the catalog — from the database, a config file, whatever it
 * has — and calls {@link syncCustomProviders} with it. Only the slug and its
 * optional model lists are baked in; the base URL and API key are declared as
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
      _imageModels: definition.image_models ?? [],
      _videoModels: definition.video_models ?? [],
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

/** Custom provider ids each owner (a user, or the single local host) wants. */
const wantedByOwner = new Map<string, ReadonlySet<string>>();

/** Owner used by single-user hosts that sync one catalog for the process. */
const PROCESS_OWNER = "";

/**
 * Register `definitions` for `owner` and drop every `custom_*` id that no
 * owner wants any more. Returns the ids registered for this owner.
 *
 * The registry is a process global shared by every user of a multi-user
 * server. Syncing one user's catalog must not unregister another user's
 * providers: that made a run fail preflight with "provider is not registered"
 * whenever someone else had loaded the model list in between.
 */
export function syncCustomProviders(
  definitions: readonly CustomProvider[],
  owner: string = PROCESS_OWNER
): string[] {
  wantedByOwner.set(
    owner,
    new Set(definitions.map((d) => customProviderId(d.slug)))
  );
  const wanted = new Set<string>();
  for (const ids of wantedByOwner.values()) {
    for (const id of ids) wanted.add(id);
  }
  for (const id of listCustomProviderIds()) {
    if (!wanted.has(id)) unregisterProvider(id);
  }
  return definitions.map(register);
}

/** Every `custom_*` id currently in the registry. */
export function listCustomProviderIds(): string[] {
  return listRegisteredProviderIds().filter(isCustomProviderId);
}
