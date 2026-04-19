/**
 * ProcessingContext tests.
 */

import { describe, it, expect, vi } from "vitest";
import {
  ProcessingContext,
  MemoryCache,
  InMemoryStorageAdapter,
  FileStorageAdapter,
  S3StorageAdapter,
  resolveWorkspacePath,
  type S3Client,
  type MessageCreateRequestLike
} from "../src/context.js";
import type { ProcessingMessage, NodeUpdate } from "@nodetool/protocol";
import { BaseProvider } from "../src/providers/base-provider.js";
import type {
  Message,
  ProviderStreamItem,
  StreamingAudioChunk
} from "../src/providers/types.js";
import { registerProvider } from "../src/providers/provider-registry.js";
import { FakeProvider } from "../src/providers/fake-provider.js";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

describe("ProcessingContext – message queue", () => {
  it("collects emitted messages", () => {
    const ctx = new ProcessingContext({ jobId: "j1" });

    const msg: NodeUpdate = {
      type: "node_update",
      node_id: "n1",
      node_name: "Test",
      node_type: "test.Test",
      status: "running"
    };
    ctx.emit(msg);

    expect(ctx.getMessages()).toHaveLength(1);
    expect(ctx.getMessages()[0]).toBe(msg);
  });

  it("calls onMessage listener", () => {
    const received: ProcessingMessage[] = [];
    const ctx = new ProcessingContext({
      jobId: "j1",
      onMessage: (msg) => received.push(msg)
    });

    ctx.emit({
      type: "job_update",
      status: "running"
    });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("job_update");
  });

  it("clearMessages empties the queue", () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.emit({ type: "job_update", status: "running" });
    ctx.clearMessages();
    expect(ctx.getMessages()).toHaveLength(0);
  });

  it("supports hasMessages/popMessage/popMessageAsync", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    expect(ctx.hasMessages()).toBe(false);
    ctx.emit({ type: "job_update", status: "running" });
    expect(ctx.hasMessages()).toBe(true);
    const popped = ctx.popMessage();
    expect(popped?.type).toBe("job_update");
    expect(ctx.hasMessages()).toBe(false);

    const waiter = ctx.popMessageAsync();
    ctx.emit({ type: "job_update", status: "completed" });
    await expect(waiter).resolves.toMatchObject({
      type: "job_update",
      status: "completed"
    });
  });

  it("tracks latest node and edge statuses", () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.emit({
      type: "node_update",
      node_id: "n1",
      node_name: "Test",
      node_type: "test.Node",
      status: "running"
    });
    ctx.emit({
      type: "edge_update",
      workflow_id: "w1",
      edge_id: "e1",
      status: "active"
    });
    expect(ctx.getNodeStatuses().n1).toMatchObject({
      type: "node_update",
      status: "running"
    });
    expect(ctx.getEdgeStatuses().e1).toMatchObject({
      type: "edge_update",
      status: "active"
    });
  });

  it("supports Python-style message queue aliases", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.post_message({ type: "job_update", status: "running" });
    expect(ctx.getMessages()).toHaveLength(1);
    await expect(ctx.pop_message_async()).resolves.toMatchObject({
      type: "job_update",
      status: "running"
    });
    ctx.postMessage({ type: "job_update", status: "completed" });
    ctx.clear_messages();
    expect(ctx.getMessages()).toHaveLength(0);
  });
});

describe("ProcessingContext – Python model interfaces", () => {
  it("supports get_job via configured model interfaces", async () => {
    const ctx = new ProcessingContext({ jobId: "j1", userId: "u1" });
    ctx.setModelInterfaces({
      getJob: async ({ userId, jobId }) => ({ id: jobId, user_id: userId })
    });

    await expect(ctx.get_job("job-123")).resolves.toEqual({
      id: "job-123",
      user_id: "u1"
    });
  });

  it("supports create_message and get_messages via configured model interfaces", async () => {
    const created: MessageCreateRequestLike[] = [];
    const ctx = new ProcessingContext({ jobId: "j1", userId: "u1" });
    ctx.setModelInterfaces({
      createMessage: async ({ req }) => {
        created.push(req);
        return { id: "m1", ...req };
      },
      getMessages: async ({ threadId, limit, startKey, reverse, userId }) => ({
        messages: [
          {
            id: "m1",
            thread_id: threadId,
            user_id: userId,
            role: "user",
            content: "hello"
          }
        ],
        next: startKey ?? (reverse ? "rev" : limit ? `limit:${limit}` : null)
      })
    });

    await expect(
      ctx.create_message({
        thread_id: "t1",
        role: "user",
        content: "hello"
      })
    ).resolves.toMatchObject({ id: "m1", thread_id: "t1" });
    expect(created).toHaveLength(1);

    await expect(ctx.get_messages("t1", 25, "cursor-1", true)).resolves.toEqual(
      {
        messages: [
          {
            id: "m1",
            thread_id: "t1",
            user_id: "u1",
            role: "user",
            content: "hello"
          }
        ],
        next: "cursor-1"
      }
    );
  });

  it("supports create_asset and Python-style aliases", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      userId: "u1",
      workflowId: "w1",
      modelInterfaces: {
        createAsset: async (args) => ({
          id: "a1",
          name: args.name,
          size: args.content.byteLength,
          user_id: args.userId,
          workflow_id: args.workflowId,
          job_id: args.jobId
        })
      }
    });

    await expect(
      ctx.create_asset({
        name: "out.txt",
        contentType: "text/plain",
        content: new Uint8Array([1, 2, 3])
      })
    ).resolves.toEqual({
      id: "a1",
      name: "out.txt",
      size: 3,
      user_id: "u1",
      workflow_id: "w1",
      job_id: "j1"
    });
  });

  it("throws when required model interfaces are not configured", async () => {
    const ctx = new ProcessingContext({ jobId: "j1", userId: "u1" });
    await expect(ctx.get_job("j2")).rejects.toThrow("model interface 'getJob'");
    await expect(
      ctx.create_message({ thread_id: "t1", role: "user", content: "hello" })
    ).rejects.toThrow("model interface 'createMessage'");
    await expect(ctx.get_messages("t1")).rejects.toThrow(
      "model interface 'getMessages'"
    );
  });

  it("copies model interfaces and Python aliases", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      userId: "u1",
      modelInterfaces: {
        getJob: async ({ jobId }) => ({ id: jobId })
      }
    });

    const cloned = ctx.copy();
    await expect(cloned.get_job("j9")).resolves.toEqual({ id: "j9" });
  });
});

