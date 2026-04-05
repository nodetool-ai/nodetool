import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { getDefaultHfCacheDir, HfFastCache } from "../src/hf-cache.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_KEYS = ["HF_HUB_CACHE", "HF_HOME", "XDG_CACHE_HOME"];
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

// ---------------------------------------------------------------------------
// getDefaultHfCacheDir
// ---------------------------------------------------------------------------

describe("getDefaultHfCacheDir", () => {
  it("returns default path when no env vars are set", () => {
    const dir = getDefaultHfCacheDir();
    expect(dir).toContain("huggingface");
    expect(dir).toContain("hub");
  });

  it("uses HF_HUB_CACHE when set", () => {
    process.env["HF_HUB_CACHE"] = "/custom/hf/cache";
    const dir = getDefaultHfCacheDir();
    expect(dir).toBe("/custom/hf/cache");
  });

  it("uses HF_HOME/hub when HF_HOME is set", () => {
    process.env["HF_HOME"] = "/custom/hf_home";
    const dir = getDefaultHfCacheDir();
    expect(dir).toBe(path.join("/custom/hf_home", "hub"));
  });

  it("prefers HF_HUB_CACHE over HF_HOME", () => {
    process.env["HF_HUB_CACHE"] = "/explicit/cache";
    process.env["HF_HOME"] = "/hf/home";
    const dir = getDefaultHfCacheDir();
    expect(dir).toBe("/explicit/cache");
  });

  it("expands leading ~ in HF_HUB_CACHE", () => {
    process.env["HF_HUB_CACHE"] = "~/my/cache";
    const dir = getDefaultHfCacheDir();
    expect(dir).toBe(path.join(os.homedir(), "my/cache"));
  });

  it("expands leading ~ in HF_HOME", () => {
    process.env["HF_HOME"] = "~/my_hf";
    const dir = getDefaultHfCacheDir();
    expect(dir).toBe(path.join(os.homedir(), "my_hf", "hub"));
  });
});

// ---------------------------------------------------------------------------
// HfFastCache — constructor and basic configuration
// ---------------------------------------------------------------------------

describe("HfFastCache", () => {
  it("uses provided cacheDir", () => {
    const cache = new HfFastCache("/tmp/test-cache");
    expect(cache.cacheDir).toBe("/tmp/test-cache");
  });

  it("falls back to getDefaultHfCacheDir when no cacheDir given", () => {
    const expected = getDefaultHfCacheDir();
    const cache = new HfFastCache();
    expect(cache.cacheDir).toBe(expected);
  });

  it("accepts null as cacheDir and uses default", () => {
    const expected = getDefaultHfCacheDir();
    const cache = new HfFastCache(null);
    expect(cache.cacheDir).toBe(expected);
  });

  // -----------------------------------------------------------------------
  // resolve / exists on a non-existent cache (should not throw)
  // -----------------------------------------------------------------------

  it("resolve returns null for missing repo", async () => {
    const cache = new HfFastCache("/nonexistent/hf-cache-test-dir");
    const result = await cache.resolve("org/model", "config.json");
    expect(result).toBeNull();
  });

  it("exists returns false for missing repo", async () => {
    const cache = new HfFastCache("/nonexistent/hf-cache-test-dir");
    const exists = await cache.exists("org/model", "config.json");
    expect(exists).toBe(false);
  });

  it("repoRoot returns null for missing cache", async () => {
    const cache = new HfFastCache("/nonexistent/hf-cache-test-dir");
    const root = await cache.repoRoot("org/model", "model");
    expect(root).toBeNull();
  });

  it("activeSnapshotDir returns null for missing cache", async () => {
    const cache = new HfFastCache("/nonexistent/hf-cache-test-dir");
    const snap = await cache.activeSnapshotDir("org/model", "model");
    expect(snap).toBeNull();
  });

  it("listFiles returns empty array for missing repo", async () => {
    const cache = new HfFastCache("/nonexistent/hf-cache-test-dir");
    const files = await cache.listFiles("org/model", "model");
    expect(files).toEqual([]);
  });

  it("discoverRepos returns empty array for missing cache dir", async () => {
    const cache = new HfFastCache("/nonexistent/hf-cache-test-dir");
    const repos = await cache.discoverRepos("model");
    expect(repos).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // invalidate does not throw
  // -----------------------------------------------------------------------

  it("invalidate does not throw for unknown repo", async () => {
    const cache = new HfFastCache("/nonexistent/hf-cache-test-dir");
    await expect(
      cache.invalidate("org/model", "model")
    ).resolves.toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Integration test with a minimal on-disk HF cache layout
  // -----------------------------------------------------------------------

  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hf-cache-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function buildFakeHfCache(
    cacheDir: string,
    repoId: string,
    commit: string,
    files: Record<string, string>
  ): Promise<string> {
    // HF cache layout:
    //   {cacheDir}/models--{org}--{repo}/refs/main
    //   {cacheDir}/models--{org}--{repo}/snapshots/{commit}/{...files}
    const safeName = `models--${repoId.replace("/", "--")}`;
    const repoDir = path.join(cacheDir, safeName);
    const refsDir = path.join(repoDir, "refs");
    const snapshotDir = path.join(repoDir, "snapshots", commit);

    await fs.mkdir(refsDir, { recursive: true });
    await fs.mkdir(snapshotDir, { recursive: true });
    await fs.writeFile(path.join(refsDir, "main"), commit);

    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(snapshotDir, filename);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content);
    }

    return repoDir;
  }

  it("discoverRepos finds repos in a fake cache", async () => {
    await buildFakeHfCache(tmpDir, "org/mymodel", "abc123", {
      "config.json": JSON.stringify({ model_type: "bert" })
    });

    const cache = new HfFastCache(tmpDir);
    const repos = await cache.discoverRepos("model");
    expect(repos.length).toBe(1);
    expect(repos[0].repoId).toBe("org/mymodel");
  });

  it("resolve returns correct path for an existing file", async () => {
    await buildFakeHfCache(tmpDir, "org/mymodel", "abc123", {
      "config.json": JSON.stringify({ model_type: "bert" })
    });

    const cache = new HfFastCache(tmpDir);
    const resolved = await cache.resolve("org/mymodel", "config.json");
    expect(resolved).not.toBeNull();
    expect(resolved!.endsWith("config.json")).toBe(true);
  });

  it("resolve returns null for a file that does not exist in snapshot", async () => {
    await buildFakeHfCache(tmpDir, "org/mymodel", "abc123", {
      "config.json": "{}"
    });

    const cache = new HfFastCache(tmpDir);
    const resolved = await cache.resolve("org/mymodel", "missing.safetensors");
    expect(resolved).toBeNull();
  });

  it("listFiles returns files in the snapshot", async () => {
    await buildFakeHfCache(tmpDir, "org/mymodel", "abc123", {
      "config.json": "{}",
      "model.safetensors": "fake-weights"
    });

    const cache = new HfFastCache(tmpDir);
    const files = await cache.listFiles("org/mymodel", "model");
    expect(files).toContain("config.json");
    expect(files).toContain("model.safetensors");
  });

  it("activeSnapshotDir returns the snapshot path", async () => {
    await buildFakeHfCache(tmpDir, "org/mymodel", "abc123", {
      "config.json": "{}"
    });

    const cache = new HfFastCache(tmpDir);
    const snap = await cache.activeSnapshotDir("org/mymodel", "model");
    expect(snap).not.toBeNull();
    expect(snap!).toContain("abc123");
  });
});
