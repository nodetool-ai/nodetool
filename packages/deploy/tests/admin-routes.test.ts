import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HttpError,
  encodeSSE,
  SSE_HEADERS,
  handleDownloadHuggingfaceModel,
  handleDownloadOllamaModel,
  handleScanCache,
  handleGetCacheSize,
  handleDeleteHuggingfaceModel,
  handleDbSave,
  handleDbGet,
  handleDbDelete,
  handleCreateCollection,
  handleListCollections,
  handleGetCollection,
  handleUpdateCollection,
  handleDeleteCollection,
  handleAddToCollection,
  handleListAssets,
  handleCreateAsset,
  handleGetAsset,
  handleDeleteAsset,
  type AdminDeps,
  type CollectionHandle,
  type AssetRecord
} from "../src/admin-routes.js";
import type { HFHubAdapter, CacheInfo } from "../src/admin-operations.js";

// ── Helpers ──────────────────────────────────────────────────

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

function mockCollection(
  name: string,
  metadata: Record<string, unknown> | null = null,
  countVal = 0
): CollectionHandle {
  return {
    name,
    metadata,
    count: vi.fn().mockResolvedValue(countVal),
    modify: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined)
  };
}

function mockAssetRecord(overrides?: Partial<AssetRecord>): AssetRecord {
  return {
    id: "a1",
    user_id: "1",
    workflow_id: null,
    parent_id: null,
    name: "test.txt",
    content_type: "text/plain",
    size: 100,
    metadata: {},
    created_at: "2024-01-01T00:00:00Z",
    file_name: "a1.txt",
    thumb_file_name: "a1_thumb.jpg",
    has_thumbnail: false,
    duration: null,
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function createMockDeps(overrides?: Partial<AdminDeps>): AdminDeps {
  return {
    hub: {
      listRepoFiles: vi.fn().mockResolvedValue([]),
      tryLoadFromCache: vi.fn().mockReturnValue(null),
      downloadFile: vi.fn().mockResolvedValue("/cache/path"),
      scanCache: vi.fn().mockReturnValue({
        size_on_disk: 0,
        repos: [],
        warnings: []
      } satisfies CacheInfo),
      deleteCachedModel: vi.fn().mockResolvedValue(undefined)
    } satisfies HFHubAdapter,
    ollama: {
      async *pull(_modelName: string) {
        yield { status: "done" };
      }
    },
    getDbAdapter: vi.fn().mockResolvedValue({
      get: vi.fn().mockResolvedValue({ id: "k1", data: "val" }),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    }),
    vecStore: {
      createCollection: vi.fn().mockResolvedValue(mockCollection("new-col")),
      listCollections: vi.fn().mockResolvedValue([]),
      getCollection: vi.fn().mockResolvedValue(mockCollection("test-col")),
      deleteCollection: vi.fn().mockResolvedValue(undefined)
    },
    assetModel: {
      get: vi.fn().mockResolvedValue(mockAssetRecord()),
      find: vi.fn().mockResolvedValue(mockAssetRecord()),
      create: vi.fn().mockResolvedValue(mockAssetRecord()),
      paginate: vi.fn().mockResolvedValue([[], null])
    },
    assetStorage: {
      getUrl: vi.fn().mockResolvedValue("https://storage.example.com/file"),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    workflowModel: {
      get: vi.fn().mockResolvedValue({ name: "My Workflow" })
    },
    ...overrides
  };
}

// ── HttpError ────────────────────────────────────────────────

describe("HttpError", () => {
  it("has statusCode and message", () => {
    const err = new HttpError(404, "Not found");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.name).toBe("HttpError");
  });

  it("is an instance of Error", () => {
    const err = new HttpError(500, "fail");
    expect(err).toBeInstanceOf(Error);
  });
});

// ── encodeSSE ────────────────────────────────────────────────

describe("encodeSSE", () => {
  it("encodes objects as data: lines with DONE", async () => {
    async function* source() {
      yield { a: 1 };
      yield { b: 2 };
    }
    const lines = await collect(encodeSSE(source()));
    expect(lines[0]).toBe('data: {"a":1}\n\n');
    expect(lines[1]).toBe('data: {"b":2}\n\n');
    expect(lines[2]).toBe("data: [DONE]\n\n");
  });

  it("encodes error from source as error event", async () => {
    async function* source(): AsyncGenerator<Record<string, unknown>> {
      throw new Error("boom");
    }
    const lines = await collect(encodeSSE(source()));
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0].replace("data: ", "").trim());
    expect(parsed.status).toBe("error");
    expect(parsed.error).toContain("boom");
  });

  it("handles empty source", async () => {
    async function* source(): AsyncGenerator<Record<string, unknown>> {
      // empty
    }
    const lines = await collect(encodeSSE(source()));
    expect(lines).toEqual(["data: [DONE]\n\n"]);
  });
});