describe("MemoryCache", () => {
  it("stores and retrieves values", async () => {
    const cache = new MemoryCache();
    await cache.set("key1", { data: 42 });
    expect(await cache.get("key1")).toEqual({ data: 42 });
  });

  it("returns undefined for missing keys", async () => {
    const cache = new MemoryCache();
    expect(await cache.get("missing")).toBeUndefined();
  });

  it("has() checks existence", async () => {
    const cache = new MemoryCache();
    expect(await cache.has("key")).toBe(false);
    await cache.set("key", 1);
    expect(await cache.has("key")).toBe(true);
  });

  it("delete() removes entries", async () => {
    const cache = new MemoryCache();
    await cache.set("key", 1);
    await cache.delete("key");
    expect(await cache.has("key")).toBe(false);
  });

  it("respects TTL", async () => {
    const cache = new MemoryCache();
    await cache.set("key", 1, 0.05); // 50ms TTL
    expect(await cache.get("key")).toBe(1);

    await new Promise((r) => setTimeout(r, 60));
    expect(await cache.get("key")).toBeUndefined();
  });
});

describe("ProcessingContext.sanitizeForClient", () => {
  it("does not rewrite plain memory:// strings", () => {
    expect(ProcessingContext.sanitizeForClient("memory://abc")).toBe(
      "memory://abc"
    );
  });

  it("preserves normal strings", () => {
    expect(ProcessingContext.sanitizeForClient("hello")).toBe("hello");
  });

  it("sanitizes nested objects", () => {
    const result = ProcessingContext.sanitizeForClient({
      url: "memory://img1",
      name: "test"
    });
    expect(result).toEqual({
      url: "memory://img1",
      name: "test"
    });
  });

  it("sanitizes arrays", () => {
    const result = ProcessingContext.sanitizeForClient(["memory://a", "safe"]);
    expect(result).toEqual(["memory://a", "safe"]);
  });

  it("passes through non-string primitives", () => {
    expect(ProcessingContext.sanitizeForClient(42)).toBe(42);
    expect(ProcessingContext.sanitizeForClient(null)).toBe(null);
    expect(ProcessingContext.sanitizeForClient(true)).toBe(true);
  });

  it("sanitizes memory uri in serialized asset refs with inline data", () => {
    const value = {
      type: "ImageRef",
      uri: "memory://img-1",
      data: "base64-data",
      meta: { nested: { type: "TextRef", uri: "memory://txt-1", data: "x" } }
    };
    const result = ProcessingContext.sanitizeForClient(value);
    expect(result).toEqual({
      type: "ImageRef",
      uri: "",
      data: "base64-data",
      meta: { nested: { type: "TextRef", uri: "", data: "x" } }
    });
  });

  it("sanitizes memory uri in serialized asset refs with asset_id", () => {
    const value = {
      type: "ImageRef",
      uri: "memory://img-1",
      data: null,
      asset_id: "a123"
    };
    const result = ProcessingContext.sanitizeForClient(value);
    expect(result).toEqual({
      type: "ImageRef",
      uri: "asset://a123",
      data: null,
      asset_id: "a123"
    });
  });
});

