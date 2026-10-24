/**
 * Who may do what to a shared project document.
 *
 *   owner  — the row's `user_id`: everything, including delete and sharing
 *   editor — a collaborator grant with role "editor": read and save
 *   viewer — a collaborator grant with role "viewer": read
 *
 * A caller without the required role gets the same NOT_FOUND a missing id
 * gets, so private document ids are not probeable. Workflows have their own
 * tables and checks in the workflows router.
 */

import {
  Application,
  DocumentCollaborator,
  ImageDocument,
  JsScript,
  Script,
  Storyboard,
  TimelineSequence,
  type SharedDocumentType
} from "@nodetool-ai/models";

export type DocumentRole = "owner" | "editor" | "viewer";

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 } satisfies Record<
  DocumentRole,
  number
>;

/** The fields every shared document row carries. */
export interface SharedDocumentRow {
  id: string;
  user_id: string;
  name: string;
  updated_at: string;
}

/** Whether the caller holds at least `minimum` on the document. */
export async function hasDocumentRole(
  type: SharedDocumentType,
  document: Pick<SharedDocumentRow, "id" | "user_id">,
  userId: string,
  minimum: DocumentRole
): Promise<boolean> {
  if (document.user_id === userId) return true;
  if (minimum === "owner") return false;
  const grant = await DocumentCollaborator.findFor(type, document.id, userId);
  return grant !== null && ROLE_RANK[grant.role] >= ROLE_RANK[minimum];
}

const LOADERS: Record<
  SharedDocumentType,
  (id: string) => Promise<SharedDocumentRow | null>
> = {
  storyboard: (id) => Storyboard.findById(id),
  script: (id) => Script.findById(id),
  timeline: (id) => TimelineSequence.findById(id),
  sketch: (id) => ImageDocument.findById(id),
  application: (id) => Application.findById(id),
  jsscript: (id) => JsScript.findById(id)
};

/** Load any shared document row by kind and full id. */
export function loadSharedDocument(
  type: SharedDocumentType,
  id: string
): Promise<SharedDocumentRow | null> {
  return LOADERS[type](id);
}

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

/** Owner id → ids of resources the owner's shared documents name. */
type SharedAssetRefs = Map<string, Set<string>>;

interface SharedAssetsEntry {
  builtAt: number;
  refs: Promise<SharedAssetRefs>;
}

const sharedAssetsByUser = new Map<string, SharedAssetsEntry>();

/** Every id each document shared with the caller names, by document owner. */
async function loadSharedAssetRefs(userId: string): Promise<SharedAssetRefs> {
  const grants = await DocumentCollaborator.listForUser(userId);
  const documents = await Promise.all(
    grants.map((grant) =>
      loadSharedDocument(grant.document_type, grant.document_id)
    )
  );
  const refs: SharedAssetRefs = new Map();
  for (const document of documents) {
    if (!document) continue;
    let ids = refs.get(document.user_id);
    if (!ids) {
      ids = new Set();
      refs.set(document.user_id, ids);
    }
    for (const match of JSON.stringify(document).matchAll(RESOURCE_ID_TOKEN)) {
      ids.add(match[0]);
    }
  }
  return refs;
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
 * Whether a document owned by `ownerId` and shared with the caller names
 * `assetId`. The documents are loaded once per caller and kept for a few
 * seconds, since every image, thumbnail and video a shared document shows
 * asks this.
 */
export async function isAssetIdSharedWithUser(
  userId: string,
  ownerId: string,
  assetId: string
): Promise<boolean> {
  const cached = await sharedAssetsFor(userId, SHARED_ASSETS_TTL_MS).refs;
  if (cached.get(ownerId)?.has(assetId)) return true;
  const fresh = await sharedAssetsFor(userId, SHARED_ASSETS_MISS_REFRESH_MS)
    .refs;
  return fresh.get(ownerId)?.has(assetId) ?? false;
}

/**
 * Whether a document shared with the caller makes an asset readable. The
 * asset must belong to the document's owner and the stored row must name its
 * id, so a grant exposes the media the document shows and nothing else of the
 * owner's library.
 */
export function isAssetSharedWithUser(
  userId: string,
  asset: { id: string; user_id: string }
): Promise<boolean> {
  return isAssetIdSharedWithUser(userId, asset.user_id, asset.id);
}
