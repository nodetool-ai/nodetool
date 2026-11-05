/**
 * Models of the Wan2GP the Package Manager installed: the catalog the model
 * menus list, which models have their weights on disk, and downloading a
 * model's weights.
 *
 * Wan2GP's MCP server downloads a model's files only as part of a generation.
 * NodeTool's helper (`wan2gp-helper.ts` in the config package) runs in
 * Wan2GP's own environment instead, with Wan2GP's own API and downloader, so
 * the files land where Wan2GP looks for them (`ckpts/`).
 */
import {
  createLogger,
  readWan2GPCatalog,
  runWan2GPHelper,
  setWan2GPCatalogStatus,
  writeWan2GPCatalog,
  wan2gpCatalogKey as catalogKey,
  wan2gpSourceIdentity as sourceIdentity,
  type Wan2GPCatalogRow,
  type Wan2GPFileStatus,
  type Wan2GPInstallStatus
} from "@nodetool-ai/config";
import { Wan2GPError } from "./wan2gp-client.js";

export type { Wan2GPFileStatus } from "@nodetool-ai/config";

const log = createLogger("nodetool.runtime.providers.wan2gp-models");

export interface Wan2GPDownloadProgress {
  downloadedBytes: number;
  /** The size of the files that were missing, from Hugging Face. 0 when unknown. */
  totalBytes: number;
  currentFiles: string[];
}

interface CatalogCache {
  key: string;
  sourceDir: string;
  rows: Promise<Wan2GPCatalogRow[]>;
  proven: Map<string, Wan2GPFileStatus>;
}

let cache: CatalogCache | null = null;

/**
 * Every model of the installed Wan2GP, read from the catalog the installer
 * wrote. An install without one, such as one made before the catalog
 * existed, writes it on the first call. Wan2GP's server does not start.
 */
export async function wan2gpCatalog(install: Wan2GPInstallStatus): Promise<Wan2GPCatalogRow[]> {
  const entry = await catalogEntry(install);
  return (await entry.rows).map((row) => ({ ...row, status: entry.proven.get(row.model_type) ?? row.status }));
}

async function catalogEntry(install: Wan2GPInstallStatus, signal?: AbortSignal): Promise<CatalogCache> {
  await waitForCatalog(catalogWrites, signal);
  const sourceDir = install.sourceDir;
  if (!sourceDir || !install.python) throw new Wan2GPError("Wan2GP is not installed.");
  const identity = await sourceIdentity(sourceDir);
  const key = await catalogKey(sourceDir, identity);
  let entry = cache;
  if (entry?.key !== key) {
    let readKey = key;
    const created: CatalogCache = {
      key,
      sourceDir,
      proven: new Map(),
      rows: (async () => {
        let rows = await readWan2GPCatalog(sourceDir);
        if (!rows) {
          log.info("Writing the Wan2GP model catalog", { sourceDir });
          await writeWan2GPCatalog(install, signal);
          readKey = await catalogKey(sourceDir, identity);
          rows = await readWan2GPCatalog(sourceDir);
          if (!rows) throw new Wan2GPError("Wan2GP's model catalog could not be read after writing it.");
        }
        if (
          await sourceIdentity(sourceDir) !== identity ||
          await catalogKey(sourceDir, identity) !== readKey
        ) {
          throw new Wan2GPError("Wan2GP's installation changed while reading its models. Try again.");
        }
        return rows;
      })()
    };
    created.rows = created.rows.then((rows) => {
      created.key = readKey;
      return rows;
    });
    created.rows.catch((error: unknown) => {
      log.warn("Could not read Wan2GP's model catalog", { error: String(error) });
      if (cache === created) cache = null;
    });
    cache = created;
    entry = created;
  }
  await waitForCatalog(entry.rows, signal);
  return entry;
}

function waitForCatalog<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    pending.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener("abort", abort); reject(error); }
    );
  });
}

/** Every model's file status. */
export async function wan2gpFileStatus(install: Wan2GPInstallStatus): Promise<Map<string, Wan2GPFileStatus>> {
  return new Map((await wan2gpCatalog(install)).map((row) => [row.model_type, row.status]));
}

/** Catalog writes, one after another, so none overwrites another's change. */
let catalogWrites: Promise<void> = Promise.resolve();

/** Resolves once the catalog on disk holds the status. A failed write is logged, never thrown. */
function record(modelType: string, status: Wan2GPFileStatus, entry: CatalogCache | null): Promise<void> {
  if (!entry) return catalogWrites;
  entry.proven.set(modelType, status);
  catalogWrites = catalogWrites
    .then(async () => {
      // A download or generation may finish after uninstall or repair.
      // Its proof belongs to the source it started with.
      await setWan2GPCatalogStatus(entry.sourceDir, modelType, status, entry.key);
      // Another process may have recorded other models while this operation
      // ran. Reload their rows along with this result on the next listing.
      if (cache === entry) cache = null;
    })
    .catch((error: unknown) => {
      log.warn("Could not update Wan2GP's model catalog", { modelType, error: String(error) });
    });
  return catalogWrites;
}

/** Capture the install before a generation, so a late result cannot mark its replacement. */
export async function captureWan2GPModelAvailability(
  install: Wan2GPInstallStatus | null,
  signal?: AbortSignal
): Promise<(modelType: string) => Promise<void>> {
  const entry = install ? await catalogEntry(install, signal) : null;
  return (modelType) => record(modelType, "available", entry);
}

/** Record a model whose files a generation just proved present. */
export function markWan2GPModelAvailable(modelType: string): Promise<void> {
  return record(modelType, "available", cache);
}

/** Forget the cached catalog, so the next listing reads it again. */
export function resetWan2GPFileStatus(): void {
  cache = null;
}

/**
 * Download one model's files with Wan2GP's own downloader. Resolves with the
 * model's status afterwards, which is `available` when every file is on disk.
 */
export async function downloadWan2GPModel(
  install: Wan2GPInstallStatus,
  modelType: string,
  options: { signal?: AbortSignal; onProgress?: (progress: Wan2GPDownloadProgress) => void } = {}
): Promise<Wan2GPFileStatus> {
  const entry = await catalogEntry(install, options.signal);
  let final: Wan2GPFileStatus = "missing";
  let totalBytes = 0;
  try {
    await runWan2GPHelper(
      install,
      ["prepare", modelType],
      (line) => {
        if (line.type === "total") {
          totalBytes = line.total_bytes;
        } else if (line.type === "progress") {
          // Wan2GP also fetches small files the estimate leaves out. Past the
          // estimate the size is unknown rather than a bar stuck at 100%.
          options.onProgress?.({
            downloadedBytes: line.downloaded_bytes,
            totalBytes: line.downloaded_bytes <= totalBytes ? totalBytes : 0,
            currentFiles: line.current_files
          });
        } else if (line.type === "done" && (line.status === "available" || line.status === "partial")) {
          final = line.status;
        }
      },
      options.signal
    );
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Wan2GPError(error instanceof Error ? error.message : String(error));
  }
  await record(modelType, final, entry);
  return final;
}