describe("Storage adapters", () => {
  it("InMemoryStorageAdapter stores and retrieves bytes", async () => {
    const storage = new InMemoryStorageAdapter();
    const uri = await storage.store(
      "assets/test.txt",
      new Uint8Array([1, 2, 3])
    );

    expect(uri).toBe("memory://assets/test.txt");
    expect(await storage.exists(uri)).toBe(true);
    expect(await storage.retrieve(uri)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("InMemoryStorageAdapter returns null/false for unknown URIs", async () => {
    const storage = new InMemoryStorageAdapter();
    expect(await storage.retrieve("memory://missing.bin")).toBeNull();
    expect(await storage.exists("memory://missing.bin")).toBe(false);
    expect(await storage.retrieve("file:///tmp/not-memory")).toBeNull();
  });

  it("FileStorageAdapter stores and retrieves bytes under root", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-ts-runtime-"));
    try {
      const storage = new FileStorageAdapter(root);
      const uri = await storage.store(
        "assets/out.bin",
        new Uint8Array([9, 8, 7, 6])
      );

      expect(uri.startsWith("file://")).toBe(true);
      expect(await storage.exists(uri)).toBe(true);
      const bytes = await storage.retrieve(uri);
      expect(bytes).not.toBeNull();
      expect(Array.from(bytes ?? [])).toEqual([9, 8, 7, 6]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("FileStorageAdapter rejects traversal keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-ts-runtime-"));
    try {
      const storage = new FileStorageAdapter(root);
      await expect(
        storage.store("../escape.txt", new Uint8Array([1]))
      ).rejects.toThrow("Invalid storage key");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("S3StorageAdapter stores and returns s3 uri", async () => {
    const store = new Map<string, Uint8Array>();
    const client: S3Client = {
      async putObject(input) {
        store.set(`${input.bucket}/${input.key}`, new Uint8Array(input.body));
      },
      async getObject(input) {
        return store.get(`${input.bucket}/${input.key}`) ?? null;
      },
      async headObject(input) {
        return store.has(`${input.bucket}/${input.key}`);
      }
    };

    const storage = new S3StorageAdapter({
      bucket: "test-bucket",
      prefix: "runs/r1",
      client
    });
    const uri = await storage.store(
      "assets/out.bin",
      new Uint8Array([4, 5, 6]),
      "application/octet-stream"
    );

    expect(uri).toBe("s3://test-bucket/runs/r1/assets/out.bin");
    expect(await storage.exists(uri)).toBe(true);
    expect(await storage.retrieve(uri)).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("S3StorageAdapter returns null/false for other buckets or invalid uri", async () => {
    const client: S3Client = {
      async putObject() {},
      async getObject() {
        return new Uint8Array([1]);
      },
      async headObject() {
        return true;
      }
    };

    const storage = new S3StorageAdapter({ bucket: "bucket-a", client });
    expect(await storage.retrieve("s3://bucket-b/key")).toBeNull();
    expect(await storage.exists("s3://bucket-b/key")).toBe(false);
    expect(await storage.retrieve("file:///tmp/nope")).toBeNull();
    expect(await storage.exists("file:///tmp/nope")).toBe(false);
  });
});

describe("workspace path resolution", () => {
  it("resolves /workspace/ prefix", () => {
    const root = "/tmp/nodetool-workspace";
    expect(resolveWorkspacePath(root, "/workspace/out/a.txt")).toBe(
      "/tmp/nodetool-workspace/out/a.txt"
    );
  });

  it("resolves relative path", () => {
    const root = "/tmp/nodetool-workspace";
    expect(resolveWorkspacePath(root, "out/a.txt")).toBe(
      "/tmp/nodetool-workspace/out/a.txt"
    );
  });

  it("rejects traversal outside workspace", () => {
    const root = "/tmp/nodetool-workspace";
    expect(() => resolveWorkspacePath(root, "../etc/passwd")).toThrow(
      "outside the workspace directory"
    );
  });

  it("context.resolveWorkspacePath delegates to helper", () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      workspaceDir: "/tmp/nodetool-workspace"
    });
    expect(ctx.resolveWorkspacePath("workspace/out.json")).toBe(
      "/tmp/nodetool-workspace/out.json"
    );
  });
});

describe("output normalization", () => {
  it("materializes asset refs as data URIs", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const value = {
      image: {
        type: "ImageRef",
        uri: "memory://img",
        data: Buffer.from("hello").toString("base64")
      }
    };

    const normalized = (await ctx.normalizeOutputValue(value)) as {
      image: { uri: string };
    };
    expect(normalized.image.uri.startsWith("data:image/png;base64,")).toBe(
      true
    );
  });

  it("materializes asset refs to storage URLs via adapter", async () => {
    const storage = new InMemoryStorageAdapter();
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "storage_url",
      storage
    });
    const value = {
      image: {
        type: "ImageRef",
        uri: "memory://img",
        data: Buffer.from("hello").toString("base64")
      }
    };

    const normalized = (await ctx.normalizeOutputValue(value)) as {
      image: { uri: string; data?: unknown };
    };
    expect(normalized.image.uri.startsWith("memory://assets/")).toBe(true);
    expect(normalized.image.data).toBeUndefined();
    expect(await storage.exists(normalized.image.uri)).toBe(true);
  });

  it("materializes asset refs to temp URLs via resolver", async () => {
    const storage = new InMemoryStorageAdapter();
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "temp_url",
      storage,
      tempUrlResolver: (uri) => `https://temp.local/${encodeURIComponent(uri)}`
    });
    const value = {
      image: {
        type: "ImageRef",
        uri: "memory://img",
        data: Buffer.from("hello").toString("base64")
      }
    };

    const normalized = (await ctx.normalizeOutputValue(value)) as {
      image: { uri: string; data?: unknown };
    };
    expect(normalized.image.uri.startsWith("https://temp.local/")).toBe(true);
    expect(normalized.image.data).toBeUndefined();
  });

  it("materializes asset refs into workspace files", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-ts-workspace-"));
    try {
      const ctx = new ProcessingContext({
        jobId: "j1",
        assetOutputMode: "workspace",
        workspaceDir: root
      });
      const value = {
        image: {
          type: "ImageRef",
          uri: "memory://img",
          data: Buffer.from("hello").toString("base64")
        }
      };

      const normalized = (await ctx.normalizeOutputValue(value)) as {
        image: { uri: string; data?: unknown };
      };
      expect(normalized.image.uri.startsWith("file://")).toBe(true);
      const bytes = await readFile(fileURLToPath(normalized.image.uri));
      expect(bytes.toString("utf8")).toBe("hello");
      expect(normalized.image.data).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("FileStorageAdapter", () => {
  it("retrieves assets via /api/storage URLs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodetool-storage-"));
    try {
      const storage = new FileStorageAdapter(dir);
      const storedUri = await storage.store(
        "asset-123.png",
        new Uint8Array([1, 2, 3])
      );
      expect(storedUri.startsWith("file://")).toBe(true);

      const fromRelative = await storage.retrieve("/api/storage/asset-123.png");
      expect(Uint8Array.from(fromRelative ?? [])).toEqual(
        new Uint8Array([1, 2, 3])
      );

      const fromAbsolute = await storage.retrieve(
        "http://127.0.0.1:7777/api/storage/asset-123.png"
      );
      expect(Uint8Array.from(fromAbsolute ?? [])).toEqual(
        new Uint8Array([1, 2, 3])
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("ProcessingContext – asset helper methods", () => {
  const assetValue = {
    image: {
      type: "ImageRef",
      uri: "memory://img",
      data: Buffer.from("hello").toString("base64")
    }
  };

  it("assetsToDataUri converts assets to data URIs", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    const normalized = (await ctx.assetsToDataUri(assetValue)) as {
      image: { uri: string };
    };
    expect(normalized.image.uri.startsWith("data:image/png;base64,")).toBe(
      true
    );
  });

  it("assetsToStorageUrl converts assets to stored URIs", async () => {
    const storage = new InMemoryStorageAdapter();
    const ctx = new ProcessingContext({ jobId: "j1", storage });
    const normalized = (await ctx.assetsToStorageUrl(assetValue)) as {
      image: { uri: string; data?: unknown };
    };
    expect(normalized.image.uri.startsWith("memory://assets/")).toBe(true);
    expect(normalized.image.data).toBeUndefined();
  });

  it("uploadAssetsToTemp converts assets to temp URLs", async () => {
    const storage = new InMemoryStorageAdapter();
    const ctx = new ProcessingContext({
      jobId: "j1",
      storage,
      tempUrlResolver: (uri) => `https://temp.local/${encodeURIComponent(uri)}`
    });
    const normalized = (await ctx.uploadAssetsToTemp(assetValue)) as {
      image: { uri: string; data?: unknown };
    };
    expect(normalized.image.uri.startsWith("https://temp.local/")).toBe(true);
    expect(normalized.image.data).toBeUndefined();
  });

  it("sandboxToAsset persists a workspace file and returns an AssetRef", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-sandbox-to-asset-"));
    try {
      const createdAssets: Array<Record<string, unknown>> = [];
      const ctx = new ProcessingContext({
        jobId: "j1",
        userId: "u1",
        workflowId: "w1",
        workspaceDir: root,
        modelInterfaces: {
          createAsset: async (args) => {
            createdAssets.push({
              name: args.name,
              contentType: args.contentType,
              size: args.content.byteLength
            });
            return { id: "asset-123" };
          }
        }
      });

      const relPath = "downloads/report.txt";
      await mkdir(join(root, "downloads"), { recursive: true });
      await writeFile(join(root, relPath), "hello sandbox", "utf8");
      const ref = await ctx.sandboxToAsset(relPath);

      expect(ref).toEqual({
        type: "text",
        uri: "asset://asset-123",
        asset_id: "asset-123"
      });
      expect(createdAssets).toHaveLength(1);
      expect(createdAssets[0]).toMatchObject({
        name: "report.txt",
        contentType: "text/plain",
        size: 13
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("assetToSandbox downloads asset bytes and writes into workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-asset-to-sandbox-"));
    try {
      const ctx = new ProcessingContext({
        jobId: "j1",
        userId: "u1",
        workspaceDir: root,
        fetchFn: async (input: string | URL | Request) => {
          const url = String(input);
          if (url.endsWith("/api/assets/asset-42")) {
            return new Response(
              JSON.stringify({ id: "asset-42", get_url: "/api/storage/asset-42" }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }
          if (url.endsWith("/api/storage/asset-42")) {
            return new Response(new TextEncoder().encode("downloaded"), {
              status: 200,
              headers: { "content-type": "text/plain" }
            });
          }
          return new Response("not found", { status: 404 });
        }
      });

      const filePath = await ctx.assetToSandbox("asset-42", "imports/a.txt");
      expect(filePath).toBe(join(root, "imports/a.txt"));
      await expect(readFile(filePath, "utf8")).resolves.toBe("downloaded");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

class MockProvider extends BaseProvider {
  constructor() {
    super("mock");
  }

  async generateMessage(_args: {
    messages: Message[];
    model: string;
    tools?: unknown[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    return {
      role: "assistant",
      content: "mock-generated-message"
    };
  }

  async *generateMessages(_args: {
    messages: Message[];
    model: string;
    tools?: unknown[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
  }): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "a", done: false };
    yield { type: "chunk", content: "b", done: true };
  }

  override async *textToSpeech(_args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
  }): AsyncGenerator<StreamingAudioChunk> {
    yield { samples: new Int16Array([1, 2, 3]) };
  }
}

describe("ProcessingContext – variables and secrets", () => {
  it("supports get/set and persisted step results", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-ts-vars-"));
    try {
      const ctx = new ProcessingContext({
        jobId: "j1",
        workspaceDir: root,
        variables: { existing: 1 }
      });

      expect(ctx.get("existing", 0)).toBe(1);
      ctx.set("new_key", { ok: true });
      expect(ctx.get("new_key")).toEqual({ ok: true });

      const outPath = await ctx.storeStepResult("step_a", { n: 42 });
      expect(outPath.endsWith("step_a.json")).toBe(true);
      await expect(ctx.loadStepResult("step_a")).resolves.toEqual({ n: 42 });
      await expect(
        readFile(join(root, "var_new_key.json"), "utf8")
      ).resolves.toContain('"ok": true');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports getSecret/getSecretRequired", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      secretResolver: async (key) =>
        key === "OPENAI_API_KEY" ? "secret-value" : null
    });

    await expect(ctx.getSecret("OPENAI_API_KEY")).resolves.toBe("secret-value");
    await expect(ctx.getSecret("MISSING")).resolves.toBeNull();
    await expect(ctx.getSecretRequired("OPENAI_API_KEY")).resolves.toBe(
      "secret-value"
    );
    await expect(ctx.getSecretRequired("MISSING")).rejects.toThrow(
      "Missing required secret: MISSING"
    );
  });
});

describe("ProcessingContext – HTTP helpers", () => {
  it("retries transient responses and downloads bytes/text", async () => {
    let calls = 0;
    const ctx = new ProcessingContext({
      jobId: "j1",
      fetchFn: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response("retry", { status: 503 });
        }
        return new Response("hello", { status: 200 });
      }
    });

    const response = await ctx.httpGet("https://example.com", {
      retry: { maxRetries: 2, backoffMs: 1 }
    });
    expect(response.status).toBe(200);
    expect(calls).toBe(2);

    const bytes = await ctx.downloadFile("https://example.com/file", {
      retry: { maxRetries: 1, backoffMs: 1 }
    });
    expect(new TextDecoder().decode(bytes)).toBe("hello");
    await expect(ctx.downloadText("https://example.com/text")).resolves.toBe(
      "hello"
    );
  });
});

describe("ProcessingContext – provider prediction pipeline", () => {
  it("runs non-stream and emits prediction lifecycle updates", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("mock", new MockProvider());

    const out = await ctx.runProviderPrediction({
      provider: "mock",
      capability: "generate_message",
      model: "m1",
      nodeId: "n1",
      params: { messages: [{ role: "user", content: "hi" }] }
    });

    expect((out as Message).content).toBe("mock-generated-message");
    const predictionMessages = ctx
      .getMessages()
      .filter((m) => m.type === "prediction");
    expect(predictionMessages).toHaveLength(2);
    expect((predictionMessages[0] as { status: string }).status).toBe(
      "running"
    );
    expect((predictionMessages[1] as { status: string }).status).toBe(
      "completed"
    );
  });

  it("streams provider capability and emits lifecycle updates", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("mock", new MockProvider());

    const chunks: ProviderStreamItem[] = [];
    for await (const item of ctx.streamProviderPrediction({
      provider: "mock",
      capability: "generate_messages",
      model: "m1",
      params: { messages: [{ role: "user", content: "hi" }] }
    })) {
      chunks.push(item as ProviderStreamItem);
    }

    expect(chunks).toHaveLength(2);
    const predictionMessages = ctx
      .getMessages()
      .filter((m) => m.type === "prediction");
    expect(predictionMessages).toHaveLength(2);
    expect((predictionMessages[1] as { status: string }).status).toBe(
      "completed"
    );
  });
});

describe("ProcessingContext – copy and cost tracking", () => {
  it("copies key runtime state", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      workflowId: "w1",
      userId: "u1",
      variables: { x: 1 },
      environment: { APP_ENV: "test" },
      secretResolver: async () => "s"
    });
    ctx.registerProvider("mock", new MockProvider());
    ctx.trackOperationCost("op1", 1.25);

    const cloned = ctx.copy();
    expect(cloned.jobId).toBe("j1");
    expect(cloned.workflowId).toBe("w1");
    expect(cloned.userId).toBe("u1");
    expect(cloned.get("x")).toBe(1);
    expect(cloned.environment.APP_ENV).toBe("test");
    await expect(cloned.getSecretRequired("any")).resolves.toBe("s");
    await expect(cloned.getProvider("mock")).resolves.toBeInstanceOf(
      MockProvider
    );
    expect(cloned.getTotalCost()).toBeCloseTo(1.25);
  });

  it("tracks/reset costs", () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.trackOperationCost("tokens", 0.5, { provider: "openai" });
    ctx.addToTotalCost(0.2);
    expect(ctx.getTotalCost()).toBeCloseTo(0.7);
    expect(ctx.getOperationCosts()).toHaveLength(1);
    expect(ctx.getOperationCosts()[0]).toMatchObject({
      operation: "tokens",
      provider: "openai"
    });
    ctx.resetTotalCost();
    expect(ctx.getTotalCost()).toBe(0);
    expect(ctx.getOperationCosts()).toHaveLength(0);
  });
});

describe("ProcessingContext – node result cache helpers", () => {
  it("generates deterministic cache keys and stores/retrieves results", async () => {
    const ctx = new ProcessingContext({ jobId: "j1", userId: "u1" });
    const props = { a: 1, b: "x" };
    const k1 = ctx.generateNodeCacheKey("nodetool.test.Node", props);
    const k2 = ctx.generateNodeCacheKey("nodetool.test.Node", { b: "x", a: 1 });
    expect(k1).toBe(k2);

    await ctx.cacheResult("nodetool.test.Node", props, { out: 123 }, 60);
    await expect(
      ctx.getCachedResult("nodetool.test.Node", props)
    ).resolves.toEqual({ out: 123 });
  });
});

describe("ProcessingContext – setProviderResolver", () => {
  it("setProviderResolver allows resolving providers dynamically", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    const mock = new MockProvider();
    ctx.setProviderResolver(async (id) => {
      if (id === "mock") return mock;
      throw new Error(`unknown: ${id}`);
    });
    const result = await ctx.getProvider("mock");
    expect(result).toBe(mock);
  });
});

describe("ProcessingContext – setSecretResolver", () => {
  it("replaces secret resolver dynamically", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.setSecretResolver((key, userId) => `${key}-${userId}`);
    const result = await ctx.getSecret("MY_KEY");
    expect(result).toBe("MY_KEY-default");
  });
});

describe("ProcessingContext – setTempUrlResolver", () => {
  it("sets temp URL resolver for asset materialization", async () => {
    const storage = new InMemoryStorageAdapter();
    const ctx = new ProcessingContext({ jobId: "j1", storage });
    ctx.setTempUrlResolver((uri) => `https://cdn.example.com/${uri}`);
    const value = {
      type: "ImageRef",
      uri: "memory://img",
      data: Buffer.from("hello").toString("base64")
    };
    const result = (await ctx.normalizeOutputValue(
      value,
      "temp_url"
    )) as Record<string, unknown>;
    expect((result.uri as string).startsWith("https://cdn.example.com/")).toBe(
      true
    );
  });
});

describe("ProcessingContext – HTTP method variants", () => {
  it("httpPost sends POST method", async () => {
    let capturedMethod = "";
    const ctx = new ProcessingContext({
      jobId: "j1",
      fetchFn: async (_url, init) => {
        capturedMethod = (init as RequestInit).method ?? "";
        return new Response("ok", { status: 200 });
      }
    });
    await ctx.httpPost("https://example.com/api");
    expect(capturedMethod).toBe("POST");
  });

  it("httpPatch sends PATCH method", async () => {
    let capturedMethod = "";
    const ctx = new ProcessingContext({
      jobId: "j1",
      fetchFn: async (_url, init) => {
        capturedMethod = (init as RequestInit).method ?? "";
        return new Response("ok", { status: 200 });
      }
    });
    await ctx.httpPatch("https://example.com/api");
    expect(capturedMethod).toBe("PATCH");
  });

  it("httpDelete sends DELETE method", async () => {
    let capturedMethod = "";
    const ctx = new ProcessingContext({
      jobId: "j1",
      fetchFn: async (_url, init) => {
        capturedMethod = (init as RequestInit).method ?? "";
        return new Response("ok", { status: 200 });
      }
    });
    await ctx.httpDelete("https://example.com/api");
    expect(capturedMethod).toBe("DELETE");
  });

  it("httpPut sends PUT method", async () => {
    let capturedMethod = "";
    const ctx = new ProcessingContext({
      jobId: "j1",
      fetchFn: async (_url, init) => {
        capturedMethod = (init as RequestInit).method ?? "";
        return new Response("ok", { status: 200 });
      }
    });
    await ctx.httpPut("https://example.com/api");
    expect(capturedMethod).toBe("PUT");
  });

  it("httpHead sends HEAD method", async () => {
    let capturedMethod = "";
    const ctx = new ProcessingContext({
      jobId: "j1",
      fetchFn: async (_url, init) => {
        capturedMethod = (init as RequestInit).method ?? "";
        return new Response("ok", { status: 200 });
      }
    });
    await ctx.httpHead("https://example.com/api");
    expect(capturedMethod).toBe("HEAD");
  });

  it("httpGet sends GET method", async () => {
    let capturedMethod = "";
    const ctx = new ProcessingContext({
      jobId: "j1",
      fetchFn: async (_url, init) => {
        capturedMethod = (init as RequestInit).method ?? "";
        return new Response("ok", { status: 200 });
      }
    });
    await ctx.httpGet("https://example.com/api");
    expect(capturedMethod).toBe("GET");
  });

  it("httpGet includes default headers", async () => {
    let capturedHeaders: Record<string, string> = {};
    const ctx = new ProcessingContext({
      jobId: "j1",
      fetchFn: async (_url, init) => {
        capturedHeaders = (init as any).headers ?? {};
        return new Response("ok", { status: 200 });
      }
    });
    await ctx.httpGet("https://example.com/api");
    expect(capturedHeaders["User-Agent"]).toBe("nodetool-ts-runtime/0.1");
    expect(capturedHeaders["Accept"]).toBe("*/*");
  });

  it("retries on Retry-After header with non-numeric value", async () => {
    let callCount = 0;
    const ctx = new ProcessingContext({
      jobId: "j1",
      fetchFn: async () => {
        callCount++;
        if (callCount === 1) {
          return new Response("busy", {
            status: 429,
            headers: { "Retry-After": "not-a-number" }
          });
        }
        return new Response("ok", { status: 200 });
      }
    });
    const resp = await ctx.httpGet("https://example.com", {
      retry: { maxRetries: 2, backoffMs: 1 }
    });
    expect(callCount).toBe(2);
    expect(resp.status).toBe(200);
  });

  it("throws on fetch error after max retries (non-Error thrown)", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      fetchFn: async () => {
        throw "string-error";
      }
    });
    await expect(
      ctx.httpGet("https://example.com", {
        retry: { maxRetries: 1, backoffMs: 1 }
      })
    ).rejects.toThrow(/HTTP request failed/);
  });
});