// ── SSE_HEADERS ──────────────────────────────────────────────

describe("SSE_HEADERS", () => {
  it("has correct Content-Type", () => {
    expect(SSE_HEADERS["Content-Type"]).toBe("text/event-stream");
  });

  it("has Cache-Control no-cache", () => {
    expect(SSE_HEADERS["Cache-Control"]).toBe("no-cache");
  });

  it("has CORS headers", () => {
    expect(SSE_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
  });
});

// ── handleDownloadHuggingfaceModel ───────────────────────────

describe("handleDownloadHuggingfaceModel", () => {
  it("throws HttpError 400 when repo_id is missing", async () => {
    const deps = createMockDeps();
    const gen = handleDownloadHuggingfaceModel(deps, { repo_id: "" });
    await expect(gen.next()).rejects.toThrow(HttpError);
    try {
      await gen.next();
    } catch (e) {
      if (e instanceof HttpError) {
        expect(e.statusCode).toBe(400);
      }
    }
  });

  it("yields SSE lines for valid download", async () => {
    const deps = createMockDeps({
      hub: {
        listRepoFiles: vi
          .fn()
          .mockResolvedValue([{ path: "m.bin", size: 100 }]),
        tryLoadFromCache: vi.fn().mockReturnValue(null),
        downloadFile: vi.fn().mockResolvedValue("/p"),
        scanCache: vi
          .fn()
          .mockReturnValue({ size_on_disk: 0, repos: [], warnings: [] }),
        deleteCachedModel: vi.fn()
      }
    });
    const lines = await collect(
      handleDownloadHuggingfaceModel(deps, { repo_id: "org/model" })
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/^data: /);
    expect(lines[lines.length - 1]).toBe("data: [DONE]\n\n");
  });
});

// ── handleDownloadOllamaModel ────────────────────────────────

describe("handleDownloadOllamaModel", () => {
  it("throws HttpError 400 when model_name is missing", async () => {
    const deps = createMockDeps();
    const gen = handleDownloadOllamaModel(deps, { model_name: "" });
    await expect(gen.next()).rejects.toThrow(HttpError);
  });

  it("throws HttpError 500 when ollama is not configured", async () => {
    const deps = createMockDeps({ ollama: undefined });
    const gen = handleDownloadOllamaModel(deps, { model_name: "llama3" });
    await expect(gen.next()).rejects.toThrow(HttpError);
  });

  it("yields SSE lines for valid download", async () => {
    const deps = createMockDeps();
    const lines = await collect(
      handleDownloadOllamaModel(deps, { model_name: "llama3" })
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[lines.length - 1]).toBe("data: [DONE]\n\n");
  });
});

// ── handleScanCache ──────────────────────────────────────────

describe("handleScanCache", () => {
  it("returns cache info from hub", async () => {
    const deps = createMockDeps();
    const result = await handleScanCache(deps);
    expect(result.status).toBe("completed");
    expect(result).toHaveProperty("cache_info");
  });

  it("returns error when scan fails", async () => {
    const deps = createMockDeps({
      hub: {
        listRepoFiles: vi.fn(),
        tryLoadFromCache: vi.fn(),
        downloadFile: vi.fn(),
        scanCache: () => {
          throw new Error("scan fail");
        },
        deleteCachedModel: vi.fn()
      }
    });
    const result = await handleScanCache(deps);
    expect(result.status).toBe("error");
  });
});

// ── handleGetCacheSize ───────────────────────────────────────

describe("handleGetCacheSize", () => {
  it("returns size info", async () => {
    const result = await handleGetCacheSize("/nonexistent/test");
    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("total_size_bytes", 0);
  });
});

// ── handleDeleteHuggingfaceModel ─────────────────────────────

describe("handleDeleteHuggingfaceModel", () => {
  it("returns completed on success", async () => {
    const deps = createMockDeps();
    const result = await handleDeleteHuggingfaceModel(deps, "org/model");
    expect(result.status).toBe("completed");
  });

  it("returns error on failure", async () => {
    const deps = createMockDeps({
      hub: {
        listRepoFiles: vi.fn(),
        tryLoadFromCache: vi.fn(),
        downloadFile: vi.fn(),
        scanCache: vi.fn(),
        deleteCachedModel: vi.fn().mockRejectedValue(new Error("fail"))
      }
    });
    const result = await handleDeleteHuggingfaceModel(deps, "org/model");
    expect(result.status).toBe("error");
  });
});

// ── Database handlers ────────────────────────────────────────

describe("handleDbSave", () => {
  it("saves item and returns ok", async () => {
    const deps = createMockDeps();
    const result = await handleDbSave(deps, "users", { id: "k1" });
    expect(result).toEqual({ status: "ok" });
    expect(deps.getDbAdapter).toHaveBeenCalledWith("users");
  });
});

describe("handleDbGet", () => {
  it("returns item when found", async () => {
    const deps = createMockDeps();
    const result = await handleDbGet(deps, "users", "k1");
    expect(result).toEqual({ id: "k1", data: "val" });
  });

  it("throws HttpError 404 when not found", async () => {
    const deps = createMockDeps({
      getDbAdapter: vi.fn().mockResolvedValue({
        get: vi.fn().mockResolvedValue(null),
        save: vi.fn(),
        delete: vi.fn()
      })
    });
    await expect(handleDbGet(deps, "users", "missing")).rejects.toThrow(
      HttpError
    );
  });
});

describe("handleDbDelete", () => {
  it("deletes item and returns ok", async () => {
    const deps = createMockDeps();
    const result = await handleDbDelete(deps, "users", "k1");
    expect(result).toEqual({ status: "ok" });
  });
});

// ── Collection handlers ──────────────────────────────────────

describe("handleCreateCollection", () => {
  it("creates collection and returns response", async () => {
    const deps = createMockDeps();
    const result = await handleCreateCollection(deps, {
      name: "my-col",
      embedding_model: "all-MiniLM-L6-v2"
    });
    expect(result.name).toBe("new-col");
    expect(result.count).toBe(0);
    expect(deps.vecStore.createCollection).toHaveBeenCalledWith({
      name: "my-col",
      metadata: { embedding_model: "all-MiniLM-L6-v2" }
    });
  });
});

describe("handleListCollections", () => {
  it("returns empty list when no collections", async () => {
    const deps = createMockDeps();
    const result = await handleListCollections(deps);
    expect(result.collections).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("returns collections with counts and workflow names", async () => {
    const col = mockCollection("col1", { workflow: "wf1" }, 5);
    const deps = createMockDeps({
      vecStore: {
        ...createMockDeps().vecStore,
        listCollections: vi.fn().mockResolvedValue([col])
      }
    });
    const result = await handleListCollections(deps);
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].count).toBe(5);
    expect(result.collections[0].workflow_name).toBe("My Workflow");
  });

  it("handles collection without workflow metadata", async () => {
    const col = mockCollection("col1", null, 3);
    const deps = createMockDeps({
      vecStore: {
        ...createMockDeps().vecStore,
        listCollections: vi.fn().mockResolvedValue([col])
      }
    });
    const result = await handleListCollections(deps);
    expect(result.collections[0].workflow_name).toBeNull();
  });
});

describe("handleGetCollection", () => {
  it("returns collection with count", async () => {
    const col = mockCollection("test-col", { key: "val" }, 10);
    const deps = createMockDeps({
      vecStore: {
        ...createMockDeps().vecStore,
        getCollection: vi.fn().mockResolvedValue(col)
      }
    });
    const result = await handleGetCollection(deps, "test-col");
    expect(result.name).toBe("test-col");
    expect(result.count).toBe(10);
    expect(result.metadata).toEqual({ key: "val" });
  });
});

describe("handleUpdateCollection", () => {
  it("modifies collection and returns updated data", async () => {
    const col = mockCollection("old-name", { existing: "meta" }, 5);
    const deps = createMockDeps({
      vecStore: {
        ...createMockDeps().vecStore,
        getCollection: vi.fn().mockResolvedValue(col)
      }
    });
    const result = await handleUpdateCollection(deps, "old-name", {
      name: "new-name",
      metadata: { added: "data" }
    });
    expect(col.modify).toHaveBeenCalledWith({
      name: "new-name",
      metadata: { existing: "meta", added: "data" }
    });
    expect(result.name).toBe("old-name"); // returns current name from handle
  });

  it("keeps name when not provided in request", async () => {
    const col = mockCollection("keep-name", null, 0);
    const deps = createMockDeps({
      vecStore: {
        ...createMockDeps().vecStore,
        getCollection: vi.fn().mockResolvedValue(col)
      }
    });
    await handleUpdateCollection(deps, "keep-name", {});
    expect(col.modify).toHaveBeenCalledWith({
      name: "keep-name",
      metadata: {}
    });
  });
});

describe("handleDeleteCollection", () => {
  it("deletes collection and returns message", async () => {
    const deps = createMockDeps();
    const result = await handleDeleteCollection(deps, "my-col");
    expect(result.message).toContain("my-col");
    expect(result.message).toContain("deleted");
  });
});

describe("handleAddToCollection", () => {
  it("adds documents to collection", async () => {
    const col = mockCollection("col1");
    const deps = createMockDeps({
      vecStore: {
        ...createMockDeps().vecStore,
        getCollection: vi.fn().mockResolvedValue(col)
      }
    });
    const result = await handleAddToCollection(deps, "col1", {
      documents: ["doc1"],
      ids: ["id1"],
      metadatas: [{ source: "test" }],
      embeddings: [[0.1, 0.2]]
    });
    expect(col.add).toHaveBeenCalledWith({
      documents: ["doc1"],
      ids: ["id1"],
      metadatas: [{ source: "test" }],
      embeddings: [[0.1, 0.2]]
    });
    expect(result.message).toContain("col1");
  });
});

// ── Asset handlers ───────────────────────────────────────────

describe("handleListAssets", () => {
  it("returns empty list", async () => {
    const deps = createMockDeps();
    const result = await handleListAssets(deps, {});
    expect(result.assets).toEqual([]);
    expect(result.next).toBeNull();
  });

  it("paginates with defaults", async () => {
    const deps = createMockDeps();
    await handleListAssets(deps, {});
    expect(deps.assetModel.paginate).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "1",
        parent_id: "1", // defaults to userId when no contentType/parentId
        limit: 100
      })
    );
  });

  it("clamps pageSize to 10000", async () => {
    const deps = createMockDeps();
    await handleListAssets(deps, { pageSize: 99999 });
    expect(deps.assetModel.paginate).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10000 })
    );
  });

  it("uses parentId when provided", async () => {
    const deps = createMockDeps();
    await handleListAssets(deps, { parentId: "folder1" });
    expect(deps.assetModel.paginate).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: "folder1" })
    );
  });

  it("returns asset responses with URLs", async () => {
    const asset = mockAssetRecord({ has_thumbnail: true });
    const deps = createMockDeps({
      assetModel: {
        ...createMockDeps().assetModel,
        paginate: vi.fn().mockResolvedValue([[asset], "next-cursor"])
      }
    });
    const result = await handleListAssets(deps, {});
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].get_url).toBe("https://storage.example.com/file");
    expect(result.assets[0].thumb_url).toBe("https://storage.example.com/file");
    expect(result.next).toBe("next-cursor");
  });
});

