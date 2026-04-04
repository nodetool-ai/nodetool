/**
 * Admin Operations Module
 *
 * Provides shared admin operations for model management including:
 * - Hugging Face model downloads (with streaming progress)
 * - Ollama model downloads (with streaming progress)
 * - Cache management and scanning
 * - Model deletion
 *
 * This is a TypeScript port of the Python admin_operations module.
 * Platform-specific integrations (huggingface_hub, ollama client) are
 * abstracted behind injectable interfaces so callers can provide their
 * own implementations.
 */

import * as path from "path";
import * as fs from "fs";

// ── Types ──────────────────────────────────────────────────

/** Progress update yielded during download operations. */
export interface AdminProgressUpdate {
  status: "starting" | "progress" | "completed" | "error";
  repo_id?: string;
  model?: string;
  message?: string;
  error?: string;
  current_file?: string;
  file_progress?: number;
  total_files?: number;
  downloaded_files?: number;
  downloaded_size?: number;
  total_size?: number;
  cached_files?: number;
  local_path?: string;
  error_file?: string;
  [key: string]: unknown;
}

/** Serialisable representation of a cached file. */
export interface CacheFileInfo {
  file_name: string;
  size_on_disk: number;
  file_path: string;
  blob_path: string;
}

/** Serialisable representation of a cached revision. */
export interface CacheRevisionInfo {
  commit_hash: string;
  size_on_disk: number;
  snapshot_path: string;
  files: CacheFileInfo[];
}

/** Serialisable representation of a cached repository. */
export interface CacheRepoInfo {
  repo_id: string;
  repo_type: string;
  repo_path: string;
  size_on_disk: number;
  nb_files: number;
  revisions: CacheRevisionInfo[];
}

/** Serialisable representation of the full HuggingFace cache. */
export interface CacheInfo {
  size_on_disk: number;
  repos: CacheRepoInfo[];
  warnings: string[];
}

// ── Injectable interfaces ──────────────────────────────────

/**
 * Minimal file info returned by the HuggingFace repo tree listing.
 */
export interface HFRepoFile {
  path: string;
  size: number;
}

/**
 * Abstraction over HuggingFace Hub operations so callers can inject
 * their own implementation (or a mock for testing).
 */
export interface HFHubAdapter {
  /** List files in a repository (recursive). */
  listRepoFiles(repoId: string, token?: string): Promise<HFRepoFile[]>;

  /**
   * Check if a file is already present in cache.
   * Returns the local cache path if found, or null.
   */
  tryLoadFromCache(repoId: string, filePath: string): string | null;

  /** Download a single file and return its local path. */
  downloadFile(
    repoId: string,
    filePath: string,
    cacheDir: string,
    token?: string
  ): Promise<string>;

  /** Scan the local HF cache directory and return structured info. */
  scanCache(cacheDir?: string): CacheInfo;

  /** Delete a cached model by repo ID. */
  deleteCachedModel(repoId: string): Promise<void>;
}

/**
 * Filter function matching Python's `filter_repo_paths`.
 * A simple glob-ish filter: allow_patterns keeps only matches,
 * ignore_patterns removes matches.
 */
export function filterRepoFiles(
  files: HFRepoFile[],
  allowPatterns?: string[] | null,
  ignorePatterns?: string[] | null
): HFRepoFile[] {
  let result = files;

  if (allowPatterns && allowPatterns.length > 0) {
    result = result.filter((f) =>
      allowPatterns.some((pat) => matchGlob(pat, f.path))
    );
  }

  if (ignorePatterns && ignorePatterns.length > 0) {
    result = result.filter(
      (f) => !ignorePatterns.some((pat) => matchGlob(pat, f.path))
    );
  }

  return result;
}

/** Minimal glob matcher supporting * and ** wildcards. */
function matchGlob(pattern: string, value: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*");
  return new RegExp(`^${regex}$`).test(value);
}

/**
 * Abstraction over the Ollama client.
 */
export interface OllamaAdapter {
  /**
   * Pull a model with streaming progress.
   * Each yielded object should have at least a `status` field.
   */
  pull(modelName: string): AsyncGenerator<Record<string, unknown>>;
}

// ── Token resolution ───────────────────────────────────────