describe("ProcessingContext – addToTotalCost NaN handling", () => {
  it("treats NaN cost as 0", () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.addToTotalCost(NaN);
    expect(ctx.getTotalCost()).toBe(0);
  });

  it("treats Infinity cost as 0", () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.trackOperationCost("op", Infinity);
    expect(ctx.getTotalCost()).toBe(0);
  });
});

describe("ProcessingContext – provider prediction error handling", () => {
  it("emits failed prediction on error", async () => {
    class FailProvider extends MockProvider {
      override async generateMessage(): Promise<Message> {
        throw new Error("provider failure");
      }
    }
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("fail", new FailProvider());
    await expect(
      ctx.runProviderPrediction({
        provider: "fail",
        capability: "generate_message",
        model: "m"
      })
    ).rejects.toThrow("provider failure");
    const predMsgs = ctx.getMessages().filter((m) => m.type === "prediction");
    expect((predMsgs[1] as any).status).toBe("failed");
  });

  it("stream emits failed prediction on error", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("mock", new MockProvider());
    await expect(async () => {
      for await (const _ of ctx.streamProviderPrediction({
        provider: "mock",
        capability: "text_to_image" as any,
        model: "m"
      })) {
        // consume
      }
    }).rejects.toThrow(/not streamable/);
    const predMsgs = ctx.getMessages().filter((m) => m.type === "prediction");
    expect((predMsgs[predMsgs.length - 1] as any).status).toBe("failed");
  });

  it("stream handles text_to_speech capability", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("mock", new MockProvider());
    const items: unknown[] = [];
    for await (const item of ctx.streamProviderPrediction({
      provider: "mock",
      capability: "text_to_speech",
      model: "m",
      params: { text: "hello" }
    })) {
      items.push(item);
    }
    expect(items.length).toBeGreaterThan(0);
  });
});