describe("handleCreateAsset", () => {
  it("creates asset with defaults", async () => {
    const deps = createMockDeps();
    const result = await handleCreateAsset(deps, {});
    expect(result.id).toBe("a1");
    expect(deps.assetModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "1",
        name: "",
        content_type: ""
      })
    );
  });

  it("uses provided user_id and data", async () => {
    const deps = createMockDeps();
    await handleCreateAsset(
      deps,
      { user_id: "42", name: "file.txt", content_type: "text/plain" },
      "1"
    );
    expect(deps.assetModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "42",
        name: "file.txt",
        content_type: "text/plain"
      })
    );
  });
});

describe("handleGetAsset", () => {
  it("returns home folder for user root", async () => {
    const deps = createMockDeps();
    const result = await handleGetAsset(deps, "1", "1");
    expect(result.name).toBe("Home");
    expect(result.content_type).toBe("folder");
    expect(result.id).toBe("1");
  });

  it("returns asset from model", async () => {
    const deps = createMockDeps();
    const result = await handleGetAsset(deps, "a1", "1");
    expect(result.id).toBe("a1");
    expect(result.name).toBe("test.txt");
  });

  it("throws HttpError 404 when asset not found", async () => {
    const deps = createMockDeps({
      assetModel: {
        ...createMockDeps().assetModel,
        get: vi.fn().mockResolvedValue(null)
      }
    });
    await expect(handleGetAsset(deps, "missing", "1")).rejects.toThrow(
      HttpError
    );
  });

  it("does not fetch URL for folder assets", async () => {
    const folderAsset = mockAssetRecord({ content_type: "folder" });
    const deps = createMockDeps({
      assetModel: {
        ...createMockDeps().assetModel,
        get: vi.fn().mockResolvedValue(folderAsset)
      }
    });
    const result = await handleGetAsset(deps, "a1", "different-user");
    expect(result.get_url).toBeNull();
  });
});

