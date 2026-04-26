/**
 * Scan the Transformers.js cache directory for downloaded models.
 *
 * Transformers.js stores files under a flat `{cacheDir}/{org}/{repo}/...`
 * layout (the same path it uses to fetch from `huggingface.co/{org}/{repo}/resolve/main/...`).
 * We treat any second-level directory containing at least one file as a
 * "downloaded model" — without parsing model metadata, this is the most
 * reliable signal.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";

export interface CachedTjsModel {
  repo_id: string;
  /** Absolute path to the model directory on disk. */
  dir: string;
  /** Total size of the cache directory in bytes. */
  size_bytes: number;
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function dirSize(p: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(p, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const child = join(p, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(child);
    } else if (entry.isFile()) {
      try {
        const s = await fs.stat(child);
        total += s.size;
      } catch {
        // ignore
      }
    }
  }
  return total;
}

async function dirHasAnyFile(p: string): Promise<boolean> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(p, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile()) return true;
    if (entry.isDirectory()) {
      if (await dirHasAnyFile(join(p, entry.name))) return true;
    }
  }
  return false;
}

/**
 * Scan `cacheDir` and return one entry per cached model repo.
 *
 * Returns an empty list if `cacheDir` does not exist (first-run case).
 * Never throws — IO errors collapse to "not cached".
 */
export async function scanTransformersJsCache(
  cacheDir: string
): Promise<CachedTjsModel[]> {
  if (!(await dirExists(cacheDir))) return [];

  const results: CachedTjsModel[] = [];
  let orgs: import("node:fs").Dirent[];
  try {
    orgs = await fs.readdir(cacheDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const orgEntry of orgs) {
    if (!orgEntry.isDirectory()) continue;
    const orgPath = join(cacheDir, orgEntry.name);
    let repos: import("node:fs").Dirent[];
    try {
      repos = await fs.readdir(orgPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const repoEntry of repos) {
      if (!repoEntry.isDirectory()) continue;
      const repoPath = join(orgPath, repoEntry.name);
      if (!(await dirHasAnyFile(repoPath))) continue;
      results.push({
        repo_id: `${orgEntry.name}/${repoEntry.name}`,
        dir: repoPath,
        size_bytes: await dirSize(repoPath)
      });
    }
  }

  return results;
}

/** Check whether a single repo is present in the cache (cheap, no recursion). */
export async function isRepoCached(
  cacheDir: string,
  repoId: string
): Promise<boolean> {
  return dirHasAnyFile(join(cacheDir, repoId));
}