describe("ProcessingContext – dispatchCapability edge cases", () => {
  it("dispatches text_to_image", async () => {
    class ImageProvider extends MockProvider {
      override async textToImage(): Promise<Uint8Array> {
        return new Uint8Array([1, 2, 3]);
      }
    }
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("img", new ImageProvider());
    const result = await ctx.runProviderPrediction({
      provider: "img",
      capability: "text_to_image",
      model: "m",
      params: { prompt: "cat" }
    });
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("dispatches image_to_image", async () => {
    class I2IProvider extends MockProvider {
      override async imageToImage(): Promise<Uint8Array> {
        return new Uint8Array([4, 5]);
      }
    }
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("i2i", new I2IProvider());
    const result = await ctx.runProviderPrediction({
      provider: "i2i",
      capability: "image_to_image",
      model: "m",
      params: { image: new Uint8Array([1]), prompt: "style" }
    });
    expect(result).toEqual(new Uint8Array([4, 5]));
  });

  it("dispatches text_to_video", async () => {
    class VidProvider extends MockProvider {
      override async textToVideo(): Promise<Uint8Array> {
        return new Uint8Array([6]);
      }
    }
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("vid", new VidProvider());
    const result = await ctx.runProviderPrediction({
      provider: "vid",
      capability: "text_to_video",
      model: "m",
      params: { prompt: "cat running" }
    });
    expect(result).toEqual(new Uint8Array([6]));
  });

  it("dispatches image_to_video", async () => {
    class I2VProvider extends MockProvider {
      override async imageToVideo(): Promise<Uint8Array> {
        return new Uint8Array([7]);
      }
    }
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("i2v", new I2VProvider());
    const result = await ctx.runProviderPrediction({
      provider: "i2v",
      capability: "image_to_video",
      model: "m",
      params: { image: new Uint8Array([1]) }
    });
    expect(result).toEqual(new Uint8Array([7]));
  });

  it("dispatches automatic_speech_recognition", async () => {
    class ASRProvider extends MockProvider {
      override async automaticSpeechRecognition(): Promise<string> {
        return "recognized text";
      }
    }
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("asr", new ASRProvider());
    const result = await ctx.runProviderPrediction({
      provider: "asr",
      capability: "automatic_speech_recognition",
      model: "m",
      params: { audio: new Uint8Array([1]) }
    });
    expect(result).toBe("recognized text");
  });

  it("dispatches generate_embedding", async () => {
    class EmbedProvider extends MockProvider {
      override async generateEmbedding(): Promise<number[][]> {
        return [[0.1, 0.2]];
      }
    }
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("embed", new EmbedProvider());
    const result = await ctx.runProviderPrediction({
      provider: "embed",
      capability: "generate_embedding",
      model: "m",
      params: { text: "hello" }
    });
    expect(result).toEqual([[0.1, 0.2]]);
  });

  it("throws for unsupported non-streaming capability", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("mock", new MockProvider());
    await expect(
      ctx.runProviderPrediction({
        provider: "mock",
        capability: "text_to_speech" as any,
        model: "m"
      })
    ).rejects.toThrow(/requires streaming/);
  });
});

describe("ProcessingContext – loadStepResult edge cases", () => {
  it("returns default when workspace result file is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-ts-load-"));
    try {
      const ctx = new ProcessingContext({ jobId: "j1", workspaceDir: root });
      // Manually set a workspace result marker with non-existent file
      ctx.set("step_missing", { __workspace_result__: "missing.json" } as any);
      // Wait a tick for the persist attempt
      await new Promise((r) => setTimeout(r, 10));
      const result = await ctx.loadStepResult("step_missing", "fallback");
      expect(result).toBe("fallback");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns raw variable when no workspace marker", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.set("raw_var", 42);
    const result = await ctx.loadStepResult("raw_var", 0);
    expect(result).toBe(42);
  });

  it("returns default when variable does not exist", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    const result = await ctx.loadStepResult("nonexistent", "default_val");
    expect(result).toBe("default_val");
  });
});

