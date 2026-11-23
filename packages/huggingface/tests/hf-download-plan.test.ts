import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { listFilesMock } = vi.hoisted(() => ({ listFilesMock: vi.fn() }));

vi.mock("@huggingface/hub", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@huggingface/hub")>()),
  listFiles: listFilesMock
}));

import { planHfDownload } from "../src/hf-download-manager.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("planHfDownload", () => {
  it("sizes only the files the download would fetch", async () => {
    listFilesMock.mockImplementation(async function* () {
      yield { type: "directory", path: "sub", size: 0 };
      yield { type: "file", path: "config.json", size: 10 };
      yield { type: "file", path: "model.safetensors", size: 1000 };
      // Redundant once safetensors are present.
      yield { type: "file", path: "pytorch_model.bin", size: 900 };
      // Always ignored framework export.
      yield { type: "file", path: "model.onnx", size: 800 };
      yield { type: "file", path: "tokenizer.json", size: 5 };
    });
    const cacheDir = mkdtempSync(join(tmpdir(), "hf-plan-"));
    dirs.push(cacheDir);
    const snapshot = join(cacheDir, "models--org--model", "snapshots", "abc");
    mkdirSync(snapshot, { recursive: true });
    writeFileSync(join(snapshot, "tokenizer.json"), "{}");

    const plan = await planHfDownload("org/model", { cacheDir });

    expect(plan.files).toEqual([
      { path: "config.json", size: 10 },
      { path: "model.safetensors", size: 1000 }
    ]);
    expect(plan.totalBytes).toBe(1010);
    expect(plan.cachedFiles).toEqual(["tokenizer.json"]);
  });

  it("narrows to one file when a path is given", async () => {
    listFilesMock.mockImplementation(async function* () {
      yield { type: "file", path: "a.gguf", size: 7 };
      yield { type: "file", path: "b.gguf", size: 9 };
    });

    const plan = await planHfDownload("org/model", {
      path: "b.gguf",
      cacheDir: join(tmpdir(), "hf-plan-missing-cache")
    });

    expect(plan).toEqual({
      files: [{ path: "b.gguf", size: 9 }],
      totalBytes: 9,
      cachedFiles: []
    });
  });
});
