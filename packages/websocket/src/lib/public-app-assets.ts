/**
 * Resolve the static asset locators a released public app hands to its
 * visitor. Public app sessions may only open `/ws`, so browser media cannot
 * use the authenticated storage route after the page has loaded.
 */
import { loadAssetStorageConfig } from "@nodetool-ai/config";
import { Asset } from "@nodetool-ai/models";
import { createAssetUrlBuilder } from "@nodetool-ai/storage";

import { getAssetStorageKey } from "./asset-paths.js";

const ASSET_URI_PREFIX = "asset://";

function assetIdCandidates(locator: string): string[] {
  const reference = locator.slice(ASSET_URI_PREFIX.length).split(/[?#]/, 1)[0];
  if (!reference || reference.includes("/") || reference.includes("\\")) {
    return [];
  }

  const candidates = [reference];
  const extension = reference.lastIndexOf(".");
  if (extension > 0) candidates.push(reference.slice(0, extension));
  return candidates;
}

/**
 * The fetchable URL for one locator, or the locator unchanged when nothing
 * backs it. One deleted image is one broken widget, not a dead app: taking the
 * whole link down over it would hide a working app and tell the owner nothing.
 */
async function resolveAssetLocator(
  locator: string,
  userId: string,
  buildUrl: (key: string) => Promise<string>
): Promise<string> {
  let asset: Asset | null = null;
  for (const assetId of assetIdCandidates(locator)) {
    asset = await Asset.find(userId, assetId);
    if (asset) break;
  }
  if (!asset || asset.isFolder) return locator;

  try {
    return await buildUrl(getAssetStorageKey(userId, asset.id, asset.content_type));
  } catch {
    // Signing is the storage backend's call and can fail on its own; the
    // widget shows nothing rather than the app disappearing.
    return locator;
  }
}

/**
 * Deep-copy a public document value and replace exact `asset://` leaves with
 * browser-fetchable URLs scoped to the application's owner. Workflow graph
 * locators stay untouched: they are inputs to the server-side runner, not
 * static browser media.
 */
export async function resolvePublicAppStaticAssetLocators(
  value: unknown,
  userId: string
): Promise<unknown> {
  const buildUrl = createAssetUrlBuilder(loadAssetStorageConfig());
  const resolved = new Map<string, Promise<string>>();

  const resolve = async (candidate: unknown): Promise<unknown> => {
    if (typeof candidate === "string") {
      if (!candidate.startsWith(ASSET_URI_PREFIX)) return candidate;
      let url = resolved.get(candidate);
      if (!url) {
        url = resolveAssetLocator(candidate, userId, buildUrl);
        resolved.set(candidate, url);
      }
      return url;
    }
    if (Array.isArray(candidate)) return Promise.all(candidate.map(resolve));
    if (candidate === null || typeof candidate !== "object") return candidate;

    const entries = await Promise.all(
      Object.entries(candidate).map(async ([key, entry]) => [
        key,
        await resolve(entry)
      ])
    );
    return Object.fromEntries(entries);
  };

  return resolve(value);
}
