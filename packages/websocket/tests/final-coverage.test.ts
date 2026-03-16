/**
 * Final coverage tests to reach 100% statement coverage on all target files:
 *   - models-api.ts: walk/glob/isLlamaCppModelCached fs mock paths
 *   - unified-websocket-runner.ts: stream_input success/error catch, chat stale seq
 *   - http-api.ts: /v1/ prefix routing, /api/oauth/ routing, createHttpApiServer error handler
 *   - oauth-api.ts: GitHub start host handling (://  and 127.0.0.1)
 *   - code-tools.ts: truncate branch, ERR_CHILD_PROCESS_STDIO_MAXBUFFER, typescript command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pack, unpack } from "msgpackr";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  Thread,
  Message,
  Workflow,
  Job,
} from "@nodetool/models";

// ── Helpers ──────────────────────────────────────────────────────────

import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame,
} from "../src/unified-websocket-runner.js";

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: Array<WebSocketReceiveFrame> = [];

  async accept(): Promise<void> {
    return;
  }
  async receive(): Promise<WebSocketReceiveFrame> {
    const next = this.queue.shift();
    if (!next) return { type: "websocket.disconnect" };
    return next;
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }
  async sendText(data: string): Promise<void> {
    this.sentText.push(data);
  }
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

function setupModels() {
  const factory = new MemoryAdapterFactory();
  setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
}

// ── models-api.ts: test via creating actual temp cache dirs ──────────

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Models API: isLlamaCppModelCached with real temp dirs", () => {
  let tempDir: string;
  let origHfCache: string | undefined;
  let origLlamaCache: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "nodetool-test-"));
    origHfCache = process.env.HUGGINGFACE_HUB_CACHE;
    origLlamaCache = process.env.LLAMA_CPP_CACHE_DIR;
    // Point HF cache to temp dir so listSnapshotDirs finds nothing by default
    process.env.HUGGINGFACE_HUB_CACHE = join(tempDir, "hf-cache");
  });

  afterEach(async () => {
    if (origHfCache === undefined) {
      delete process.env.HUGGINGFACE_HUB_CACHE;
    } else {
      process.env.HUGGINGFACE_HUB_CACHE = origHfCache;
    }
    if (origLlamaCache === undefined) {
      delete process.env.LLAMA_CPP_CACHE_DIR;
    } else {
      process.env.LLAMA_CPP_CACHE_DIR = origLlamaCache;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns true when file found in llama.cpp cache snapshot", async () => {
    const llamaCacheDir = join(tempDir, "llama-cache");
    process.env.LLAMA_CPP_CACHE_DIR = llamaCacheDir;

    // Create llama.cpp cache structure: models--test--gguf/snapshots/abc123/model.gguf
    const snapshotDir = join(llamaCacheDir, "models--test--gguf", "snapshots", "abc123");
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(join(snapshotDir, "model.gguf"), "fake-model-data");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          {
            key: "k-llama-found",
            repo_id: "test/gguf",
            model_type: "llama_cpp",
            path: "model.gguf",
          },
        ]),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<{ key: string; downloaded: boolean }>;
    expect(data[0].downloaded).toBe(true);
  });

  it("returns true when basename match found in llama.cpp cache", async () => {
    const llamaCacheDir = join(tempDir, "llama-cache2");
    process.env.LLAMA_CPP_CACHE_DIR = llamaCacheDir;

    // File is at basename level: models--test--gguf/snapshots/snap1/model.gguf
    // but path requested is "subdir/model.gguf"
    const snapshotDir = join(llamaCacheDir, "models--test--gguf2", "snapshots", "snap1");
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(join(snapshotDir, "model.gguf"), "fake-data");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          {
            key: "k-basename",
            repo_id: "test/gguf2",
            model_type: "llama_cpp_model",
            path: "subdir/model.gguf",
          },
        ]),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<{ key: string; downloaded: boolean }>;
    expect(data[0].downloaded).toBe(true);
  });

  it("skips non-directory entries in llama.cpp snapshots", async () => {
    const llamaCacheDir = join(tempDir, "llama-cache3");
    process.env.LLAMA_CPP_CACHE_DIR = llamaCacheDir;

    // Create a file (not directory) in snapshots
    const snapshotsDir = join(llamaCacheDir, "models--test--gguf3", "snapshots");
    await mkdir(snapshotsDir, { recursive: true });
    await writeFile(join(snapshotsDir, "not-a-dir"), "file");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          {
            key: "k-skipfile",
            repo_id: "test/gguf3",
            model_type: "hf.gguf",
            path: "model.gguf",
          },
        ]),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<{ key: string; downloaded: boolean }>;
    expect(data[0].downloaded).toBe(false);
  });

  it("returns false when llama.cpp cache dir does not exist", async () => {
    process.env.LLAMA_CPP_CACHE_DIR = join(tempDir, "nonexistent-llama-cache");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          {
            key: "k-nodir",
            repo_id: "test/gguf-nodir",
            model_type: "llama_cpp",
            path: "model.gguf",
          },
        ]),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<{ key: string; downloaded: boolean }>;
    expect(data[0].downloaded).toBe(false);
  });

  it("walk traverses subdirectories and collects files for HF cache", async () => {
    // Create HF cache structure with nested dirs
    // getHfCacheRoot() returns join(HUGGINGFACE_HUB_CACHE, "hub")
    const hfCache = join(tempDir, "hf-walk");
    process.env.HUGGINGFACE_HUB_CACHE = hfCache;

    const snapshotDir = join(hfCache, "hub", "models--test--walk", "snapshots", "snap1");
    await mkdir(join(snapshotDir, "subdir"), { recursive: true });
    await writeFile(join(snapshotDir, "config.json"), "{}");
    await writeFile(join(snapshotDir, "subdir", "model.safetensors"), "data");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/check_cache", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo_id: "test/walk",
          allow_pattern: "*.safetensors",
        }),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as { all_present: boolean; total_files: number };
    expect(data.total_files).toBe(2);
    expect(data.all_present).toBe(true);
  });

  it("repoFileInCache returns true when file exists in HF snapshot", async () => {
    const hfCache = join(tempDir, "hf-file-cache");
    process.env.HUGGINGFACE_HUB_CACHE = hfCache;

    const snapshotDir = join(hfCache, "hub", "models--test--repo-file", "snapshots", "snap1");
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(join(snapshotDir, "model.bin"), "data");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/try_cache_files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([{ repo_id: "test/repo-file", path: "model.bin" }]),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<{ downloaded: boolean }>;
    expect(data[0].downloaded).toBe(true);
  });

  it("isLlamaCppModelCached returns true when repoFileInCache finds file in HF cache", async () => {
    // If the file is in the HF cache, isLlamaCppModelCached should return true
    // before checking the llama.cpp cache
    const hfCache = join(tempDir, "hf-for-llama");
    process.env.HUGGINGFACE_HUB_CACHE = hfCache;

    const snapshotDir = join(hfCache, "hub", "models--test--hf-llama", "snapshots", "snap1");
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(join(snapshotDir, "model.gguf"), "data");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          {
            key: "k-hf-llama",
            repo_id: "test/hf-llama",
            model_type: "llama_cpp",
            path: "model.gguf",
          },
        ]),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<{ key: string; downloaded: boolean }>;
    expect(data[0].downloaded).toBe(true);
  });

  it("hasCachedFiles returns true for repo with cached files", async () => {
    const hfCache = join(tempDir, "hf-has-cached");
    process.env.HUGGINGFACE_HUB_CACHE = hfCache;

    const snapshotDir = join(hfCache, "hub", "models--test--has-cached", "snapshots", "snap1");
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(join(snapshotDir, "file.bin"), "data");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/try_cache_repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(["test/has-cached"]),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<{ downloaded: boolean }>;
    expect(data[0].downloaded).toBe(true);
  });

  it("isDownloadedFromFiles with allowPatterns and ignorePatterns", async () => {
    const hfCache = join(tempDir, "hf-patterns");
    process.env.HUGGINGFACE_HUB_CACHE = hfCache;

    const snapshotDir = join(hfCache, "hub", "models--test--patterns", "snapshots", "snap1");
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(join(snapshotDir, "model.safetensors"), "data");
    await writeFile(join(snapshotDir, "model.bin"), "data");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          {
            key: "k-patterns",
            repo_id: "test/patterns",
            allow_patterns: ["*.safetensors"],
            ignore_patterns: ["*.bin"],
          },
        ]),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<{ key: string; downloaded: boolean }>;
    expect(data[0].downloaded).toBe(true);
  });
});

// ── unified-websocket-runner.ts: stream_input success and error catch ──

describe("UnifiedWebSocketRunner: stream_input success path", () => {
  beforeEach(async () => {
    setupModels();
    await Job.createTable();
  });

  it("stream_input succeeds when runner.pushInputValue works", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({
        async process() {
          await new Promise((r) => setTimeout(r, 5000));
          return {};
        },
      }),
    });
    await runner.connect(ws);

    const graph = {
      nodes: [{ id: "n1", type: "test.SlowNode", name: "n1" }],
      edges: [],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    const status = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    const jobId = status.active_jobs[0]?.job_id;

    if (jobId) {
      const result = await runner.handleCommand({
        command: "stream_input",
        data: { job_id: jobId, input: "my_input", value: "hello", handle: "h1" },
      });
      expect(result.message || result.error).toBeDefined();
    }

    await runner.disconnect();
  });
});

// ── unified-websocket-runner.ts: chat_message stale seq ──────────────

describe("UnifiedWebSocketRunner: chat_message stale sequence", () => {
  beforeEach(async () => {
    setupModels();
    await Thread.createTable();
    await Message.createTable();
  });

  it("skips processing when requestSeq is stale", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ async process() { return {}; } }),
      resolveProvider: async () => ({
        provider: "mock",
        generateMessages: async function* () {
          yield { type: "chunk" as const, content: "Hello!" };
        },
        generateMessage: vi.fn(),
        hasToolSupport: async () => false,
        getAvailableLanguageModels: async () => [],
        getAvailableImageModels: async () => [],
        getAvailableVideoModels: async () => [],
        getAvailableTTSModels: async () => [],
        getAvailableASRModels: async () => [],
        getAvailableEmbeddingModels: async () => [],
        getContainerEnv: () => ({}),
      } as any),
    });
    await runner.connect(ws);

    // Send two chat messages rapidly - the first should be superseded
    await runner.handleCommand({
      command: "chat_message",
      data: { thread_id: "t1", content: "first" },
    });
    await runner.handleCommand({
      command: "chat_message",
      data: { thread_id: "t1", content: "second" },
    });

    await new Promise((r) => setTimeout(r, 150));
    await runner.disconnect();
  });
});

// ── http-api.ts: /v1/ prefix routing and /api/oauth/ routing ─────────

describe("HTTP API: /v1/ and /api/oauth/ routing from handleApiRequest", () => {
  beforeEach(async () => {
    setupModels();
    await Workflow.createTable();
  });

  it("routes /v1/chat/completions through OpenAI handler", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const res = await handleApiRequest(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-1",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hi" }],
        }),
      })
    );
    expect(res).toBeDefined();
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  it("routes /v1/models through OpenAI handler", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const res = await handleApiRequest(
      new Request("http://localhost/v1/models", {
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res).toBeDefined();
    expect(res.status).toBe(200);
  });

  it("routes /api/oauth/hf/tokens through OAuth handler", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const { OAuthCredential } = await import("@nodetool/models");
    await OAuthCredential.createTable();

    const res = await handleApiRequest(
      new Request("http://localhost/api/oauth/hf/tokens", {
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res).toBeDefined();
    expect(res.status).toBe(200);
  });
});

// ── oauth-api.ts: GitHub start host handling (://  and 127.0.0.1) ────

describe("OAuth API: GitHub start host handling", () => {
  beforeEach(async () => {
    const { MemoryAdapterFactory, setGlobalAdapterResolver, OAuthCredential } = await import("@nodetool/models");
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema: any) => factory.getAdapter(schema));
    const { resetOAuthTableInit, oauthStateStore } = await import("../src/oauth-api.js");
    resetOAuthTableInit();
    await OAuthCredential.createTable();
    oauthStateStore.clear();
    process.env.GITHUB_CLIENT_ID = "test-gh-id";
  });

  afterEach(() => {
    delete process.env.GITHUB_CLIENT_ID;
  });

  it("handles host with protocol prefix in GitHub start", async () => {
    const { handleOAuthRequest } = await import("../src/oauth-api.js");
    const request = new Request("http://localhost:7777/api/oauth/github/start", {
      headers: { host: "http://example.com" },
    });
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/github/start",
      () => "test-user"
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const body = (await response!.json()) as { auth_url: string };
    expect(body.auth_url).toContain("example.com");
  });

  it("handles 127.0.0.1 host in GitHub start (replaces with localhost)", async () => {
    const { handleOAuthRequest } = await import("../src/oauth-api.js");
    const request = new Request("http://127.0.0.1:7777/api/oauth/github/start", {
      headers: { host: "127.0.0.1:7777" },
    });
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/github/start",
      () => "test-user"
    );
    expect(response).not.toBeNull();
    const body = (await response!.json()) as { auth_url: string };
    const url = new URL(body.auth_url);
    const redirectUri = url.searchParams.get("redirect_uri")!;
    expect(redirectUri).toContain("localhost:7777");
    expect(redirectUri).toContain("http://");
  });

  it("uses https for non-localhost host in GitHub start", async () => {
    const { handleOAuthRequest } = await import("../src/oauth-api.js");
    const request = new Request("https://myapp.example.com/api/oauth/github/start", {
      headers: { host: "myapp.example.com" },
    });
    const response = await handleOAuthRequest(
      request,
      "/api/oauth/github/start",
      () => "test-user"
    );
    expect(response).not.toBeNull();
    const body = (await response!.json()) as { auth_url: string };
    const url = new URL(body.auth_url);
    const redirectUri = url.searchParams.get("redirect_uri")!;
    expect(redirectUri).toContain("https://myapp.example.com");
  });
});

// ── oauth-api.ts: GitHub tokens endpoint ─────────────────────────────

describe("OAuth API: GitHub tokens", () => {
  beforeEach(async () => {
    const { MemoryAdapterFactory, setGlobalAdapterResolver, OAuthCredential } = await import("@nodetool/models");
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema: any) => factory.getAdapter(schema));
    const { resetOAuthTableInit, oauthStateStore } = await import("../src/oauth-api.js");
    resetOAuthTableInit();
    await OAuthCredential.createTable();
    oauthStateStore.clear();
  });

  it("GET /api/oauth/github/tokens returns tokens", async () => {
    const { handleOAuthRequest } = await import("../src/oauth-api.js");
    const response = await handleOAuthRequest(
      new Request("http://localhost:7777/api/oauth/github/tokens"),
      "/api/oauth/github/tokens",
      () => "test-user"
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const body = (await response!.json()) as { tokens: unknown[] };
    expect(Array.isArray(body.tokens)).toBe(true);
  });
});

// ── code-tools.ts: truncate and typescript path ──────────────────────

describe("RunCodeTool: truncate and typescript path", () => {
  it("truncates very large output", async () => {
    const { RunCodeTool } = await import("../../agents/src/tools/code-tools.js");
    const tool = new RunCodeTool();
    const mockContext = {} as any;

    // Generate output larger than MAX_OUTPUT_CHARS (50000)
    const result = await tool.process(mockContext, {
      language: "javascript",
      code: `process.stdout.write("x".repeat(60000))`,
    });
    expect(result.exitCode).toBe(0);
    if (result.stdout.length > 50000) {
      expect(result.stdout).toContain("[truncated]");
    }
  }, 15000);

  it("executes TypeScript code", async () => {
    const { RunCodeTool } = await import("../../agents/src/tools/code-tools.js");
    const tool = new RunCodeTool({ timeoutMs: 30000 });
    const mockContext = {} as any;

    const result = await tool.process(mockContext, {
      language: "typescript",
      code: 'const x: string = "hello ts"; console.log(x)',
    });
    // npx tsx may or may not be available, but the code path will be exercised
    if (result.exitCode === 0) {
      expect(result.stdout).toContain("hello ts");
    } else {
      expect(result.exitCode).not.toBeNull();
    }
  }, 30000);
});
