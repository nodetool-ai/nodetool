/**
 * User-defined OpenAI-compatible providers: a name, a base URL and an optional
 * API key instead of a provider file and a `PROVIDER_IDS` entry.
 *
 * The wire id is `custom_<slug>`, which lands on model objects, spans and saved
 * graphs. Base URL and key resolve per user through the ordinary secret store
 * under the names below, so the same environment variables configure a provider
 * on a server with no database writes:
 *
 *   CUSTOM_MYPROXY_BASE_URL=https://proxy.example.com/v1
 *   CUSTOM_MYPROXY_API_KEY=sk-…
 */

import { isNonEmptyString, isRecord, isString } from "./predicates.js";

/** Prefix that marks a provider id as user-defined. */
export const CUSTOM_PROVIDER_PREFIX = "custom_";

/** Setting key holding the JSON catalog of custom provider definitions. */
export const CUSTOM_PROVIDERS_SETTING_KEY = "CUSTOM_OPENAI_PROVIDERS";

/** A slug is lowercase alphanumeric with underscores, and starts with a letter. */
const SLUG_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

export interface CustomProvider {
  /** Slug — unique per user, stable once created. */
  slug: string;
  /** Display name shown in the model menu and settings. */
  name: string;
  /**
   * Model ids to offer instead of calling `GET <base_url>/models`. Empty means
   * "ask the endpoint", which is what most OpenAI-compatible proxies support.
   */
  models?: string[];
}

/** Wire provider id for a slug (`"myproxy"` → `"custom_myproxy"`). */
export function customProviderId(slug: string): string {
  return `${CUSTOM_PROVIDER_PREFIX}${slug}`;
}

/** True when `providerId` names a user-defined provider. */
export function isCustomProviderId(providerId: string): boolean {
  return providerId.startsWith(CUSTOM_PROVIDER_PREFIX);
}

/** Secret key holding the endpoint URL for a slug. */
export function customProviderBaseUrlKey(slug: string): string {
  return `CUSTOM_${slug.toUpperCase()}_BASE_URL`;
}

/** Secret key holding the API key for a slug. */
export function customProviderApiKeyKey(slug: string): string {
  return `CUSTOM_${slug.toUpperCase()}_API_KEY`;
}

/**
 * Derive a slug from a display name. Non-alphanumerics collapse to `_`, and a
 * name that starts with a digit gets a `p` in front so the result still parses
 * as an identifier. Returns `""` when nothing usable survives — callers ask the
 * user for a slug rather than inventing one.
 */
export function slugifyProviderName(name: string): string {
  const collapsed = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!collapsed) return "";
  const prefixed = /^[0-9]/.test(collapsed) ? `p${collapsed}` : collapsed;
  return prefixed.slice(0, 32);
}

/** Reason `slug` is unusable, or null when it is fine. */
export function customProviderSlugError(slug: string): string | null {
  if (!slug) return "A slug is required.";
  if (!SLUG_PATTERN.test(slug)) {
    return "Use 1–32 characters: a leading letter, then lowercase letters, digits or underscores.";
  }
  return null;
}

/**
 * Reason `url` is unusable as an OpenAI-compatible base URL, or null when it is
 * fine. Only the shape is checked here — whether the endpoint answers is the
 * connection test's job.
 */
export function customProviderBaseUrlError(url: string): string | null {
  if (!url.trim()) return "A base URL is required.";
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return "Enter a full URL, e.g. https://proxy.example.com/v1";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "The URL must be http or https.";
  }
  return null;
}

/** Drop the trailing slashes an endpoint URL must not carry. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Read a stored catalog. The row is plaintext and hand-editable, so every shape
 * that is not a usable definition is dropped rather than thrown on — one bad
 * entry must not cost the user every other provider they configured.
 */
export function parseCustomProviderCatalog(raw: string): CustomProvider[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const { slug, name, models } = entry;
    if (!isString(slug) || customProviderSlugError(slug)) return [];
    return [
      {
        slug,
        name: isNonEmptyString(name) ? name : slug,
        models: Array.isArray(models) ? models.filter(isString) : []
      }
    ];
  });
}
