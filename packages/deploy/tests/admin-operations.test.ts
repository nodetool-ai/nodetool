import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AdminDownloadManager,
  filterRepoFiles,
  getHFToken,
  streamOllamaModelPull,
  streamHFModelDownload,
  downloadHFModel,
  downloadOllamaModel,
  scanHFCache,
  deleteHFModel,
  calculateCacheSize,
  type HFHubAdapter,
  type HFRepoFile,
  type OllamaAdapter,
  type CacheInfo,
  type AdminProgressUpdate
} from "../src/admin-operations.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// We need to mock fs.existsSync for cache tests. Since ESM re-exports
// are non-configurable, we mock at the module level with a passthrough default.
let _existsSyncOverride: ((p: fs.PathLike) => boolean) | null = null;

vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof fs;
  return {
    ...actual,
    default: actual,
    existsSync: vi.fn((p: fs.PathLike) => {
      if (_existsSyncOverride) return _existsSyncOverride(p);
      return actual.existsSync(p);
    })
  };
});

// ── Mock factories ───────────────────────────────────────────

function createMockHub(overrides?: Partial<HFHubAdapter>): HFHubAdapter {
  return {
    listRepoFiles: vi.fn().mockResolvedValue([]),
    tryLoadFromCache: vi.fn().mockReturnValue(null),
    downloadFile: vi.fn().mockResolvedValue("/cache/path"),
    scanCache: vi.fn().mockReturnValue({
      size_on_disk: 0,
      repos: [],
      warnings: []
    } satisfies CacheInfo),
    deleteCachedModel: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function createMockOllama(
  chunks: Record<string, unknown>[] = []
): OllamaAdapter {
  return {
    async *pull(_modelName: string) {
      for (const c of chunks) {
        yield c;
      }
    }
  };
}

// ── collect helper ───────────────────────────────────────────

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

// ── filterRepoFiles ──────────────────────────────────────────

describe("filterRepoFiles", () => {
  const files: HFRepoFile[] = [
    { path: "model.safetensors", size: 1000 },
    { path: "config.json", size: 100 },
    { path: "README.md", size: 50 },
    { path: "tokenizer/vocab.txt", size: 200 },
    { path: "tokenizer/special_tokens.json", size: 30 }
  ];

  it("returns all files when no patterns specified", () => {
    expect(filterRepoFiles(files)).toEqual(files);
  });

  it("returns all files when patterns are null", () => {
    expect(filterRepoFiles(files, null, null)).toEqual(files);
  });

  it("returns all files when patterns are empty arrays", () => {
    expect(filterRepoFiles(files, [], [])).toEqual(files);
  });

  it("filters by allowPatterns with extension glob", () => {
    const result = filterRepoFiles(files, ["*.json"]);
    expect(result.map((f) => f.path)).toEqual(["config.json"]);
  });

  it("filters by allowPatterns with ** glob", () => {
    const result = filterRepoFiles(files, ["tokenizer/**"]);
    expect(result).toHaveLength(2);
  });

  it("filters by ignorePatterns", () => {
    const result = filterRepoFiles(files, null, ["*.md"]);
    expect(result.map((f) => f.path)).not.toContain("README.md");
    expect(result).toHaveLength(4);
  });

  it("applies both allow and ignore patterns", () => {
    const result = filterRepoFiles(files, ["*.json"], ["config.json"]);
    expect(result).toHaveLength(0);
  });

  it("allowPatterns with multiple patterns uses OR logic", () => {
    const result = filterRepoFiles(files, ["*.json", "*.md"]);
    expect(result).toHaveLength(2);
  });

  it("ignorePatterns with ** glob removes nested files", () => {
    const result = filterRepoFiles(files, null, ["tokenizer/**"]);
    expect(result).toHaveLength(3);
  });
});

// ── getHFToken ───────────────────────────────────────────────

describe("getHFToken", () => {
  const originalEnv = process.env["HF_TOKEN"];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["HF_TOKEN"] = originalEnv;
    } else {
      delete process.env["HF_TOKEN"];
    }
  });

  it("returns explicit token if provided", async () => {
    expect(await getHFToken({ token: "explicit" })).toBe("explicit");
  });

  it("returns env token when no explicit token", async () => {
    process.env["HF_TOKEN"] = "env-token";
    expect(await getHFToken()).toBe("env-token");
  });

  it("explicit token takes priority over env", async () => {
    process.env["HF_TOKEN"] = "env-token";
    expect(await getHFToken({ token: "explicit" })).toBe("explicit");
  });

  it("falls back to getSecret callback", async () => {
    delete process.env["HF_TOKEN"];
    const getSecret = vi.fn().mockResolvedValue("secret-token");
    const result = await getHFToken({
      userId: "u1",
      getSecret
    });
    expect(result).toBe("secret-token");
    expect(getSecret).toHaveBeenCalledWith("HF_TOKEN", "u1");
  });

  it("returns null when no token sources available", async () => {
    delete process.env["HF_TOKEN"];
    expect(await getHFToken()).toBeNull();
  });

  it("returns null when getSecret throws", async () => {
    delete process.env["HF_TOKEN"];
    const getSecret = vi.fn().mockRejectedValue(new Error("db error"));
    const result = await getHFToken({ userId: "u1", getSecret });
    expect(result).toBeNull();
  });

  it("skips getSecret when userId is missing", async () => {
    delete process.env["HF_TOKEN"];
    const getSecret = vi.fn().mockResolvedValue("token");
    const result = await getHFToken({ getSecret });
    expect(result).toBeNull();
    expect(getSecret).not.toHaveBeenCalled();
  });

  it("returns null when getSecret returns null", async () => {
    delete process.env["HF_TOKEN"];
    const getSecret = vi.fn().mockResolvedValue(null);
    const result = await getHFToken({ userId: "u1", getSecret });
    expect(result).toBeNull();
  });
});

