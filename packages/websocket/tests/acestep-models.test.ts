import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ACESTEP_FIRST_RUN_ROLES, ACESTEP_ADD_INSTRUMENT_ROLES, ACESTEP_MODELS_REPO } from "@nodetool-ai/config/acestep-models";
import { downloadAceStepModels, type AceStepModelProgress } from "../src/acestep-models.js";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "acestep-dl-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A downloader that writes into a cache directory and reports progress in two steps. */
function fakeDownloader(cache: string) {
  return vi.fn(async (
    _repo: string,
    file: string,
    options: { progressCallback?: (delta: number, total: number | null) => void }
  ) => {
    options.progressCallback?.(3, 6);
    options.progressCallback?.(3, 6);
    const target = join(cache, file);
    await writeFile(target, `weights of ${file}`);
    return target;
  });
}

describe("downloadAceStepModels", () => {
  it("downloads the missing roles from the repository and links them under their plain names", async () => {
    const root = await tempDir();
    const modelsDir = join(root, "models");
    const download = fakeDownloader(await tempDir());
    const progress: AceStepModelProgress[] = [];
    const present = await downloadAceStepModels({
      modelsDir, roles: ACESTEP_FIRST_RUN_ROLES, download, onProgress: (p) => progress.push(p)
    });
    expect(present).toEqual([...ACESTEP_FIRST_RUN_ROLES]);
    expect(download.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [ACESTEP_MODELS_REPO, "Qwen3-Embedding-0.6B-Q8_0.gguf"],
      [ACESTEP_MODELS_REPO, "acestep-5Hz-lm-4B-Q8_0.gguf"],
      [ACESTEP_MODELS_REPO, "acestep-v15-turbo-Q8_0.gguf"],
      [ACESTEP_MODELS_REPO, "vae-BF16.gguf"]
    ]);
    expect(await readFile(join(modelsDir, "vae-BF16.gguf"), "utf8")).toBe("weights of vae-BF16.gguf");
    expect(progress[0]).toMatchObject({ fileIndex: 1, fileCount: 4, downloadedBytes: 0 });
    expect(progress.at(-1)).toMatchObject({ fileIndex: 4, fileCount: 4 });
    expect(progress.at(-1)!.downloadedBytes).toBe(progress.at(-1)!.totalBytes);
    const received = progress.map((p) => p.downloadedBytes);
    expect(received).toEqual([...received].sort((a, b) => a - b));
  });

  it("skips files that are present and downloads only the named subset", async () => {
    const root = await tempDir();
    const modelsDir = join(root, "models");
    const download = fakeDownloader(await tempDir());
    await downloadAceStepModels({ modelsDir, roles: ACESTEP_FIRST_RUN_ROLES, download });
    download.mockClear();
    await downloadAceStepModels({ modelsDir, roles: [...ACESTEP_FIRST_RUN_ROLES, ...ACESTEP_ADD_INSTRUMENT_ROLES], download });
    expect(download.mock.calls.map((c) => c[1])).toEqual(["acestep-v15-base-Q8_0.gguf"]);
  });

  it("stops on an aborted signal and keeps the files already finished", async () => {
    const root = await tempDir();
    const modelsDir = join(root, "models");
    const controller = new AbortController();
    const cache = await tempDir();
    const download = vi.fn(async (_repo: string, file: string) => {
      const target = join(cache, file);
      await writeFile(target, "x");
      controller.abort();
      return target;
    });
    await expect(downloadAceStepModels({
      modelsDir, roles: ACESTEP_FIRST_RUN_ROLES, download, signal: controller.signal
    })).rejects.toThrow();
    expect(download).toHaveBeenCalledTimes(1);
    expect(await readFile(join(modelsDir, "Qwen3-Embedding-0.6B-Q8_0.gguf"), "utf8")).toBe("x");
  });
});
