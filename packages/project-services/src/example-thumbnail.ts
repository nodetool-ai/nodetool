/**
 * Cache-buster for example workflow thumbnail JPGs.
 *
 * Each thumbnail's md5 (first 8 hex chars) is appended to its
 * `thumbnail_url` as `?v=<hash>` so that browsers drop their cached copy
 * whenever the JPG is regenerated. Hashes are cached by `(absPath, mtimeMs)`
 * — re-hashed only when the file is replaced on disk.
 */

import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

interface CacheEntry {
  mtimeMs: number;
  hash: string;
}

const cache = new Map<string, CacheEntry>();

/**
 * Return the 8-char md5 of `absPath`'s contents, or `null` if the file is
 * missing / unreadable. The result is memoised by `(path, mtime)` so the
 * read+hash happens once per file per process (and once again whenever the
 * file is regenerated).
 */
export function thumbnailHash(absPath: string): string | null {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(absPath);
  } catch {
    return null;
  }
  const cached = cache.get(absPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.hash;
  let hash: string;
  try {
    hash = createHash("md5")
      .update(readFileSync(absPath))
      .digest("hex")
      .slice(0, 8);
  } catch {
    return null;
  }
  cache.set(absPath, { mtimeMs: stat.mtimeMs, hash });
  return hash;
}

/**
 * Append `?v=<md5-8>` to a thumbnail URL, or return the URL unchanged if
 * the file isn't readable.
 */
export function withCacheBuster(url: string, absPath: string): string {
  const hash = thumbnailHash(absPath);
  return hash ? `${url}?v=${hash}` : url;
}