describe("handleDeleteAsset", () => {
  it("deletes single asset", async () => {
    const asset = mockAssetRecord();
    const deps = createMockDeps({
      assetModel: {
        ...createMockDeps().assetModel,
        get: vi.fn().mockResolvedValue(asset)
      }
    });
    const result = await handleDeleteAsset(deps, "a1", "1");
    expect(result.deleted_asset_ids).toEqual(["a1"]);
    expect(asset.delete).toHaveBeenCalled();
  });

  it("throws HttpError 404 when asset not found", async () => {
    const deps = createMockDeps({
      assetModel: {
        ...createMockDeps().assetModel,
        get: vi.fn().mockResolvedValue(null)
      }
    });
    await expect(handleDeleteAsset(deps, "missing", "1")).rejects.toThrow(
      HttpError
    );
  });

  it("throws HttpError 403 when user does not own asset", async () => {
    const asset = mockAssetRecord({ user_id: "other" });
    const deps = createMockDeps({
      assetModel: {
        ...createMockDeps().assetModel,
        get: vi.fn().mockResolvedValue(asset)
      }
    });
    await expect(handleDeleteAsset(deps, "a1", "1")).rejects.toThrow(HttpError);
  });

  it("recursively deletes folder contents", async () => {
    const folder = mockAssetRecord({
      id: "f1",
      content_type: "folder",
      user_id: "1"
    });
    const child1 = mockAssetRecord({ id: "c1", user_id: "1" });
    const child2 = mockAssetRecord({ id: "c2", user_id: "1" });

    const deps = createMockDeps({
      assetModel: {
        get: vi.fn().mockResolvedValue(folder),
        find: vi.fn().mockImplementation((_uid, id) => {
          if (id === "f1") return Promise.resolve(folder);
          return Promise.resolve(null);
        }),
        create: vi.fn(),
        paginate: vi.fn().mockImplementation((opts) => {
          if (opts.parent_id === "f1") {
            return Promise.resolve([[child1, child2], null]);
          }
          return Promise.resolve([[], null]);
        })
      },
      assetStorage: {
        getUrl: vi.fn().mockResolvedValue("url"),
        delete: vi.fn().mockResolvedValue(undefined)
      }
    });

    const result = await handleDeleteAsset(deps, "f1", "1");
    expect(result.deleted_asset_ids).toContain("c1");
    expect(result.deleted_asset_ids).toContain("c2");
    expect(result.deleted_asset_ids).toContain("f1");
    expect(child1.delete).toHaveBeenCalled();
    expect(child2.delete).toHaveBeenCalled();
    expect(folder.delete).toHaveBeenCalled();
  });

  it("ignores storage deletion errors", async () => {
    const asset = mockAssetRecord();
    const deps = createMockDeps({
      assetModel: {
        ...createMockDeps().assetModel,
        get: vi.fn().mockResolvedValue(asset)
      },
      assetStorage: {
        getUrl: vi.fn().mockResolvedValue("url"),
        delete: vi.fn().mockRejectedValue(new Error("storage error"))
      }
    });
    // Should not throw despite storage errors
    const result = await handleDeleteAsset(deps, "a1", "1");
    expect(result.deleted_asset_ids).toEqual(["a1"]);
  });
});