// ── AdminDownloadManager ─────────────────────────────────────

describe("AdminDownloadManager", () => {
  let hub: HFHubAdapter;
  const originalEnv = process.env["HF_TOKEN"];

  beforeEach(() => {
    delete process.env["HF_TOKEN"];
    hub = createMockHub({
      listRepoFiles: vi.fn().mockResolvedValue([
        { path: "model.bin", size: 500 },
        { path: "config.json", size: 100 }
      ]),
      tryLoadFromCache: vi.fn().mockReturnValue(null),
      downloadFile: vi.fn().mockResolvedValue("/cache/downloaded")
    });
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["HF_TOKEN"] = originalEnv;
    } else {
      delete process.env["HF_TOKEN"];
    }
  });

  it("constructor sets token from options", () => {
    const mgr = new AdminDownloadManager({ hub, token: "tok" });
    expect(mgr.token).toBe("tok");
  });

  it("constructor defaults token to null", () => {
    const mgr = new AdminDownloadManager({ hub });
    expect(mgr.token).toBeNull();
  });

  it("static create resolves token", async () => {
    process.env["HF_TOKEN"] = "env-tok";
    const mgr = await AdminDownloadManager.create(hub);
    expect(mgr.token).toBe("env-tok");
  });

  it("downloadWithProgress yields starting status", async () => {
    const mgr = new AdminDownloadManager({ hub });
    const updates = await collect(
      mgr.downloadWithProgress({ repoId: "org/model" })
    );
    expect(updates[0].status).toBe("starting");
    expect(updates[0].repo_id).toBe("org/model");
  });

  it("downloadWithProgress yields progress for each file", async () => {
    const mgr = new AdminDownloadManager({ hub });
    const updates = await collect(
      mgr.downloadWithProgress({ repoId: "org/model" })
    );
    const progressUpdates = updates.filter((u) => u.status === "progress");
    // file list + per-file progress (downloading + downloaded) for 2 files
    expect(progressUpdates.length).toBeGreaterThanOrEqual(3);
  });

  it("downloadWithProgress yields completed status", async () => {
    const mgr = new AdminDownloadManager({ hub });
    const updates = await collect(
      mgr.downloadWithProgress({ repoId: "org/model" })
    );
    const last = updates[updates.length - 1];
    expect(last.status).toBe("completed");
  });

  it("downloadWithProgress handles single file download", async () => {
    const mgr = new AdminDownloadManager({ hub });
    const updates = await collect(
      mgr.downloadWithProgress({
        repoId: "org/model",
        filePath: "model.bin"
      })
    );
    expect(updates[0].status).toBe("starting");
    const completed = updates.find((u) => u.status === "completed");
    expect(completed).toBeDefined();
    expect(completed!.local_path).toBe("/cache/downloaded");
  });

  it("downloadWithProgress skips cached files", async () => {
    const hubWithCache = createMockHub({
      listRepoFiles: vi.fn().mockResolvedValue([
        { path: "model.bin", size: 500 },
        { path: "config.json", size: 100 }
      ]),
      tryLoadFromCache: vi.fn().mockImplementation((_repo, filePath) => {
        return filePath === "config.json" ? "/cache/config.json" : null;
      }),
      downloadFile: vi.fn().mockResolvedValue("/cache/downloaded")
    });
    // Override fs.existsSync for the cached file
    _existsSyncOverride = (p) => String(p) === "/cache/config.json";

    const mgr = new AdminDownloadManager({ hub: hubWithCache });
    const updates = await collect(
      mgr.downloadWithProgress({ repoId: "org/model" })
    );

    const foundMsg = updates.find((u) =>
      u.message?.includes("1 already cached")
    );
    expect(foundMsg).toBeDefined();
    // Only model.bin should be downloaded
    expect(hubWithCache.downloadFile).toHaveBeenCalledTimes(1);

    // Restore real behavior
    _existsSyncOverride = null;
  });

  it("downloadWithProgress yields error status on download failure", async () => {
    const failHub = createMockHub({
      listRepoFiles: vi
        .fn()
        .mockResolvedValue([{ path: "model.bin", size: 500 }]),
      downloadFile: vi.fn().mockRejectedValue(new Error("network error"))
    });
    const mgr = new AdminDownloadManager({ hub: failHub });
    const updates = await collect(
      mgr.downloadWithProgress({ repoId: "org/model" })
    );
    const errorUpdate = updates.find((u) =>
      u.message?.includes("Error downloading model.bin")
    );
    expect(errorUpdate).toBeDefined();
  });

  it("downloadWithProgress handles repo listing failure", async () => {
    const failHub = createMockHub({
      listRepoFiles: vi.fn().mockRejectedValue(new Error("repo not found"))
    });
    const mgr = new AdminDownloadManager({ hub: failHub });
    const updates = await collect(
      mgr.downloadWithProgress({ repoId: "org/missing" })
    );
    const errorUpdate = updates.find((u) => u.status === "error");
    expect(errorUpdate).toBeDefined();
    expect(errorUpdate!.error).toContain("repo not found");
  });

  it("downloadWithProgress reports all cached when nothing to download", async () => {
    const allCachedHub = createMockHub({
      listRepoFiles: vi
        .fn()
        .mockResolvedValue([{ path: "model.bin", size: 500 }]),
      tryLoadFromCache: vi.fn().mockReturnValue("/cache/model.bin")
    });
    _existsSyncOverride = () => true;

    const mgr = new AdminDownloadManager({ hub: allCachedHub });
    const updates = await collect(
      mgr.downloadWithProgress({ repoId: "org/model" })
    );
    const completed = updates.find((u) => u.status === "completed");
    expect(completed).toBeDefined();
    expect(completed!.message).toContain("already cached");

    _existsSyncOverride = null;
  });

  it("downloadWithProgress applies filter patterns", async () => {
    const mgr = new AdminDownloadManager({ hub });
    const updates = await collect(
      mgr.downloadWithProgress({
        repoId: "org/model",
        allowPatterns: ["*.bin"]
      })
    );
    // Should only try to download model.bin
    expect(hub.downloadFile).toHaveBeenCalledTimes(1);
  });

  it("downloadWithProgress lazy-inits token with userId", async () => {
    const getSecret = vi.fn().mockResolvedValue("lazy-token");
    const mgr = new AdminDownloadManager({ hub });
    await collect(
      mgr.downloadWithProgress({
        repoId: "org/model",
        userId: "u1",
        getSecret
      })
    );
    expect(mgr.token).toBe("lazy-token");
  });
});

