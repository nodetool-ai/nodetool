/**
 * HuggingFace download manager.
 *
 * Orchestrates downloading files from HuggingFace repositories with
 * progress tracking and cancellation support. Uses callback-based progress
 * reporting (no WebSocket dependency).
 *
 * Port of nodetool-core's `hf_download.py`, simplified for TypeScript.
 */

import { asyncHfDownload, hfRepoCacheDir } from "./hf-downloader.js";
import { downloadLlamaCppModel } from "./llama-cpp-download.js";
import { resolveHfToken } from "./hf-auth.js";

import * as fsp from "node:fs/promises";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DownloadUpdate {
  status: "idle" | "progress" | "start" | "error" | "completed" | "cancelled";
  repo_id: string;
  path: string | null;
  model_type: string | null;
  downloaded_bytes: number;
  total_bytes: number;
  downloaded_files: number;
  current_files: string[];
  total_files: number;
  error?: string;
}

export type ProgressCallback = (update: DownloadUpdate) => void;

export interface StartDownloadOptions {
  path?: string | null;
  allowPatterns?: string[] | null;
  ignorePatterns?: string[] | null;
  cacheDir?: string | null;
  modelType?: string | null;
  onProgress?: ProgressCallback;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Tracks the state of a single download operation. */
interface DownloadState {
  repoId: string;
  path: string | null;
  modelType: string | null;
  downloadedBytes: number;
  totalBytes: number;
  status: "idle" | "progress" | "start" | "error" | "completed" | "cancelled";
  downloadedFiles: string[];
  currentFiles: string[];
  totalFiles: number;
  errorMessage: string | null;
  abortController: AbortController;
  onProgress: ProgressCallback | undefined;
}

/** Represents a file entry from the HF API tree listing. */
interface HfTreeEntry {
  type: string;
  path: string;
  size?: number;
}

// ---------------------------------------------------------------------------
// Pattern matching helpers (fnmatch-style)
// ---------------------------------------------------------------------------

/**
 * Convert a simple glob pattern to a RegExp.
 * Supports `*` (any chars except `/`) and `**` (any chars including `/`).
 */
function globToRegex(pattern: string): RegExp {
  let re = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i += 2;
        if (pattern[i] === "/") {
          i++; // skip separator after **
        }
        continue;
      }
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
    i++;
  }
  return new RegExp(`^${re}$`);
}

function matchesAnyPattern(
  filepath: string,
  patterns: string[] | null | undefined
): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => globToRegex(p).test(filepath));
}

