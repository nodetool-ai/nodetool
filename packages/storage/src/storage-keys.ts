import { isAbsolute, relative } from "node:path";

export function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function normalizeStorageKey(key: string): string {
  const segments: string[] = [];
  for (const segment of key.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) {
        throw new Error(`Invalid storage key: ${key}`);
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  const cleaned = segments.join("/");
  if (!cleaned) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return cleaned;
}

export function joinStorageKey(
  prefix: string | undefined,
  key: string
): string {
  const normalizedKey = normalizeStorageKey(key);
  if (!prefix) return normalizedKey;
  const normalizedPrefix = normalizeStorageKey(prefix);
  return `${normalizedPrefix}/${normalizedKey}`;
}

// ── Per-owner asset keys ────────────────────────────────────────────────────
//
// Asset objects live at `<userId>/<assetId>.<ext>` (thumbnail:
// `<userId>/<assetId>_thumb.jpg`). The owner is the first path segment, which
// is what makes the boundary enforceable outside this process: a Supabase
// Storage RLS policy or an S3 bucket policy can match on the leading segment,
// and a signed upload URL scoped to such a key can only ever write into its
// owner's prefix.
//
// Objects written before this layout are flat (`<assetId>.<ext>`). Reads fall
// back to that legacy shape — see `assetKeyCandidates` — so a deployment can
// roll forward before its backfill finishes.

/**
 * Prefixes the runtime owns. A user id must never collide with one, or that
 * user's objects would land in a namespace the read path treats as shared
 * scratch.
 */
export const RESERVED_KEY_PREFIXES = ["temp", "assets"] as const;

function isReservedKeyPrefix(
  value: string
): value is (typeof RESERVED_KEY_PREFIXES)[number] {
  return RESERVED_KEY_PREFIXES.some((prefix) => prefix === value);
}

/** Owner-prefixed key for an asset object. */
export function assetObjectKey(userId: string, fileName: string): string {
  if (!userId) throw new Error("userId is required for an asset storage key");
  if (userId.includes("/") || userId.includes("\\")) {
    throw new Error(`Invalid userId for a storage key: ${userId}`);
  }
  if (isReservedKeyPrefix(userId)) {
    throw new Error(
      `Invalid userId for a storage key: "${userId}" is a reserved prefix`
    );
  }
  return joinStorageKey(userId, fileName);
}

/**
 * Keys to try when reading, newest layout first. A caller reads the first one
 * that exists; a backfilled deployment always hits the first.
 */
export function assetKeyCandidates(
  userId: string,
  fileName: string
): [string, string] {
  return [assetObjectKey(userId, fileName), normalizeStorageKey(fileName)];
}

/** The owner encoded in a key, or null for a legacy flat key. */
export function assetKeyOwner(key: string): string | null {
  const normalized = normalizeStorageKey(key);
  const slash = normalized.indexOf("/");
  if (slash <= 0) return null;
  return normalized.slice(0, slash);
}