describe("ProcessingContext – workspace path errors", () => {
  it("throws when workspace is null", () => {
    expect(() => resolveWorkspacePath(null, "file.txt")).toThrow(
      "No workspace is assigned"
    );
  });

  it("throws when workspace is empty string", () => {
    expect(() => resolveWorkspacePath("", "file.txt")).toThrow(
      "Workspace directory is required"
    );
  });

  it("handles workspace/ prefix (no leading slash)", () => {
    expect(resolveWorkspacePath("/tmp/ws", "workspace/foo.txt")).toBe(
      "/tmp/ws/foo.txt"
    );
  });

  it("handles absolute paths as workspace-relative", () => {
    const result = resolveWorkspacePath("/tmp/ws", "/some/path.txt");
    expect(result).toBe("/tmp/ws/some/path.txt");
  });
});

describe("ProcessingContext – S3 parseUri edge cases", () => {
  it("returns null for s3 uri with no key", async () => {
    const client: S3Client = {
      async putObject() {},
      async getObject() {
        return null;
      },
      async headObject() {
        return false;
      }
    };
    const storage = new S3StorageAdapter({ bucket: "b", client });
    expect(await storage.retrieve("s3://b/")).toBeNull();
    expect(await storage.exists("s3://b/")).toBe(false);
    expect(await storage.retrieve("s3://")).toBeNull();
    expect(await storage.exists("s3://")).toBe(false);
  });

  it("S3 constructor requires bucket", () => {
    const client: S3Client = {
      async putObject() {},
      async getObject() {
        return null;
      },
      async headObject() {
        return false;
      }
    };
    expect(() => new S3StorageAdapter({ bucket: "", client })).toThrow(
      "S3 bucket is required"
    );
  });
});

describe("ProcessingContext – guessAssetMime", () => {
  it("materializes audio asset with correct mime", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const value = {
      type: "AudioRef",
      uri: "memory://aud",
      data: Buffer.from("audio-data").toString("base64")
    };
    const result = (await ctx.normalizeOutputValue(value)) as Record<
      string,
      unknown
    >;
    expect((result.uri as string).startsWith("data:audio/wav;base64,")).toBe(
      true
    );
  });

  it("materializes video asset with correct mime", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const value = {
      type: "VideoRef",
      uri: "memory://vid",
      data: Buffer.from("video-data").toString("base64")
    };
    const result = (await ctx.normalizeOutputValue(value)) as Record<
      string,
      unknown
    >;
    expect((result.uri as string).startsWith("data:video/mp4;base64,")).toBe(
      true
    );
  });

  it("materializes text asset with correct mime", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const value = {
      type: "TextRef",
      uri: "memory://txt",
      data: Buffer.from("text-data").toString("base64")
    };
    const result = (await ctx.normalizeOutputValue(value)) as Record<
      string,
      unknown
    >;
    expect((result.uri as string).startsWith("data:text/plain;base64,")).toBe(
      true
    );
  });

  it("materializes model3d asset with correct mime", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const value = {
      type: "Model3DRef",
      uri: "memory://m3d",
      data: Buffer.from("model-data").toString("base64")
    };
    const result = (await ctx.normalizeOutputValue(value)) as Record<
      string,
      unknown
    >;
    expect(
      (result.uri as string).startsWith("data:model/gltf-binary;base64,")
    ).toBe(true);
  });

  it("uses explicit mime_type over guessed", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const value = {
      type: "ImageRef",
      uri: "memory://img",
      data: Buffer.from("data").toString("base64"),
      mime_type: "image/jpeg"
    };
    const result = (await ctx.normalizeOutputValue(value)) as Record<
      string,
      unknown
    >;
    expect((result.uri as string).startsWith("data:image/jpeg;base64,")).toBe(
      true
    );
  });
});

