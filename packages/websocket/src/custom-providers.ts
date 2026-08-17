/**
 * Persistence for user-defined OpenAI-compatible providers.
 *
 * The catalog (slug, display name, optional model list) is one JSON row in the
 * plaintext `Setting` table; the endpoint URL and API key are ordinary secrets,
 * so they encrypt at rest and resolve per user through the same `getSecret`
 * path every other provider credential uses.
 *
 * The registry itself is a process global. Sync writes ids into it, never
 * credentials — two users with the same slug each reach their own endpoint, and
 * a user who configured nothing sees the provider as unconfigured.
 */

import { Secret, Setting, clearSecretCache } from "@nodetool-ai/models";
import {
  syncCustomProviders,
  clearProviderCache
} from "@nodetool-ai/runtime";
import {
  CUSTOM_PROVIDERS_SETTING_KEY,
  customProviderApiKeyKey,
  customProviderBaseUrlKey,
  customProviderBaseUrlError,
  customProviderSlugError,
  normalizeBaseUrl,
  parseCustomProviderCatalog,
  type CustomProvider
} from "@nodetool-ai/protocol";

/** A definition plus the per-user state the settings UI renders. */
export interface CustomProviderView extends CustomProvider {
  base_url: string;
  has_api_key: boolean;
}

async function loadCustomProviderCatalog(
  userId: string
): Promise<CustomProvider[]> {
  const setting = await Setting.find(userId, CUSTOM_PROVIDERS_SETTING_KEY);
  return setting ? parseCustomProviderCatalog(setting.getValue()) : [];
}

async function saveCatalog(
  userId: string,
  definitions: CustomProvider[]
): Promise<void> {
  await Setting.upsert({
    userId,
    key: CUSTOM_PROVIDERS_SETTING_KEY,
    value: JSON.stringify(definitions),
    description: "User-defined OpenAI-compatible providers"
  });
}

/** Definitions plus each one's stored endpoint and whether a key is set. */
export async function listCustomProviders(
  userId: string
): Promise<CustomProviderView[]> {
  const definitions = await loadCustomProviderCatalog(userId);
  return Promise.all(
    definitions.map(async (definition) => {
      const baseUrlKey = customProviderBaseUrlKey(definition.slug);
      const apiKeyKey = customProviderApiKeyKey(definition.slug);
      const [urlSecret, keySecret] = await Promise.all([
        Secret.find(userId, baseUrlKey),
        Secret.find(userId, apiKeyKey)
      ]);
      let baseUrl = process.env[baseUrlKey] ?? "";
      if (urlSecret) {
        try {
          baseUrl = (await urlSecret.getDecryptedValue()) ?? baseUrl;
        } catch {
          // An undecryptable URL reads as unset, which is what the card should
          // show — the user re-enters it.
        }
      }
      return {
        ...definition,
        base_url: baseUrl,
        has_api_key: Boolean(keySecret) || Boolean(process.env[apiKeyKey])
      };
    })
  );
}

/** Load the user's catalog into the provider registry. */
export async function syncCustomProviderRegistry(
  userId: string
): Promise<string[]> {
  const definitions = await loadCustomProviderCatalog(userId);
  const ids = syncCustomProviders(definitions);
  clearProviderCache();
  return ids;
}

export interface SaveCustomProviderInput {
  slug: string;
  name: string;
  base_url: string;
  /** Omit to leave a stored key untouched; empty string clears it. */
  api_key?: string;
  models?: string[];
}

/**
 * Create or replace one custom provider. Throws `Error` with a user-facing
 * message when the slug or URL is unusable — the caller maps it to a 400.
 */
export async function saveCustomProvider(
  userId: string,
  input: SaveCustomProviderInput
): Promise<CustomProviderView> {
  const slugError = customProviderSlugError(input.slug);
  if (slugError) throw new Error(slugError);
  const urlError = customProviderBaseUrlError(input.base_url);
  if (urlError) throw new Error(urlError);

  const definition: CustomProvider = {
    slug: input.slug,
    name: input.name.trim() || input.slug,
    models: input.models ?? []
  };

  const catalog = await loadCustomProviderCatalog(userId);
  const next = catalog.filter((d) => d.slug !== definition.slug);
  next.push(definition);
  await saveCatalog(userId, next);

  const baseUrl = normalizeBaseUrl(input.base_url);
  const baseUrlKey = customProviderBaseUrlKey(definition.slug);
  await Secret.upsert({
    userId,
    key: baseUrlKey,
    value: baseUrl,
    description: `Endpoint for ${definition.name}`
  });
  clearSecretCache(userId, baseUrlKey);

  const apiKeyKey = customProviderApiKeyKey(definition.slug);
  let hasApiKey = Boolean(await Secret.find(userId, apiKeyKey));
  if (input.api_key !== undefined) {
    if (input.api_key) {
      await Secret.upsert({
        userId,
        key: apiKeyKey,
        value: input.api_key,
        description: `API key for ${definition.name}`
      });
      hasApiKey = true;
    } else {
      await Secret.deleteSecret(userId, apiKeyKey);
      hasApiKey = false;
    }
    clearSecretCache(userId, apiKeyKey);
  }

  await syncCustomProviderRegistry(userId);
  return {
    ...definition,
    base_url: baseUrl,
    has_api_key: hasApiKey || Boolean(process.env[apiKeyKey])
  };
}

/** Remove a custom provider and both of its secrets. Returns false if absent. */
export async function deleteCustomProvider(
  userId: string,
  slug: string
): Promise<boolean> {
  const catalog = await loadCustomProviderCatalog(userId);
  if (!catalog.some((d) => d.slug === slug)) return false;

  await saveCatalog(
    userId,
    catalog.filter((d) => d.slug !== slug)
  );
  for (const key of [
    customProviderBaseUrlKey(slug),
    customProviderApiKeyKey(slug)
  ]) {
    await Secret.deleteSecret(userId, key);
    clearSecretCache(userId, key);
  }
  await syncCustomProviderRegistry(userId);
  return true;
}
