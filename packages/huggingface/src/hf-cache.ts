/**
 * Fast, revision-agnostic view over the local Hugging Face Hub cache.
 *
 * Provides `HfFastCache`, a read-only index on top of the on-disk hub layout
 * (e.g. `~/.cache/huggingface/hub`). It is optimized for local cache queries
 * and intentionally avoids:
 *
 *   - Importing `huggingface_hub` (no side effects).
 *   - Walking the entire cache tree just to answer per-repo questions.
 *   - Performing any HTTP calls.
 *
 * All methods are async and use `node:fs/promises`. No external dependencies.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Internal per-repo cached state. */
interface _RepoState {
  repoId: string;
  repoType: string; // "models" | "datasets" | "spaces"
  repoDir: string;
  commit: string | null;
  refsMtime: number | null;
  snapshotDir: string | null;
  snapshotMtime: number | null;
  snapshotFileCount: number | null;
  fileIndex: Map<string, string> | null; // relpath -> absolute path
}

// ---------------------------------------------------------------------------
// Default cache directory
// ---------------------------------------------------------------------------

/**
 * Return the default Hugging Face Hub cache directory.
 *
 * Resolution order:
 *   1. `$HF_HUB_CACHE`
 *   2. `$HF_HOME/hub`
 *   3. `~/.cache/huggingface/hub`
 */
export function getDefaultHfCacheDir(): string {
  const envCache = process.env["HF_HUB_CACHE"];
  if (envCache) {
    return envCache.startsWith("~")
      ? envCache.replace("~", os.homedir())
      : envCache;
  }

  const hfHome = process.env["HF_HOME"];
  if (hfHome) {
    const base = hfHome.startsWith("~")
      ? hfHome.replace("~", os.homedir())
      : hfHome;
    return path.join(base, "hub");
  }

  return path.join(os.homedir(), ".cache", "huggingface", "hub");
}

// ---------------------------------------------------------------------------
// HfFastCache
// ---------------------------------------------------------------------------

/**
 * Fast, read-only view over the local HF file cache (async).
 *
 * Key properties:
 *   - No full cache walk during normal operation.
 *   - For each repo, only the "current" snapshot is tracked, preferring refs/main.
 *   - Change detection uses mtime of refs/main and the active snapshot directory.
 *   - Lookups are direct path joins inside the active snapshot.
 */
export class HfFastCache {
  readonly cacheDir: string;
  private _repos: Map<string, _RepoState> = new Map();