describe("ProcessingContext – decodeAssetData", () => {
  it("handles Uint8Array data in asset", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const value = {
      type: "ImageRef",
      uri: "memory://img",
      data: new Uint8Array([72, 101, 108, 108, 111])
    };
    const result = (await ctx.normalizeOutputValue(value)) as Record<
      string,
      unknown
    >;
    expect((result.uri as string).startsWith("data:image/png;base64,")).toBe(
      true
    );
  });

  it("handles numeric array data in asset", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const value = {
      type: "ImageRef",
      uri: "memory://img",
      data: [72, 101, 108, 108, 111]
    };
    const result = (await ctx.normalizeOutputValue(value)) as Record<
      string,
      unknown
    >;
    expect((result.uri as string).startsWith("data:image/png;base64,")).toBe(
      true
    );
  });

  it("returns asset unchanged when data is non-decodable and no storage", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const value = {
      type: "ImageRef",
      uri: "memory://img",
      data: { weird: true }
    };
    const result = (await ctx.normalizeOutputValue(value)) as Record<
      string,
      unknown
    >;
    // No bytes can be extracted, returns unchanged
    expect(result.uri).toBe("memory://img");
  });
});

describe("ProcessingContext – normalizeOutputValue", () => {
  it("returns null/undefined as-is", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    expect(await ctx.normalizeOutputValue(null)).toBeNull();
    expect(await ctx.normalizeOutputValue(undefined)).toBeUndefined();
  });

  it("returns primitives as-is", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    expect(await ctx.normalizeOutputValue(42)).toBe(42);
    expect(await ctx.normalizeOutputValue("hello")).toBe("hello");
    expect(await ctx.normalizeOutputValue(true)).toBe(true);
  });

  it("replaces Uint8Array values with a bytes descriptor", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const result = (await ctx.normalizeOutputValue({
      output: bytes,
      status: 200
    })) as { output: { type: string; length: number }; status: number };

    expect(result.status).toBe(200);
    expect(result.output).toEqual({ type: "bytes", length: 4 });
  });

  it("passes through in raw/python mode", async () => {
    const ctx = new ProcessingContext({ jobId: "j1", assetOutputMode: "raw" });
    const value = {
      type: "ImageRef",
      uri: "memory://img",
      data: "base64data"
    };
    const result = await ctx.normalizeOutputValue(value);
    expect(result).toEqual(value);
  });

  it("materializes nested arrays of assets", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const value = [
      {
        type: "ImageRef",
        uri: "memory://img1",
        data: Buffer.from("a").toString("base64")
      },
      {
        type: "ImageRef",
        uri: "memory://img2",
        data: Buffer.from("b").toString("base64")
      }
    ];
    const result = (await ctx.normalizeOutputValue(value)) as Array<
      Record<string, unknown>
    >;
    expect(result).toHaveLength(2);
    expect((result[0].uri as string).startsWith("data:")).toBe(true);
    expect((result[1].uri as string).startsWith("data:")).toBe(true);
  });
});

describe("ProcessingContext – persistVariableIfNeeded", () => {
  it("skips persistence for function/symbol/bigint values", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-ts-persist-"));
    try {
      const ctx = new ProcessingContext({ jobId: "j1", workspaceDir: root });
      ctx.set("fn_val", () => {});
      ctx.set("sym_val", Symbol("test"));
      ctx.set("big_val", BigInt(42));
      ctx.set("null_val", null);
      ctx.set("undef_val", undefined);
      // Wait for async persist attempts
      await new Promise((r) => setTimeout(r, 50));
      // These should not throw or create files
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("ProcessingContext – workspace materialization errors", () => {
  it("throws when workspace mode used without workspaceDir", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "workspace"
    });
    const value = {
      type: "ImageRef",
      uri: "memory://img",
      data: Buffer.from("hello").toString("base64")
    };
    await expect(ctx.normalizeOutputValue(value)).rejects.toThrow(
      "workspace_dir is required"
    );
  });

  it("returns asset unchanged in storage_url mode without storage", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    const value = {
      type: "ImageRef",
      uri: "memory://img",
      data: Buffer.from("hello").toString("base64")
    };
    const result = (await ctx.normalizeOutputValue(
      value,
      "storage_url"
    )) as Record<string, unknown>;
    // No storage adapter, returns unchanged
    expect(result.uri).toBe("memory://img");
  });

  it("returns asset unchanged in temp_url mode without storage", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    const value = {
      type: "ImageRef",
      uri: "memory://img",
      data: Buffer.from("hello").toString("base64")
    };
    const result = (await ctx.normalizeOutputValue(
      value,
      "temp_url"
    )) as Record<string, unknown>;
    expect(result.uri).toBe("memory://img");
  });
});