/**
 * Resolve an HF token.
 *
 * Priority:
 * 1. Explicit token passed in
 * 2. HF_TOKEN environment variable
 * 3. getSecret callback (e.g. database lookup)
 */
export async function getHFToken(options?: {
  token?: string;
  userId?: string;
  getSecret?: (key: string, userId: string) => Promise<string | null>;
}): Promise<string | null> {
  if (options?.token) return options.token;

  const envToken = process.env["HF_TOKEN"];
  if (envToken) {
    console.debug("getHFToken: found HF_TOKEN in environment");
    return envToken;
  }

  if (options?.userId && options?.getSecret) {
    try {
      const dbToken = await options.getSecret("HF_TOKEN", options.userId);
      if (dbToken) {
        console.debug(
          `getHFToken: found HF_TOKEN in secrets for userId=${options.userId}`
        );
        return dbToken;
      }
    } catch (err) {
      console.debug(`getHFToken: failed to get HF_TOKEN from secrets: ${err}`);
    }
  }

  console.debug("getHFToken: no HF_TOKEN found");
  return null;
}

// ── AdminDownloadManager ───────────────────────────────────

export interface AdminDownloadManagerOptions {
  token?: string;
  hub?: HFHubAdapter;
}

/**
 * Download manager for admin operations that yields progress updates.
 */
export class AdminDownloadManager {
  token: string | null;
  hub: HFHubAdapter;
  private tokenInitialized: boolean;

  constructor(options: AdminDownloadManagerOptions & { hub: HFHubAdapter }) {
    this.token = options.token ?? null;
    this.hub = options.hub;
    this.tokenInitialized = options.token != null;

    if (this.token) {
      console.debug(
        `AdminDownloadManager initialized with HF_TOKEN (${this.token.length} chars)`
      );
    } else {
      console.debug("AdminDownloadManager initialized without HF_TOKEN");
    }
  }

  /**
   * Factory that resolves the token asynchronously before construction.
   */
  static async create(
    hub: HFHubAdapter,
    options?: {
      userId?: string;
      getSecret?: (key: string, userId: string) => Promise<string | null>;
    }
  ): Promise<AdminDownloadManager> {
    const token = await getHFToken({
      userId: options?.userId,
      getSecret: options?.getSecret
    });
    return new AdminDownloadManager({
      token: token ?? undefined,
      hub
    });
  }

