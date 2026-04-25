import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isRepoCached,
  scanTransformersJsCache
} from "../src/cache-scan.js";

let root: string;

async function writeFile(p: string, contents = "x"): Promise<void> {
  await fs.mkdir(p.replace(/\/[^/]+$/, ""), { recursive: true });
  await fs.writeFile(p, contents);
}

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "tjs-cache-scan-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("scanTransformersJsCache", () => {
  it("returns empty array when cache dir is missing", async () => {
    const missing = join(root, "does-not-exist");
    expect(await scanTransformersJsCache(missing)).toEqual([]);
  });

  it("returns empty array when cache dir is empty", async () => {
    expect(await scanTransformersJsCache(root)).toEqual([]);
  });

  it("finds one entry per {org}/{repo} that contains files", async () => {
    await writeFile(join(root, "Xenova", "whisper-tiny.en", "config.json"), "{}");
    await writeFile(
      join(root, "Xenova", "whisper-tiny.en", "onnx", "model.onnx"),
      "binary"
    );
    await writeFile(
      join(root, "onnx-community", "Llama-3.2-1B-Instruct", "config.json"),
      "{}"
    );

    const found = await scanTransformersJsCache(root);
    const repoIds = found.map((m) => m.repo_id).sort();

    expect(repoIds).toEqual([
      "Xenova/whisper-tiny.en",
      "onnx-community/Llama-3.2-1B-Instruct"
    ]);
  });

  it("skips empty repo directories", async () => {
    await fs.mkdir(join(root, "Xenova", "empty-repo"), { recursive: true });
    expect(await scanTransformersJsCache(root)).toEqual([]);
  });

  it("computes total size including nested files", async () => {
    await writeFile(join(root, "Xenova", "tiny", "a.txt"), "12345"); // 5 bytes
    await writeFile(
      join(root, "Xenova", "tiny", "sub", "b.txt"),
      "0123456789"
    ); // 10 bytes

    const found = await scanTransformersJsCache(root);
    expect(found).toHaveLength(1);
    expect(found[0].size_bytes).toBe(15);
  });
});

describe("isRepoCached", () => {
  it("returns false when the repo dir is missing", async () => {
    expect(await isRepoCached(root, "Xenova/missing")).toBe(false);
  });

  it("returns true when the repo dir contains at least one file", async () => {
    await writeFile(join(root, "Xenova", "present", "config.json"), "{}");
    expect(await isRepoCached(root, "Xenova/present")).toBe(true);
  });

  it("returns false for an empty repo directory", async () => {
    await fs.mkdir(join(root, "Xenova", "empty"), { recursive: true });
    expect(await isRepoCached(root, "Xenova/empty")).toBe(false);
  });
});