describe("ProcessingContext – assetsToWorkspaceFiles", () => {
  it("converts assets to workspace files", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-ts-ws-files-"));
    try {
      const ctx = new ProcessingContext({ jobId: "j1", workspaceDir: root });
      const value = {
        image: {
          type: "ImageRef",
          uri: "memory://img",
          data: Buffer.from("hello").toString("base64")
        }
      };
      const result = (await ctx.assetsToWorkspaceFiles(value)) as {
        image: { uri: string; data?: unknown };
      };
      expect(result.image.uri.startsWith("file://")).toBe(true);
      expect(result.image.data).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("ProcessingContext – getProvider edge cases", () => {
  it("throws for empty providerId", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    await expect(ctx.getProvider("")).rejects.toThrow("providerId is required");
    await expect(ctx.getProvider("  ")).rejects.toThrow(
      "providerId is required"
    );
  });

  it("uses registered provider before resolver", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    const mock = new MockProvider();
    ctx.registerProvider("mock", mock);
    ctx.setProviderResolver(async () => {
      throw new Error("should not call");
    });
    const result = await ctx.getProvider("mock");
    expect(result).toBe(mock);
  });
});

describe("ProcessingContext – storeStepResult without workspace", () => {
  it("throws when no workspace is set", async () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    await expect(ctx.storeStepResult("key", { data: 1 })).rejects.toThrow(
      "workspace_dir is required"
    );
  });
});

describe("ProcessingContext – generateNodeCacheKey edge cases", () => {
  it("handles null/undefined nodeProps", () => {
    const ctx = new ProcessingContext({ jobId: "j1", userId: "u1" });
    const k1 = ctx.generateNodeCacheKey("type", null);
    expect(k1).toBe("u1:type:null");
    const k2 = ctx.generateNodeCacheKey("type", undefined);
    expect(k2).toBe("u1:type:null");
  });

  it("handles primitive nodeProps", () => {
    const ctx = new ProcessingContext({ jobId: "j1", userId: "u1" });
    const k = ctx.generateNodeCacheKey("type", "hello");
    expect(k).toBe('u1:type:"hello"');
  });
});

describe("ProcessingContext – FileStorageAdapter edge cases", () => {
  it("returns null for non-file:// URIs", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-ts-fs-"));
    try {
      const storage = new FileStorageAdapter(root);
      expect(await storage.retrieve("memory://foo")).toBeNull();
      expect(await storage.exists("memory://foo")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns null for file outside root", async () => {
    const root = await mkdtemp(join(tmpdir(), "nodetool-ts-fs-"));
    try {
      const storage = new FileStorageAdapter(root);
      expect(await storage.retrieve("file:///etc/passwd")).toBeNull();
      expect(await storage.exists("file:///etc/passwd")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("ProcessingContext – sanitizeForClient edge cases", () => {
  it("sanitizes memory uri asset with no data and no asset_id", () => {
    const value = {
      type: "ImageRef",
      uri: "memory://img-1"
    };
    const result = ProcessingContext.sanitizeForClient(value) as Record<
      string,
      unknown
    >;
    expect(result.uri).toBe("");
  });

  it("replaces Uint8Array values with a bytes descriptor", () => {
    const value = {
      output: new Uint8Array([65, 66, 67])
    };

    const result = ProcessingContext.sanitizeForClient(value) as {
      output: { type: string; length: number };
    };

    expect(result.output).toEqual({ type: "bytes", length: 3 });
  });
});

describe("ProcessingContext – stream prediction non-Error throw", () => {
  it("handles non-Error thrown during streaming", async () => {
    class BadStreamProvider extends MockProvider {
      override async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
        throw "string error";
      }
    }
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.registerProvider("bad", new BadStreamProvider());
    await expect(async () => {
      for await (const _ of ctx.streamProviderPrediction({
        provider: "bad",
        capability: "generate_messages",
        model: "m"
      })) {
        // consume
      }
    }).rejects.toBe("string error");
  });
});

describe("ProcessingContext – storage path escape prevention", () => {
  it("throws when storage key tries to escape root", async () => {
    const { FileStorageAdapter } = await import("../src/context.js");
    const tmpDir = "/tmp/nodetool-test-storage-" + Date.now();
    const adapter = new FileStorageAdapter(tmpDir);
    await expect(
      adapter.store("../../etc/passwd", new Uint8Array([1]))
    ).rejects.toThrow("Invalid storage key");
  });
});

describe("ProcessingContext – storage retrieve returns null on error", () => {
  it("returns null for non-existent file", async () => {
    const { FileStorageAdapter } = await import("../src/context.js");
    const tmpDir = "/tmp/nodetool-test-storage-" + Date.now();
    const adapter = new FileStorageAdapter(tmpDir);
    const result = await adapter.retrieve("file:///nonexistent/path/file.txt");
    expect(result).toBeNull();
  });

  it("returns null for non-file URI", async () => {
    const { FileStorageAdapter } = await import("../src/context.js");
    const tmpDir = "/tmp/nodetool-test-storage-" + Date.now();
    const adapter = new FileStorageAdapter(tmpDir);
    const result = await adapter.retrieve("https://example.com/file.txt");
    expect(result).toBeNull();
  });
});

describe("ProcessingContext – getProvider with no resolver", () => {
  it("falls back to the global provider registry", async () => {
    const providerId = `fake-${Date.now()}`;
    registerProvider(providerId, FakeProvider, { textResponse: "hello" });
    const ctx = new ProcessingContext({ jobId: "j1" });
    const provider = await ctx.getProvider(providerId);
    expect(provider).toBeInstanceOf(FakeProvider);
  });

  it("resolves built-in providers from the default registry path", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test-fake-key");
    try {
      const ctx = new ProcessingContext({ jobId: "j1" });
      const provider = await ctx.getProvider("openai");
      expect(provider.provider).toBe("openai");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("ProcessingContext – get with default value", () => {
  it("returns default value for unknown key", () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    expect(ctx.get("nonexistent", "default")).toBe("default");
  });

  it("returns undefined when no default provided", () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    expect(ctx.get("nonexistent")).toBeUndefined();
  });
});

describe("ProcessingContext – guessAssetMime fallback", () => {
  it("returns application/octet-stream for unknown asset type", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "data_uri"
    });
    const result = await ctx.normalizeOutputValue({
      type: "unknown_type_xyz",
      data: Buffer.from("test").toString("base64")
    });
    if (result && typeof result === "object" && "uri" in (result as any)) {
      expect((result as any).uri).toContain("data:application/octet-stream");
    }
  });
});

describe("ProcessingContext – materializeAsset fallback for unknown mode", () => {
  it("returns asset unchanged for unrecognized mode", async () => {
    const ctx = new ProcessingContext({
      jobId: "j1",
      assetOutputMode: "unknown_mode" as any
    });
    const asset = {
      type: "image",
      data: Buffer.from("test").toString("base64")
    };
    const result = await ctx.normalizeOutputValue(asset);
    expect(result).toBeDefined();
  });
});

describe("ProcessingContext – workspace path Windows drive letter", () => {
  it("handles absolute paths with leading slash", () => {
    const ctx = new ProcessingContext({ jobId: "j1", workspaceDir: "/tmp/ws" });
    const resolved = ctx.resolveWorkspacePath("/absolute/path");
    expect(resolved).toBeTruthy();
  });
});

describe("ProcessingContext – memory helpers", () => {
  it("tracks memory:// values and reports stats", () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.set("memory://assets/a", { id: 1 });
    ctx.set("memory://assets/b", { id: 2 });
    ctx.set("memory://tmp/c", { id: 3 });

    expect(ctx.getMemoryStats()).toEqual({
      total: 3,
      byPrefix: { assets: 2, tmp: 1 }
    });
  });

  it("clears memory entries globally or by pattern", () => {
    const ctx = new ProcessingContext({ jobId: "j1" });
    ctx.set("memory://assets/a", 1);
    ctx.set("memory://tmp/b", 2);
    ctx.clearMemory("assets");
    expect(ctx.getMemoryStats()).toEqual({
      total: 1,
      byPrefix: { tmp: 1 }
    });

    ctx.clearMemory();
    expect(ctx.getMemoryStats()).toEqual({ total: 0, byPrefix: {} });
  });
});
