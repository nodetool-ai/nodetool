/**
 * Download the ACE-Step GGUF models into the directory `ace-server --models`
 * reads. The files come from the Hugging Face repository in
 * `@nodetool-ai/config/acestep-models` through the shared downloader, so they
 * land once in the Hugging Face cache and resume after an interruption. The
 * models directory holds links to the cached files under their plain names,
 * which is the layout `ace-server` scans (it follows links, see
 * `registry_list_dir` in acestep.cpp `src/model-registry.h`).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { asyncHfDownload } from "@nodetool-ai/huggingface";
import {
  ACESTEP_DEFAULT_LM_SIZE,
  ACESTEP_MODELS_REPO,
  aceStepModelStatus,
  type AceStepLmSize,
  type AceStepModelRole,
} from "@nodetool-ai/config/acestep-models";

/** The models directory, the one `runtimeLocations().aceStepModels` names. */
export function aceStepModelsDir(dataDir: string): string {
  return path.join(dataDir, "acestep-models");
}

export interface AceStepModelProgress {
  role: AceStepModelRole;
  file: string;
  /** Position of the file in this download, from 1. */
  fileIndex: number;
  fileCount: number;
  /** Bytes received over all files of this download. */
  downloadedBytes: number;
  /** Bytes expected over all files, from the downloader's totals where it reported them. */
  totalBytes: number;
}

type Downloader = (
  repoId: string,
  filename: string,
  options: {
    progressCallback?: (deltaBytes: number, totalBytes: number | null) => void;
    cancelSignal?: AbortSignal;
  }
) => Promise<string>;

export interface AceStepModelDownloadOptions {
  modelsDir: string;
  /** The roles to fetch, such as `ACESTEP_FIRST_RUN_ROLES`. Files already present are skipped. */
  roles: readonly AceStepModelRole[];
  lmSize?: AceStepLmSize;
  signal?: AbortSignal;
  onProgress?: (progress: AceStepModelProgress) => void;
  /** Injected in tests. Defaults to the Hugging Face downloader. */
  download?: Downloader;
}

/**
 * Download the named roles. Returns the roles now present. A failed or
 * cancelled download throws and leaves the files already finished in place.
 */
export async function downloadAceStepModels(
  options: AceStepModelDownloadOptions
): Promise<AceStepModelRole[]> {
  const { modelsDir, signal, onProgress } = options;
  const lmSize = options.lmSize ?? ACESTEP_DEFAULT_LM_SIZE;
  const download: Downloader = options.download ?? asyncHfDownload;
  const status = await aceStepModelStatus(modelsDir, options.roles, lmSize);
  const todo = status.files.filter((entry) => !entry.present);
  await fs.mkdir(modelsDir, { recursive: true });

  const expected = new Map(todo.map((entry) => [entry.file, entry.approxBytes]));
  let finishedBytes = 0;
  for (const [index, entry] of todo.entries()) {
    signal?.throwIfAborted();
    let received = 0;
    const report = (): void => {
      onProgress?.({
        role: entry.role,
        file: entry.file,
        fileIndex: index + 1,
        fileCount: todo.length,
        downloadedBytes: finishedBytes + received,
        totalBytes: [...expected.values()].reduce((sum, bytes) => sum + bytes, 0),
      });
    };
    report();
    const cached = await download(ACESTEP_MODELS_REPO, entry.file, {
      cancelSignal: signal,
      progressCallback: (delta, total) => {
        received += delta;
        if (total !== null) {
          expected.set(entry.file, total);
        }
        report();
      },
    });
    await linkIntoModelsDir(cached, path.join(modelsDir, entry.file));
    const size = (await fs.stat(path.join(modelsDir, entry.file))).size;
    expected.set(entry.file, size);
    finishedBytes += size;
    received = 0;
    report();
  }
  return (await aceStepModelStatus(modelsDir, options.roles, lmSize)).present;
}

/**
 * Link `target` as `linkPath`. Where links are not allowed the file is copied,
 * which doubles its disk use but keeps the directory readable.
 */
async function linkIntoModelsDir(target: string, linkPath: string): Promise<void> {
  await fs.rm(linkPath, { force: true });
  try {
    await fs.symlink(await fs.realpath(target), linkPath);
  } catch {
    await fs.copyFile(target, linkPath);
  }
}
