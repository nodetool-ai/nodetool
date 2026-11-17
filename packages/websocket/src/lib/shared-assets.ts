/**
 * The other people's files a caller may read, cached per caller for a few
 * seconds: the files of reference sets on shared workflows and timelines,
 * and the ids the other shared kinds name in their stored rows.
 *
 * Kept apart from document-access.ts, which document-refs.ts reads for
 * effective access, so the two do not import each other.
 */

import { DocumentCollaborator } from "@nodetool-ai/models";
import { loadSharedDocument } from "./document-access.js";
import { readableSharedFiles } from "./document-refs.js";

/**
 * How long a caller's shared-asset set answers a hit. A grant removed by the
 * owner (or a document deleted) stops exposing its media within this window;
 * `removeCollaborator` drops the entry at once.
 */
const SHARED_ASSETS_TTL_MS = 5_000;

/**
 * A miss rebuilds the set when it is at least this old, so media the owner
 * added a moment ago resolves on the collaborator's next request. Bounds the
 * reloads an id the caller cannot see triggers.
 */
const SHARED_ASSETS_MISS_REFRESH_MS = 1_000;

/** Users whose sets are kept. The oldest is dropped first. */
const SHARED_ASSETS_MAX_USERS = 500;

/** A generated resource id standing on its own, not inside a longer hex run. */
const RESOURCE_ID_TOKEN = /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/g;

/**
 * What a caller may read of other people's media: by owner, the ids that
 * shared documents of the kinds without reference sets name, and the files of
 * the reference sets of shared workflows and timelines.
 */
interface SharedAssetRefs {
  /** Owner id → ids the owner's shared documents name. */
  byOwner: Map<string, Set<string>>;
  /** Files readable through the reference sets of workflows and timelines. */
  refFiles: Set<string>;
}

interface SharedAssetsEntry {
  builtAt: number;
  refs: Promise<SharedAssetRefs>;
}

const sharedAssetsByUser = new Map<string, SharedAssetsEntry>();

/**
 * Storyboards, scripts, sketches, apps and JS scripts have no reference set
 * function yet (WP2.10), so their stored row is scanned for ids, as before.
 */
async function loadSharedAssetRefs(userId: string): Promise<SharedAssetRefs> {
  const allGrants = await DocumentCollaborator.listForUser(userId);
  const grants = allGrants.filter(
    (grant) => grant.document_type !== "timeline"
  );
  const documents = await Promise.all(
    grants.map((grant) =>
      loadSharedDocument(grant.document_type, grant.document_id)
    )
  );
  const byOwner = new Map<string, Set<string>>();
  for (const document of documents) {
    if (!document) continue;
    let ids = byOwner.get(document.user_id);
    if (!ids) {
      ids = new Set();
      byOwner.set(document.user_id, ids);
    }
    for (const match of JSON.stringify(document).matchAll(RESOURCE_ID_TOKEN)) {
      ids.add(match[0]);
    }
  }
  return { byOwner, refFiles: await readableSharedFiles(userId, allGrants) };
}

function buildSharedAssets(userId: string): SharedAssetsEntry {
  const entry: SharedAssetsEntry = {
    builtAt: Date.now(),
    refs: loadSharedAssetRefs(userId)
  };
  // Re-inserting moves the user to the newest end of the insertion order.
  sharedAssetsByUser.delete(userId);
  sharedAssetsByUser.set(userId, entry);
  while (sharedAssetsByUser.size > SHARED_ASSETS_MAX_USERS) {
    const oldest = sharedAssetsByUser.keys().next();
    if (oldest.done) break;
    sharedAssetsByUser.delete(oldest.value);
  }
  // A failed load is not cached; the caller still sees the rejection.
  entry.refs.catch(() => {
    if (sharedAssetsByUser.get(userId) === entry) {
      sharedAssetsByUser.delete(userId);
    }
  });
  return entry;
}

/** The caller's cached set when younger than `maxAgeMs`, else a new one. */
function sharedAssetsFor(userId: string, maxAgeMs: number): SharedAssetsEntry {
  const entry = sharedAssetsByUser.get(userId);
  if (entry && Date.now() - entry.builtAt < maxAgeMs) return entry;
  return buildSharedAssets(userId);
}

/**
 * Drop the cached shared-asset set of one user, or of every user. Call it
 * when a user's grants change.
 */
export function invalidateSharedAssets(userId?: string): void {
  if (userId === undefined) {
    sharedAssetsByUser.clear();
  } else {
    sharedAssetsByUser.delete(userId);
  }
}

/**
 * Whether a document shared with the caller makes `assetId` of `ownerId`
 * readable: a file in a reference set the caller may read on a shared
 * workflow or timeline, or an id another shared document of `ownerId` names.
 * The answer is kept per caller for a few seconds, since every image,
 * thumbnail and video a shared document shows asks this. Anything else is
 * refused like a missing file (FR49, AC28).
 */
export async function isAssetIdSharedWithUser(
  userId: string,
  ownerId: string,
  assetId: string
): Promise<boolean> {
  const has = (refs: SharedAssetRefs): boolean =>
    refs.refFiles.has(assetId) ||
    (refs.byOwner.get(ownerId)?.has(assetId) ?? false);
  if (has(await sharedAssetsFor(userId, SHARED_ASSETS_TTL_MS).refs)) {
    return true;
  }
  return has(await sharedAssetsFor(userId, SHARED_ASSETS_MISS_REFRESH_MS).refs);
}

/**
 * Whether a document shared with the caller makes an asset readable. A
 * grant exposes the media the document shows and nothing else of the owner's
 * library: see {@link isAssetIdSharedWithUser}.
 */
export function isAssetSharedWithUser(
  userId: string,
  asset: { id: string; user_id: string }
): Promise<boolean> {
  return isAssetIdSharedWithUser(userId, asset.user_id, asset.id);
}
