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
}

let cache: CatalogCache | null = null;
/** What downloads and generations in this process proved, applied over every read. */
const proven = new Map<string, Wan2GPFileStatus>();

function withProven(rows: Wan2GPCatalogRow[]): Wan2GPCatalogRow[] {
  for (const row of rows) {
    const status = proven.get(row.model_type);
    if (status) row.status = status;
  }
  return rows;
}

/**
 * Every model of the installed Wan2GP, read from the catalog the installer
 * wrote. An install without one, such as one made before the catalog
 * existed, writes it on the first call. Wan2GP's server does not start.
 */
export async function wan2gpCatalog(install: Wan2GPInstallStatus): Promise<Wan2GPCatalogRow[]> {
  const sourceDir = install.sourceDir;
  if (!sourceDir || !install.python) throw new Wan2GPError("Wan2GP is not installed.");
  const key = `${sourceDir}|${install.commit}`;
  let entry = cache;
  if (entry?.key !== key) {
    const created: CatalogCache = {
      key,
      sourceDir,
      rows: (async () => {
        const stored = await readWan2GPCatalog(sourceDir);
        if (stored) return stored;
        log.info("Writing the Wan2GP model catalog", { sourceDir });
        await writeWan2GPCatalog(install);
        const written = await readWan2GPCatalog(sourceDir);
        if (!written) throw new Wan2GPError("Wan2GP's model catalog could not be read after writing it.");
        return written;
      })()
    };
    created.rows.catch((error: unknown) => {
      log.warn("Could not read Wan2GP's model catalog", { error: String(error) });
      if (cache === created) cache = null;
    });
    cache = created;
    entry = created;
  }
  return withProven(await entry.rows);
}

/** Every model's file status. */
export async function wan2gpFileStatus(install: Wan2GPInstallStatus): Promise<Map<string, Wan2GPFileStatus>> {
  return new Map((await wan2gpCatalog(install)).map((row) => [row.model_type, row.status]));
}

/** Catalog writes, one after another, so none overwrites another's change. */
let catalogWrites: Promise<void> = Promise.resolve();

/** Resolves once the catalog on disk holds the status. A failed write is logged, never thrown. */
function record(modelType: string, status: Wan2GPFileStatus, sourceDir = cache?.sourceDir): Promise<void> {
  proven.set(modelType, status);
  if (!sourceDir) return catalogWrites;
  catalogWrites = catalogWrites
    .then(() => setWan2GPCatalogStatus(sourceDir, modelType, status))
    .catch((error: unknown) => {
      log.warn("Could not update Wan2GP's model catalog", { modelType, error: String(error) });
    });
  return catalogWrites;
}

/**
 * Record a model whose files a generation just proved present. Listings see
 * it at once. The returned promise resolves once the catalog on disk holds it.
 */
export function markWan2GPModelAvailable(modelType: string): Promise<void> {
  return record(modelType, "available");
}

/** Forget the cached catalog, so the next listing reads it again. */
export function resetWan2GPFileStatus(): void {
  cache = null;
  proven.clear();
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
  await record(modelType, final, install.sourceDir);
  return final;
}