  /**
   * Download a HuggingFace model with detailed progress updates.
   */
  async *downloadWithProgress(options: {
    repoId: string;
    cacheDir?: string;
    filePath?: string;
    ignorePatterns?: string[] | null;
    allowPatterns?: string[] | null;
    userId?: string;
    getSecret?: (key: string, userId: string) => Promise<string | null>;
  }): AsyncGenerator<AdminProgressUpdate> {
    const {
      repoId,
      cacheDir = "/app/.cache/huggingface/hub",
      filePath,
      ignorePatterns,
      allowPatterns,
      userId
    } = options;

    // Lazy token init
    if (!this.tokenInitialized && userId) {
      this.token = await getHFToken({
        userId,
        getSecret: options.getSecret
      });
      this.tokenInitialized = true;
    }

    try {
      console.info(`Starting HF model download: ${repoId}`);

      yield {
        status: "starting",
        repo_id: repoId,
        message: `Starting download of ${repoId}`
      };

      // Single file download
      if (filePath) {
        yield {
          status: "progress",
          repo_id: repoId,
          message: `Downloading single file: ${filePath}`,
          current_file: filePath
        };

        const localPath = await this.hub.downloadFile(
          repoId,
          filePath,
          cacheDir,
          this.token ?? undefined
        );

        yield {
          status: "completed",
          repo_id: repoId,
          local_path: localPath,
          message: `Successfully downloaded ${repoId}/${filePath}`
        };
        return;
      }

      // Repository download
      yield {
        status: "progress",
        repo_id: repoId,
        message: "Fetching file list..."
      };

      let files = await this.hub.listRepoFiles(repoId, this.token ?? undefined);
      files = filterRepoFiles(files, allowPatterns, ignorePatterns);

      // Partition into cached vs. uncached
      const filesToDownload: HFRepoFile[] = [];
      const cachedPaths: string[] = [];

      for (const file of files) {
        const cachePath = this.hub.tryLoadFromCache(repoId, file.path);
        if (cachePath && fs.existsSync(cachePath)) {
          cachedPaths.push(file.path);
        } else {
          filesToDownload.push(file);
        }
      }

      const totalFiles = filesToDownload.length;
      const totalSize = filesToDownload.reduce((s, f) => s + (f.size ?? 0), 0);

      yield {
        status: "progress",
        repo_id: repoId,
        message: `Found ${totalFiles} files to download, ${cachedPaths.length} already cached`,
        total_files: totalFiles,
        total_size: totalSize,
        cached_files: cachedPaths.length
      };

      if (totalFiles === 0) {
        yield {
          status: "completed",
          repo_id: repoId,
          message: `All files already cached for ${repoId}`,
          total_files: 0,
          cached_files: cachedPaths.length
        };
        return;
      }

      // Download each file
      const downloadedFiles: string[] = [];
      let downloadedSize = 0;

      for (let i = 0; i < filesToDownload.length; i++) {
        const file = filesToDownload[i];

        yield {
          status: "progress",
          repo_id: repoId,
          message: `Downloading ${file.path}`,
          current_file: file.path,
          file_progress: i + 1,
          total_files: totalFiles,
          downloaded_size: downloadedSize,
          total_size: totalSize
        };

        try {
          await this.hub.downloadFile(
            repoId,
            file.path,
            cacheDir,
            this.token ?? undefined
          );
          downloadedFiles.push(file.path);
          downloadedSize += file.size ?? 0;

          yield {
            status: "progress",
            repo_id: repoId,
            message: `Downloaded ${file.path}`,
            current_file: file.path,
            file_progress: i + 1,
            total_files: totalFiles,
            downloaded_files: downloadedFiles.length,
            downloaded_size: downloadedSize,
            total_size: totalSize
          };
        } catch (err) {
          console.error(`Error downloading file ${file.path}: ${err}`);
          yield {
            status: "progress",
            repo_id: repoId,
            message: `Error downloading ${file.path}: ${err}`,
            current_file: file.path,
            error_file: file.path
          };
        }
      }

      yield {
        status: "completed",
        repo_id: repoId,
        message: `Successfully downloaded ${downloadedFiles.length}/${totalFiles} files for ${repoId}`,
        downloaded_files: downloadedFiles.length,
        total_files: totalFiles,
        total_size: totalSize,
        downloaded_size: downloadedSize
      };
    } catch (err) {
      console.error(`Error in HF model download ${repoId}: ${err}`);
      yield {
        status: "error",
        repo_id: repoId,
        error: String(err),
        message: `Error downloading ${repoId}: ${err}`
      };
    }
  }
}

// ── Standalone streaming functions ─────────────────────────

/**
 * Stream Ollama model download progress.
 */
export async function* streamOllamaModelPull(
  modelName: string,
  ollama: OllamaAdapter
): AsyncGenerator<AdminProgressUpdate> {
  try {
    console.info(`Starting Ollama model pull: ${modelName}`);

    yield {
      status: "starting",
      model: modelName,
      message: `Starting download of ${modelName}`
    };

    for await (const chunk of ollama.pull(modelName)) {
      yield chunk as AdminProgressUpdate;
    }

    yield {
      status: "completed",
      model: modelName,
      message: `Successfully downloaded ${modelName}`
    };
  } catch (err) {
    console.error(`Error pulling Ollama model ${modelName}: ${err}`);
    yield {
      status: "error",
      model: modelName,
      error: String(err)
    };
  }
}

/**
 * Stream HuggingFace model download progress using AdminDownloadManager.
 */
export async function* streamHFModelDownload(
  hub: HFHubAdapter,
  options: {
    repoId: string;
    cacheDir?: string;
    filePath?: string;
    ignorePatterns?: string[] | null;
    allowPatterns?: string[] | null;
    userId?: string;
    getSecret?: (key: string, userId: string) => Promise<string | null>;
  }
): AsyncGenerator<AdminProgressUpdate> {
  const manager = await AdminDownloadManager.create(hub, {
    userId: options.userId,
    getSecret: options.getSecret
  });
  yield* manager.downloadWithProgress(options);
}

/**
 * Download HuggingFace model with optional streaming.
 * When `stream` is false, only the final progress update is yielded.
 */