  constructor(cacheDir?: string | null) {
    this.cacheDir = cacheDir ?? getDefaultHfCacheDir();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Resolve a repo-relative path into the local cache.
   *
   * Performs a constant-time join inside the active snapshot for the repo
   * (no directory walks) and checks whether the target exists.
   */
  async resolve(
    repoId: string,
    relpath: string,
    repoType?: string,
    followSymlinks = false
  ): Promise<string | null> {
    const state = await this._ensureRepoState(repoId, repoType);
    if (state == null || state.snapshotDir == null) return null;

    const rel = _normalizeRelpath(relpath);
    const candidate = path.join(state.snapshotDir, rel);

    try {
      const stat = await fs.lstat(candidate);
      const ok = stat.isFile() || stat.isSymbolicLink() || stat.isDirectory();
      if (!ok) return null;
    } catch {
      return null;
    }

    if (followSymlinks) {
      return await fs.realpath(candidate);
    }
    return candidate;
  }

  /**
   * Return whether a repo-relative path exists in the cache.
   */
  async exists(
    repoId: string,
    relpath: string,
    repoType?: string
  ): Promise<boolean> {
    return (await this.resolve(repoId, relpath, repoType)) != null;
  }

  /**
   * List files in the active snapshot for a repo.
   *
   * The first call walks only that repo's active snapshot directory and
   * builds a small in-memory index. Subsequent calls reuse the index
   * until a change in refs or snapshot mtime is detected.
   */
  async listFiles(repoId: string, repoType?: string): Promise<string[]> {
    const state = await this._ensureRepoState(repoId, repoType);
    if (state == null || state.snapshotDir == null) return [];
    if (!(await _exists(state.snapshotDir))) return [];

    if (state.fileIndex != null) {
      state.snapshotFileCount = state.fileIndex.size;
      return Array.from(state.fileIndex.keys());
    }

    const files = await _rglobFiles(state.snapshotDir);
    const index = new Map<string, string>();
    for (const f of files) {
      const rel = path.relative(state.snapshotDir, f).split(path.sep).join("/");
      index.set(rel, f);
    }
    state.fileIndex = index;
    state.snapshotFileCount = index.size;
    return Array.from(index.keys());
  }

  /**
   * Forget cached state for one repo or all repos.
   */
  async invalidate(repoId?: string | null, repoType?: string): Promise<void> {
    if (repoId == null) {
      this._repos.clear();
      return;
    }
    const keys = _candidateRepoKeys(repoId, repoType);
    for (const key of keys) {
      this._repos.delete(key);
    }
  }

  /**
   * Return the cache directory for a given repo, or `null` if not present.
   */
  async repoRoot(repoId: string, repoType?: string): Promise<string | null> {
    const state = await this._ensureRepoState(repoId, repoType, false);
    return state != null ? state.repoDir : null;
  }

  /**
   * Return the active snapshot directory for a given repo, or `null`.
   */
  async activeSnapshotDir(
    repoId: string,
    repoType?: string
  ): Promise<string | null> {
    const state = await this._ensureRepoState(repoId, repoType);
    return state?.snapshotDir ?? null;
  }

  /**
   * Discover cached Hugging Face repos by listing the cache directory.
   *
   * Lightweight: only lists directories without walking the entire tree.
   */
  async discoverRepos(
    repoType = "model"
  ): Promise<Array<{ repoId: string; repoDir: string }>> {
    if (!(await _exists(this.cacheDir))) return [];

    const typePrefix = repoType.endsWith("s") ? repoType : `${repoType}s`;
    const results: Array<{ repoId: string; repoDir: string }> = [];

    try {
      const entries = await fs.readdir(this.cacheDir);
      for (const name of entries) {
        const item = path.join(this.cacheDir, name);
        if (!(await _isDir(item))) continue;
        const prefix = `${typePrefix}--`;
        if (!name.startsWith(prefix)) continue;

        const rest = name.slice(prefix.length);
        const parts = rest.split("--");
        const repoId = parts.length > 1 ? parts.join("/") : parts[0];
        results.push({ repoId, repoDir: item });
      }
    } catch {
      return [];
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async _ensureRepoState(
    repoId: string,
    repoType?: string,
    createIfMissing = true
  ): Promise<_RepoState | null> {
    const keyCandidates = _candidateRepoKeys(repoId, repoType);

    // Check already-tracked repos
    for (const key of keyCandidates) {
      const state = this._repos.get(key);
      if (state != null) {
        if (!(await _exists(state.repoDir))) {
          this._repos.delete(key);
          continue;
        }
        await this._maybeRefreshState(state);
        return state;
      }
    }

    if (!createIfMissing) return null;

    // Try to discover on disk
    for (const key of keyCandidates) {
      const colonIdx = key.indexOf(":");
      const repoTypeNormalized = key.slice(0, colonIdx);
      const normRepoId = key.slice(colonIdx + 1);

      const repoDir = await _findRepoDir(
        this.cacheDir,
        normRepoId,
        repoTypeNormalized
      );
      if (repoDir == null) continue;

      const state: _RepoState = {
        repoId: normRepoId,
        repoType: repoTypeNormalized,
        repoDir,
        commit: null,
        refsMtime: null,
        snapshotDir: null,
        snapshotMtime: null,
        snapshotFileCount: null,
        fileIndex: null
      };
      await this._populateInitialState(state);
      this._repos.set(key, state);
      return state;
    }

    return null;
  }

  private async _maybeRefreshState(state: _RepoState): Promise<void> {
    const [refsMtimeNow, commitNow] = await _readCurrentRef(state.repoDir);
    const snapshotDirNow = await _snapshotDirForCommit(
      state.repoDir,
      commitNow
    );

    if (_changed(refsMtimeNow, state.refsMtime) || commitNow !== state.commit) {
      state.commit = commitNow;
      state.refsMtime = refsMtimeNow;
      state.snapshotDir = snapshotDirNow;
      state.snapshotMtime = await _mtimeOrNull(snapshotDirNow);
      state.fileIndex = null;
      state.snapshotFileCount = null;
      return;
    }

    const snapMtimeNow = await _mtimeOrNull(snapshotDirNow);
    const snapshotChanged = _changed(snapMtimeNow, state.snapshotMtime);
    if (snapshotChanged) {
      state.snapshotMtime = snapMtimeNow;
      state.fileIndex = null;
      state.snapshotFileCount = null;
    } else if (state.fileIndex != null && snapshotDirNow != null) {
      const currentCount = await _countFiles(snapshotDirNow);
      if (
        state.snapshotFileCount == null ||
        currentCount !== state.snapshotFileCount
      ) {
        state.fileIndex = null;
      }
      state.snapshotFileCount = currentCount;
    }

    if (
      state.commit == null &&
      (state.snapshotDir == null || !(await _exists(state.snapshotDir)))
    ) {
      state.snapshotDir = await _pickLatestSnapshot(state.repoDir);
      state.snapshotMtime = await _mtimeOrNull(state.snapshotDir);
      state.fileIndex = null;
      state.snapshotFileCount = null;
    }
  }

  private async _populateInitialState(state: _RepoState): Promise<void> {
    const [refsMtime, commit] = await _readCurrentRef(state.repoDir);
    state.commit = commit;
    state.refsMtime = refsMtime;

    if (commit) {
      state.snapshotDir = await _snapshotDirForCommit(state.repoDir, commit);
    } else {
      state.snapshotDir = await _pickLatestSnapshot(state.repoDir);
    }
    state.snapshotMtime = await _mtimeOrNull(state.snapshotDir);
  }
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

const KNOWN_TYPES = new Set([
  "model",
  "dataset",
  "space",
  "models",
  "datasets",
  "spaces"
]);

/** Normalize a repo type string to the internal plural form. */
export function _normalizeRepoType(
  repoType: string | undefined | null
): string | null {
  if (repoType == null) return null;
  const t = repoType.toLowerCase().trim();
  if (t === "model" || t === "models") return "models";
  if (t === "dataset" || t === "datasets") return "datasets";
  if (t === "space" || t === "spaces") return "spaces";
  throw new Error(`Unknown repo_type: ${repoType}`);
}

/** Normalize repo ID and type into a canonical pair. */
export function _normalizeRepoIdAndType(
  repoId: string,
  repoType: string | undefined | null
): [normalizedType: string | null, normalizedRepoId: string] {
  repoId = repoId.trim().replace(/^\/+|\/+$/g, "");
  const parts = repoId.split("/");
  let inferredType: string | null = null;

  if (parts.length > 0 && KNOWN_TYPES.has(parts[0])) {
    inferredType = _normalizeRepoType(parts[0]);
    repoId = parts.length > 1 ? parts.slice(1).join("/") : "";
  }

  const normType = repoType ? _normalizeRepoType(repoType) : inferredType;
  return [normType, repoId];
}

/** Return ordered cache keys to try for locating a repo. */
export function _candidateRepoKeys(
  repoId: string,
  repoType: string | undefined | null
): string[] {
  const [normType, normRepo] = _normalizeRepoIdAndType(repoId, repoType);
  const typesToTry = normType ? [normType] : ["models", "datasets", "spaces"];
  return typesToTry.map((t) => `${t}:${normRepo}`);
}

// ---------------------------------------------------------------------------
// Filesystem helpers (all async, no external deps)
// ---------------------------------------------------------------------------

async function _exists(p: string | null): Promise<boolean> {
  if (p == null) return false;
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function _isDir(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function _isFile(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

async function _mtimeOrNull(p: string | null): Promise<number | null> {
  if (p == null) return null;
  try {
    const st = await fs.stat(p);
    return st.mtimeMs;
  } catch {
    return null;
  }
}

async function _readFirstLine(filePath: string): Promise<string | null> {
  try {
    const txt = await fs.readFile(filePath, "utf-8");
    const line = txt.split("\n")[0]?.trim();
    return line || null;
  } catch {
    return null;
  }
}

function _normalizeRelpath(relpath: string): string {
  return relpath.replace(/\\/g, "/").replace(/^\/+/, "");
}

function _changed(now: number | null, old: number | null): boolean {
  if (now == null && old == null) return false;
  if (now == null || old == null) return true;
  return now !== old;
}

// ---------------------------------------------------------------------------
// Repo directory discovery
// ---------------------------------------------------------------------------

/** Translate a repo ID into an on-disk directory under the cache. */
export async function _findRepoDir(
  cacheDir: string,
  repoId: string,
  repoType: string
): Promise<string | null> {
  const repoBits = repoId.split("/").filter((b) => b.length > 0);
  if (repoBits.length === 0) return null;

  const dirName =
    repoBits.length === 1
      ? `${repoType}--${repoBits[0]}`
      : `${repoType}--${repoBits.join("--")}`;

  const candidate = path.join(cacheDir, dirName);
  if (await _isDir(candidate)) return candidate;
  return null;
}

// ---------------------------------------------------------------------------
// Refs / snapshots
// ---------------------------------------------------------------------------

/** Return the mtime and commit hash for the preferred ref. */
export async function _readCurrentRef(
  repoDir: string
): Promise<[mtime: number | null, commit: string | null]> {
  const refsDir = path.join(repoDir, "refs");
  if (!(await _exists(refsDir))) return [null, null];

  const mainRef = path.join(refsDir, "main");
  if (await _exists(mainRef)) {
    return [await _mtimeOrNull(mainRef), await _readFirstLine(mainRef)];
  }

  // Fall back to newest ref file
  let newestMtime: number | null = null;
  let newestCommit: string | null = null;
  try {
    const entries = await fs.readdir(refsDir);
    for (const name of entries) {
      const file = path.join(refsDir, name);
      if (!(await _isFile(file))) continue;
      const mt = await _mtimeOrNull(file);
      if (newestMtime == null || (mt != null && mt > newestMtime)) {
        newestMtime = mt;
        newestCommit = await _readFirstLine(file);
      }
    }
  } catch {
    return [null, null];
  }

  return [newestMtime ?? (await _mtimeOrNull(refsDir)), newestCommit];
}

/** Return the snapshot directory for a given commit hash. */
export async function _snapshotDirForCommit(
  repoDir: string,
  commit: string | null
): Promise<string | null> {
  if (!commit) return null;
  const snapshot = path.join(repoDir, "snapshots", commit.trim());
  return (await _exists(snapshot)) ? snapshot : null;
}

/** Return the newest snapshot directory for a repo by mtime. */
export async function _pickLatestSnapshot(
  repoDir: string
): Promise<string | null> {
  const snapshotsDir = path.join(repoDir, "snapshots");
  if (!(await _exists(snapshotsDir))) return null;

  let newestPath: string | null = null;
  let newestMtime: number | null = null;

  try {
    const entries = await fs.readdir(snapshotsDir);
    for (const name of entries) {
      const p = path.join(snapshotsDir, name);
      if (!(await _isDir(p))) continue;
      const mt = await _mtimeOrNull(p);
      if (newestMtime == null || (mt != null && mt > newestMtime)) {
        newestMtime = mt;
        newestPath = p;
      }
    }
  } catch {
    return null;
  }

  return newestPath;
}

// ---------------------------------------------------------------------------
// Recursive file walking
// ---------------------------------------------------------------------------

async function _rglobFiles(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dirPath: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dirPath);
    } catch {
      return;
    }

    for (const name of entries) {
      const full = path.join(dirPath, name);
      try {
        const st = await fs.lstat(full);
        if (st.isDirectory()) {
          await walk(full);
        } else if (st.isFile() || st.isSymbolicLink()) {
          results.push(full);
        }
      } catch {
        continue;
      }
    }
  }

  await walk(root);
  return results;
}

async function _countFiles(root: string): Promise<number> {
  let count = 0;

  async function walk(dirPath: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs.readdir(dirPath);
    } catch {
      return;
    }

    for (const name of entries) {
      const full = path.join(dirPath, name);
      try {
        const st = await fs.lstat(full);
        if (st.isDirectory()) {
          await walk(full);
        } else if (st.isFile() || st.isSymbolicLink()) {
          count++;
        }
      } catch {
        continue;
      }
    }
  }

  await walk(root);
  return count;
}