// ── streamOllamaModelPull ────────────────────────────────────

describe("streamOllamaModelPull", () => {
  it("yields starting, chunks, and completed", async () => {
    const ollama = createMockOllama([
      { status: "pulling manifest" },
      { status: "downloading", completed: 50, total: 100 }
    ]);
    const updates = await collect(streamOllamaModelPull("llama3", ollama));
    expect(updates[0].status).toBe("starting");
    expect(updates[0].model).toBe("llama3");
    expect(updates[1]).toEqual({ status: "pulling manifest" });
    expect(updates[updates.length - 1].status).toBe("completed");
  });

  it("yields error on adapter failure", async () => {
    const ollama: OllamaAdapter = {
      async *pull() {
        throw new Error("connection refused");
      }
    };
    const updates = await collect(streamOllamaModelPull("bad-model", ollama));
    const errUpdate = updates.find((u) => u.status === "error");
    expect(errUpdate).toBeDefined();
    expect(errUpdate!.error).toContain("connection refused");
  });
});

// ── downloadHFModel ──────────────────────────────────────────

describe("downloadHFModel", () => {
  it("throws when repoId is empty", async () => {
    const hub = createMockHub();
    const gen = downloadHFModel(hub, { repoId: "" });
    await expect(gen.next()).rejects.toThrow("repoId is required");
  });

  it("streams all updates when stream=true", async () => {
    const hub = createMockHub({
      listRepoFiles: vi.fn().mockResolvedValue([{ path: "f.bin", size: 100 }]),
      downloadFile: vi.fn().mockResolvedValue("/p")
    });
    const updates = await collect(
      downloadHFModel(hub, { repoId: "org/m", stream: true })
    );
    expect(updates.length).toBeGreaterThan(1);
    expect(updates[0].status).toBe("starting");
  });

  it("yields only final update when stream=false", async () => {
    const hub = createMockHub({
      listRepoFiles: vi.fn().mockResolvedValue([{ path: "f.bin", size: 100 }]),
      downloadFile: vi.fn().mockResolvedValue("/p")
    });
    const updates = await collect(
      downloadHFModel(hub, { repoId: "org/m", stream: false })
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("completed");
  });
});

// ── downloadOllamaModel ──────────────────────────────────────

describe("downloadOllamaModel", () => {
  it("throws when modelName is empty", async () => {
    const ollama = createMockOllama();
    const gen = downloadOllamaModel(ollama, "");
    await expect(gen.next()).rejects.toThrow("modelName is required");
  });

  it("streams all updates when stream=true", async () => {
    const ollama = createMockOllama([{ status: "pulling" }]);
    const updates = await collect(downloadOllamaModel(ollama, "llama3", true));
    expect(updates[0].status).toBe("starting");
    expect(updates[updates.length - 1].status).toBe("completed");
  });

  it("yields only completion when stream=false", async () => {
    const ollama = createMockOllama([{ status: "pulling" }]);
    const updates = await collect(downloadOllamaModel(ollama, "llama3", false));
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe("completed");
  });

  it("yields error on failure in non-streaming mode", async () => {
    const ollama: OllamaAdapter = {
      async *pull() {
        throw new Error("pull failed");
      }
    };
    const updates = await collect(downloadOllamaModel(ollama, "bad", false));
    expect(updates[0].status).toBe("error");
    expect(updates[0].error).toContain("pull failed");
  });
});

// ── scanHFCache ──────────────────────────────────────────────

describe("scanHFCache", () => {
  it("yields completed with cache info", async () => {
    const cacheInfo: CacheInfo = {
      size_on_disk: 1024,
      repos: [],
      warnings: []
    };
    const hub = createMockHub({
      scanCache: vi.fn().mockReturnValue(cacheInfo)
    });
    const results = await collect(scanHFCache(hub));
    expect(results[0]).toEqual({ status: "completed", cache_info: cacheInfo });
  });

  it("yields error when scan fails", async () => {
    const hub = createMockHub({
      scanCache: vi.fn().mockImplementation(() => {
        throw new Error("scan error");
      })
    });
    const results = await collect(scanHFCache(hub));
    expect(results[0].status).toBe("error");
  });
});

// ── deleteHFModel ────────────────────────────────────────────

describe("deleteHFModel", () => {
  it("yields completed on success", async () => {
    const hub = createMockHub();
    const results = await collect(deleteHFModel(hub, "org/model"));
    expect(results[0]).toMatchObject({
      status: "completed",
      repo_id: "org/model"
    });
  });

  it("yields error on failure", async () => {
    const hub = createMockHub({
      deleteCachedModel: vi.fn().mockRejectedValue(new Error("delete failed"))
    });
    const results = await collect(deleteHFModel(hub, "org/model"));
    expect(results[0].status).toBe("error");
  });

  it("throws when repoId is empty", async () => {
    const hub = createMockHub();
    const gen = deleteHFModel(hub, "");
    await expect(gen.next()).rejects.toThrow("repoId is required");
  });
});

// ── calculateCacheSize ───────────────────────────────────────

describe("calculateCacheSize", () => {
  it("yields size info for existing directory", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-test-"));
    fs.writeFileSync(path.join(tmpDir, "file.bin"), "hello");
    try {
      const results = await collect(calculateCacheSize(tmpDir));
      expect(results[0]).toHaveProperty("success", true);
      expect(results[0]).toHaveProperty("total_size_bytes");
      expect(
        (results[0] as { total_size_bytes: number }).total_size_bytes
      ).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("yields zero size for non-existent directory", async () => {
    const results = await collect(
      calculateCacheSize("/nonexistent/path/xxxxx")
    );
    expect(results[0]).toHaveProperty("success", true);
    expect((results[0] as { total_size_bytes: number }).total_size_bytes).toBe(
      0
    );
  });

  it("calculates size recursively", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-test-"));
    const subDir = path.join(tmpDir, "sub");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(tmpDir, "a.bin"), "aaa");
    fs.writeFileSync(path.join(subDir, "b.bin"), "bbb");
    try {
      const results = await collect(calculateCacheSize(tmpDir));
      expect(
        (results[0] as { total_size_bytes: number }).total_size_bytes
      ).toBe(6);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("includes size_gb field", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-test-"));
    try {
      const results = await collect(calculateCacheSize(tmpDir));
      expect(results[0]).toHaveProperty("size_gb");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