export async function* downloadHFModel(
  hub: HFHubAdapter,
  options: {
    repoId: string;
    cacheDir?: string;
    filePath?: string;
    ignorePatterns?: string[] | null;
    allowPatterns?: string[] | null;
    stream?: boolean;
    userId?: string;
    getSecret?: (key: string, userId: string) => Promise<string | null>;
  }
): AsyncGenerator<AdminProgressUpdate> {
  const { repoId, stream = true } = options;

  if (!repoId) {
    throw new Error("repoId is required for HuggingFace download");
  }

  if (stream) {
    yield* streamHFModelDownload(hub, options);
  } else {
    const manager = await AdminDownloadManager.create(hub, {
      userId: options.userId,
      getSecret: options.getSecret
    });
    let finalResult: AdminProgressUpdate | null = null;
    for await (const update of manager.downloadWithProgress(options)) {
      finalResult = update;
    }
    if (finalResult) {
      yield finalResult;
    }
  }
}

/**
 * Download Ollama model with optional streaming.
 */
export async function* downloadOllamaModel(
  ollama: OllamaAdapter,
  modelName: string,
  stream: boolean = true
): AsyncGenerator<AdminProgressUpdate> {
  if (!modelName) {
    throw new Error("modelName is required for Ollama download");
  }

  if (stream) {
    yield* streamOllamaModelPull(modelName, ollama);
  } else {
    try {
      // For non-streaming, consume the full stream but only yield completion
      for await (const _chunk of ollama.pull(modelName)) {
        // consume stream
      }
      yield {
        status: "completed",
        model: modelName,
        message: `Successfully downloaded ${modelName}`
      };
    } catch (err) {
      console.error(`Error downloading Ollama model ${modelName}: ${err}`);
      yield {
        status: "error",
        model: modelName,
        error: String(err)
      };
    }
  }
}

/**
 * Scan HuggingFace cache directory.
 */
export async function* scanHFCache(
  hub: HFHubAdapter,
  cacheDir?: string
): AsyncGenerator<Record<string, unknown>> {
  try {
    const cacheInfo = hub.scanCache(cacheDir);
    yield { status: "completed", cache_info: cacheInfo };
  } catch (err) {
    console.error(`Error scanning cache: ${err}`);
    yield { status: "error", error: String(err) };
  }
}

/**
 * Delete a HuggingFace model from cache.
 */
export async function* deleteHFModel(
  hub: HFHubAdapter,
  repoId: string
): AsyncGenerator<Record<string, unknown>> {
  if (!repoId) {
    throw new Error("repoId is required for HuggingFace model deletion");
  }

  try {
    await hub.deleteCachedModel(repoId);
    yield {
      status: "completed",
      repo_id: repoId,
      message: `Successfully deleted ${repoId}`
    };
  } catch (err) {
    console.error(`Error deleting HF model ${repoId}: ${err}`);
    yield { status: "error", repo_id: repoId, error: String(err) };
  }
}

// ── Cache size calculation ─────────────────────────────────

/**
 * Recursively calculate total size of files in a directory.
 */
function calculateCacheSizeSync(cacheDir: string): {
  totalSize: number;
  error: string | null;
} {
  let totalSize = 0;
  let error: string | null = null;

  try {
    if (fs.existsSync(cacheDir)) {
      const walk = (dir: string): void => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile()) {
            try {
              const stat = fs.statSync(fullPath);
              totalSize += stat.size;
            } catch {
              // Skip files we can't stat
            }
          }
        }
      };
      walk(cacheDir);
    }
  } catch (err) {
    error = String(err);
  }

  return { totalSize, error };
}

/**
 * Calculate total cache size, yielding a single result.
 */
export async function* calculateCacheSize(
  cacheDir: string = "/app/.cache/huggingface/hub"
): AsyncGenerator<Record<string, unknown>> {
  try {
    const { totalSize, error } = calculateCacheSizeSync(cacheDir);

    if (error) {
      yield { status: "error", cache_dir: cacheDir, error };
      return;
    }

    const sizeGb = totalSize / 1024 ** 3;
    yield {
      success: true,
      cache_dir: cacheDir,
      total_size_bytes: totalSize,
      size_gb: Math.round(sizeGb * 100) / 100
    };
  } catch (err) {
    console.error(`Error calculating cache size: ${err}`);
    yield { status: "error", cache_dir: cacheDir, error: String(err) };
  }
}
