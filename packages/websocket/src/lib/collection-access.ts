/**
 * Ownership and input rules for vector collections exposed over HTTP.
 *
 * The `VectorProvider` interface has no concept of a user — collections are a
 * flat, global namespace shared by every caller. That is fine for the local
 * single-user case, but in multi-user (Supabase) mode it means any
 * authenticated user can list, read, rename, delete, and index into any other
 * user's collection. Teaching every provider (sqlite-vec, Pinecone, Supabase,
 * Chroma) about users is a much larger change, so ownership is recorded in
 * collection metadata and enforced here, at the API boundary.
 *
 * In-process consumers — RAG nodes, agent tools, the CLI — talk to the
 * provider directly and are deliberately unaffected: they already run with the
 * privileges of whatever invoked them.
 *
 * Collections that predate this (no owner recorded) stay readable and writable
 * by everyone. Retroactively assigning them to a user would lock existing
 * deployments out of their own data, so they are treated as shared. Only
 * collections created through the API from here on are isolated.
 */
import { isNonEmptyString } from "./wire-values.js";


/** Metadata key holding the id of the user who created the collection. */
export const OWNER_METADATA_KEY = "owner_user_id";

/**
 * Metadata keys the server owns. A client that could set these through
 * `collections.update` would be able to hand itself another user's collection,
 * so they are stripped from client input and re-applied from server state.
 */
export const RESERVED_COLLECTION_METADATA_KEYS: readonly string[] = [
  OWNER_METADATA_KEY
];

/** Longest accepted collection name. */
export const MAX_COLLECTION_NAME_LENGTH = 128;

type Metadata = Record<string, string | number | boolean>;

/**
 * The recorded owner of a collection, or `null` when it predates ownership
 * tracking.
 */
export function collectionOwner(
  metadata: Metadata | undefined
): string | null {
  const owner = metadata?.[OWNER_METADATA_KEY];
  return isNonEmptyString(owner) ? owner : null;
}

/**
 * Whether `userId` may read or mutate a collection carrying `metadata`.
 * Unowned (pre-existing) collections are shared — see the module comment.
 */
export function canAccessCollection(
  metadata: Metadata | undefined,
  userId: string
): boolean {
  const owner = collectionOwner(metadata);
  return owner === null || owner === userId;
}

/**
 * Drop server-owned keys from client-supplied metadata.
 *
 * Built with `Object.fromEntries`, which defines each key as a data property
 * rather than assigning it — so a `__proto__` key in a JSON body lands as an
 * ordinary entry instead of reaching the result's prototype.
 */
export function stripReservedMetadata(
  metadata: Record<string, string | number | boolean> | undefined
): Metadata {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) => !RESERVED_COLLECTION_METADATA_KEYS.includes(key)
    )
  );
}

/**
 * Validate a collection name. Returns an error message, or `null` when the
 * name is acceptable.
 *
 * Deliberately permissive: names created before this check exist in live
 * stores, and rejecting them would break those deployments on the next
 * rename. This only rules out values that are already broken somewhere —
 * path/route separators (the REST index route matches `[^/]+`, so a name with
 * a slash is unreachable), control characters and NULs (which corrupt log
 * lines and headers), surrounding whitespace (two names that look identical),
 * and unbounded length.
 */
export function validateCollectionName(name: string): string | null {
  if (!name) return "Collection name is required";
  if (name.length > MAX_COLLECTION_NAME_LENGTH) {
    return `Collection name exceeds ${MAX_COLLECTION_NAME_LENGTH} characters`;
  }
  if (name !== name.trim()) {
    return "Collection name must not start or end with whitespace";
  }
  if (name.includes("/") || name.includes("\\")) {
    return "Collection name must not contain path separators";
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return "Collection name must not contain control characters";
  }
  return null;
}
