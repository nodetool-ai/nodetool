import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ACESTEP_ADD_INSTRUMENT_ROLES,
  ACESTEP_FIRST_RUN_ROLES,
  aceStepModelFile,
  aceStepModelFiles,
  aceStepModelStatus
} from "../src/acestep-models.js";

const dirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "acestep-models-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("ACE-Step model manifest", () => {
  it("names the first-run files of models.sh at Q8 with the 4B language model", () => {
    expect(aceStepModelFiles(ACESTEP_FIRST_RUN_ROLES).map((f) => f.file)).toEqual([
      "Qwen3-Embedding-0.6B-Q8_0.gguf",
      "acestep-5Hz-lm-4B-Q8_0.gguf",
      "acestep-v15-turbo-Q8_0.gguf",
      "vae-BF16.gguf"
    ]);
  });

  it("sums the first-run set to about 7.7 GB", () => {
    const bytes = aceStepModelFiles(ACESTEP_FIRST_RUN_ROLES).reduce((sum, f) => sum + f.approxBytes, 0);
    expect(bytes / 1e9).toBeCloseTo(7.7, 1);
  });

  it("puts the base DiT in the Add instrument set and follows the language model size", () => {
    expect(aceStepModelFiles(ACESTEP_ADD_INSTRUMENT_ROLES).map((f) => f.file)).toEqual([
      "acestep-v15-base-Q8_0.gguf"
    ]);
    expect(aceStepModelFile("languageModel", "1.7B").file).toBe("acestep-5Hz-lm-1.7B-Q8_0.gguf");
  });
});

describe("aceStepModelStatus", () => {
  it("reports every role missing in an empty or absent directory", async () => {
    const dir = await tempDir();
    for (const target of [dir, join(dir, "absent")]) {
      const status = await aceStepModelStatus(target, ACESTEP_FIRST_RUN_ROLES);
      expect(status.present).toEqual([]);
      expect(status.missing).toEqual([...ACESTEP_FIRST_RUN_ROLES]);
    }
  });

  it("separates present from missing roles, counting links and ignoring empty files", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "vae-BF16.gguf"), "weights");
    await writeFile(join(dir, "blob"), "weights");
    await symlink(join(dir, "blob"), join(dir, "acestep-v15-turbo-Q8_0.gguf"));
    await writeFile(join(dir, "Qwen3-Embedding-0.6B-Q8_0.gguf"), "");
    await symlink(join(dir, "gone"), join(dir, "acestep-5Hz-lm-4B-Q8_0.gguf"));
    const status = await aceStepModelStatus(dir, ACESTEP_FIRST_RUN_ROLES);
    expect(status.present).toEqual(["ditTurbo", "vae"]);
    expect(status.missing).toEqual(["textEncoder", "languageModel"]);
  });

  it("checks the base DiT apart from the first-run set", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "acestep-v15-base-Q8_0.gguf"), "weights");
    expect((await aceStepModelStatus(dir, ACESTEP_ADD_INSTRUMENT_ROLES)).present).toEqual(["ditBase"]);
    expect((await aceStepModelStatus(dir, ACESTEP_FIRST_RUN_ROLES)).present).toEqual([]);
  });
});