function filterFiles(
  files: HfTreeEntry[],
  allowPatterns?: string[] | null,
  ignorePatterns?: string[] | null
): HfTreeEntry[] {
  let result = files.filter((f) => f.type === "file");

  if (allowPatterns && allowPatterns.length > 0) {
    result = result.filter((f) => matchesAnyPattern(f.path, allowPatterns));
  }
  if (ignorePatterns && ignorePatterns.length > 0) {
    result = result.filter((f) => !matchesAnyPattern(f.path, ignorePatterns));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cache checking
// ---------------------------------------------------------------------------

/**
 * Check if a file already exists in the HF cache (snapshot directory).
 */
async function isFileCached(
  repoId: string,
  filePath: string,
  cacheDir?: string | null
): Promise<boolean> {
  const repoCache = hfRepoCacheDir(repoId, "model", cacheDir);
  const snapshotsDir = path.join(repoCache, "snapshots");

  try {
    const revisions = await fsp.readdir(snapshotsDir);
    for (const rev of revisions) {
      const candidate = path.join(snapshotsDir, rev, filePath);
      try {
        await fsp.access(candidate);
        return true;
      } catch {
        // not in this revision
      }
    }
  } catch {
    // snapshots dir doesn't exist
  }

  return false;
}

// ---------------------------------------------------------------------------
// DownloadManager
// ---------------------------------------------------------------------------

export class DownloadManager {
  private downloads: Map<string, DownloadState> = new Map();
  private token: string | null;

  constructor(token?: string) {
    this.token = token ?? null;
  }

  /**
   * Start downloading a HuggingFace repository (or a single file).
   *
   * @param repoId  The HuggingFace repository id (e.g. `"user/repo"`).
   * @param opts    Download options including path, patterns, progress callback.
   */
  async startDownload(
    repoId: string,
    opts: StartDownloadOptions = {}
  ): Promise<void> {
    const {
      path: filePath = null,
      allowPatterns = null,
      ignorePatterns = null,
      cacheDir = null,
      modelType = null,
      onProgress
    } = opts;

    const id = filePath ? `${repoId}/${filePath}` : repoId;

    // Reject if already running
    const existing = this.downloads.get(id);
    if (
      existing &&
      existing.status !== "completed" &&
      existing.status !== "error" &&
      existing.status !== "cancelled"
    ) {
      return;
    }

    const abortController = new AbortController();

    const state: DownloadState = {
      repoId,
      path: filePath,
      modelType,
      downloadedBytes: 0,
      totalBytes: 0,
      status: "start",
      downloadedFiles: [],
      currentFiles: [],
      totalFiles: 0,
      errorMessage: null,
      abortController,
      onProgress
    };
    this.downloads.set(id, state);

    const emitProgress = () => {
      onProgress?.({
        status: state.status,
        repo_id: state.repoId,
        path: state.path,
        model_type: state.modelType,
        downloaded_bytes: state.downloadedBytes,
        total_bytes: state.totalBytes,
        downloaded_files: state.downloadedFiles.length,
        current_files: [...state.currentFiles],
        total_files: state.totalFiles,
        ...(state.errorMessage ? { error: state.errorMessage } : {})
      });
    };

    try {
      // Resolve token
      const token = await resolveHfToken(this.token);

      // List remote files
      const apiUrl = `https://huggingface.co/api/models/${repoId}/tree/main?recursive=true`;
      const listHeaders: Record<string, string> = {};
      if (token) {
        listHeaders["Authorization"] = `Bearer ${token}`;
      }

      const listResp = await fetch(apiUrl, { headers: listHeaders });
      if (!listResp.ok) {
        throw new Error(
          `Failed to list files for ${repoId}: ${listResp.status} ${listResp.statusText}`
        );
      }
      const treeEntries: HfTreeEntry[] =
        (await listResp.json()) as HfTreeEntry[];

      // Filter
      let files = filterFiles(treeEntries, allowPatterns, ignorePatterns);

      // If a specific path was requested, narrow to just that file
      if (filePath) {
        files = files.filter((f) => f.path === filePath);
      }

      // Check cache -- separate cached from uncached
      const filesToDownload: HfTreeEntry[] = [];
      for (const file of files) {
        const cached = await isFileCached(repoId, file.path, cacheDir);
        if (cached) {
          state.downloadedFiles.push(file.path);
        } else {
          filesToDownload.push(file);
        }
      }

      state.totalFiles = filesToDownload.length;
      state.totalBytes = filesToDownload.reduce(
        (acc, f) => acc + (f.size ?? 0),
        0
      );
      state.status = "progress";
      emitProgress();

      // Download each file
      const downloadPromises = filesToDownload.map(async (file) => {
        if (abortController.signal.aborted) return;

        state.currentFiles.push(file.path);

        const onChunk = (delta: number, _total: number | null) => {
          state.downloadedBytes += delta;
          if (state.status === "idle" || state.status === "start") {
            state.status = "progress";
          }
          emitProgress();
        };

        if (modelType === "llama_cpp" || cacheDir != null) {
          await downloadLlamaCppModel(repoId, file.path, {
            token,
            progressCallback: onChunk,
            cancelSignal: abortController.signal
          });
        } else {
          await asyncHfDownload(repoId, file.path, {
            token,
            progressCallback: onChunk,
            cancelSignal: abortController.signal
          });
        }

        state.downloadedFiles.push(file.path);
        state.currentFiles = state.currentFiles.filter((f) => f !== file.path);
      });

      const results = await Promise.allSettled(downloadPromises);

      // Check for cancellation
      if (abortController.signal.aborted) {
        state.status = "cancelled";
        emitProgress();
        return;
      }

      // Check for errors
      const errors = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      );
      if (errors.length > 0) {
        const firstErr = errors[0].reason;
        state.status = "error";
        state.errorMessage =
          firstErr instanceof Error ? firstErr.message : String(firstErr);
        emitProgress();
        return;
      }

      state.status = "completed";
      emitProgress();
    } catch (err) {
      if (abortController.signal.aborted) {
        state.status = "cancelled";
      } else {
        state.status = "error";
        state.errorMessage = err instanceof Error ? err.message : String(err);
      }
      emitProgress();
    }
  }

  /**
   * Cancel an ongoing download.
   */
  cancelDownload(id: string): void {
    const state = this.downloads.get(id);
    if (!state) return;
    state.abortController.abort();
    state.status = "cancelled";
    state.onProgress?.({
      status: "cancelled",
      repo_id: state.repoId,
      path: state.path,
      model_type: state.modelType,
      downloaded_bytes: state.downloadedBytes,
      total_bytes: state.totalBytes,
      downloaded_files: state.downloadedFiles.length,
      current_files: [...state.currentFiles],
      total_files: state.totalFiles
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

const _managers = new Map<string, DownloadManager>();

/**
 * Get or create a singleton `DownloadManager` for the given user.
 */
export function getDownloadManager(userId?: string): DownloadManager {
  const key = userId ?? "__default__";
  let manager = _managers.get(key);
  if (!manager) {
    manager = new DownloadManager();
    _managers.set(key, manager);
  }
  return manager;
}
