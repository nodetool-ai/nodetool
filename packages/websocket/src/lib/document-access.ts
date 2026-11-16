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
 *
 * `effectiveAccess` combines every grant a person holds into one role and
 * three options, for workflows and the other kinds alike (P1 to P6 of the
 * PRD, docs/plans/native-cloud-sync/prd.md). It is read at every request
 * and never cached, so an option change applies on the next one.
 */

import {
  Application,
  DocumentCollaborator,
  DocumentShare,
  ImageDocument,
  JsScript,
  Script,
  Storyboard,
  TimelineSequence,
  Workflow,
  WorkflowCollaborator,
  WorkflowShare,
  type ShareOptions,
  type SharedDocumentType
} from "@nodetool-ai/models";
import type {
  AccessGrantItem,
  EffectiveAccessItem
} from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { readableSharedFiles } from "./document-refs.js";

export type DocumentRole = "owner" | "editor" | "viewer";

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 } satisfies Record<
  DocumentRole,
  number
>;

/** Every kind a grant can name. */
export type AccessKind = SharedDocumentType | "workflow";

const NO_OPTIONS: ShareOptions = {
  allow_history: false,
  allow_download: false,
  allow_duplicate: false
};

const ALL_OPTIONS: ShareOptions = {
  allow_history: true,
  allow_download: true,
  allow_duplicate: true
};

const OPTION_KEYS = [
  "allow_history",
  "allow_download",
  "allow_duplicate"
] as const satisfies ReadonlyArray<keyof ShareOptions>;

function optionsOf(source: ShareOptions): ShareOptions {
  return {
    allow_history: source.allow_history === true,
    allow_download: source.allow_download === true,
    allow_duplicate: source.allow_duplicate === true
  };
}

/**
 * Combine grants into one access (P1, P2). The role is the highest. An
 * option is on when any grant turns it on, and always for an editor or the
 * owner. `given_by` names the grants that give the role and each option.
 */
export function combineGrants(
  grants: readonly AccessGrantItem[]
): EffectiveAccessItem | null {
  if (grants.length === 0) return null;
  let best = 0;
  for (const grant of grants) best = Math.max(best, ROLE_RANK[grant.role]);
  const role = (Object.keys(ROLE_RANK) as DocumentRole[]).find(
    (r) => ROLE_RANK[r] === best
  ) as DocumentRole;
  const roleIndexes = grants.flatMap((g, i) =>
    ROLE_RANK[g.role] === best ? [i] : []
  );
  const options = { ...NO_OPTIONS };
  const givenBy: EffectiveAccessItem["given_by"] = {
    role: roleIndexes,
    allow_history: [],
    allow_download: [],
    allow_duplicate: []
  };
  for (const key of OPTION_KEYS) {
    const indexes = grants.flatMap((g, i) =>
      g.role !== "viewer" || g.options[key] ? [i] : []
    );
    options[key] = indexes.length > 0;
    givenBy[key] = indexes;
  }
  return { role, options, grants: [...grants], given_by: givenBy };
}

interface GrantRow extends ShareOptions {
  id: string;
  role: "viewer" | "editor";
  share_id: string | null;
}

type ShareRow = ShareOptions & { id: string; isRevoked: boolean };

/** One person's grants on a document, with link options read from the links. */
async function grantItems(
  rows: readonly GrantRow[],
  loadShare: (id: string) => Promise<ShareRow | null>
): Promise<AccessGrantItem[]> {
  const items: AccessGrantItem[] = [];
  for (const row of rows) {
    if (row.share_id === null) {
      items.push({
        source: "invitation",
        grant_id: row.id,
        share_id: null,
        role: row.role,
        options: optionsOf(row),
        link_disabled: false
      });
      continue;
    }
    const share = await loadShare(row.share_id);
    items.push({
      source: "link",
      grant_id: row.id,
      share_id: row.share_id,
      role: row.role,
      // A link removed with its document leaves nothing to read.
      options: share ? optionsOf(share) : { ...NO_OPTIONS },
      link_disabled: share ? share.isRevoked : true
    });
  }
  return items;
}

function ownerGrant(): AccessGrantItem {
  return {
    source: "owner",
    grant_id: null,
    share_id: null,
    role: "owner",
    options: { ...ALL_OPTIONS },
    link_disabled: false
  };
}

/** The document row behind an access decision. */
export interface AccessDocument {
  id: string;
  user_id: string;
}

/**
 * The grants of `userId` on a loaded document, without combining them.
 * Empty for a person with no grant.
 */
export async function grantsOn(
  kind: AccessKind,
  document: AccessDocument & { access?: string | null },
  userId: string
): Promise<AccessGrantItem[]> {
  const grants: AccessGrantItem[] = [];
  if (document.user_id === userId) grants.push(ownerGrant());
  if (kind === "workflow") {
    const rows = await WorkflowCollaborator.listFor(document.id, userId);
    grants.push(
      ...(await grantItems(rows, async (id) => {
        const share = (await WorkflowShare.get(id)) as WorkflowShare | null;
        return share && share.workflow_id === document.id ? share : null;
      }))
    );
    if (document.access === "public" && grants.length === 0) {
      grants.push({
        source: "public",
        grant_id: null,
        share_id: null,
        role: "viewer",
        options: { ...NO_OPTIONS },
        link_disabled: false
      });
    }
    return grants;
  }
  const rows = await DocumentCollaborator.listFor(kind, document.id, userId);
  grants.push(
    ...(await grantItems(rows, async (id) => {
      const share = (await DocumentShare.get(id)) as DocumentShare | null;
      return share &&
        share.document_type === kind &&
        share.document_id === document.id
        ? share
        : null;
    }))
  );
  return grants;
}

/** Load the row of any kind that carries grants. */
export async function loadAccessDocument(
  kind: AccessKind,
  id: string
): Promise<(AccessDocument & { access?: string | null }) | null> {
  if (kind === "workflow") {
    const workflow = (await Workflow.get(id)) as Workflow | null;
    return workflow ?? null;
  }
  return loadSharedDocument(kind, id);
}

/**
 * The effective access of `userId` on a document: role, options and the
 * grants that give them. `null` when the person has no access or the
 * document does not exist.
 */
export async function effectiveAccess(
  userId: string,
  kind: AccessKind,
  id: string
): Promise<EffectiveAccessItem | null> {
  const document = await loadAccessDocument(kind, id);
  if (!document) return null;
  return combineGrants(await grantsOn(kind, document, userId));
}

/** Whether an access may read the document's saved versions (AC26). */
export function mayReadHistory(access: EffectiveAccessItem | null): boolean {
  return access !== null && access.options.allow_history;
}

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

/**
 * Each person who holds a grant on a document, once, with their effective
 * role and options and the grants that give them (P6). The owner is left
 * out.
 */
export async function peopleOn(
  kind: AccessKind,
  document: AccessDocument,
  userIds: Iterable<string>
): Promise<Array<{ user_id: string; access: EffectiveAccessItem }>> {
  const people: Array<{ user_id: string; access: EffectiveAccessItem }> = [];
  for (const userId of new Set(userIds)) {
    if (userId === document.user_id) continue;
    const access = combineGrants(await grantsOn(kind, document, userId));
    if (access) people.push({ user_id: userId, access });
  }
  return people;
}
