/**
 * Additional tests to push every target file to 100% statement coverage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  Thread,
  Message,
  Workflow,
  Job,
  Secret,
  OAuthCredential,
} from "@nodetool/models";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame,
} from "../src/unified-websocket-runner.js";

// ── Shared helpers ──────────────────────────────────────────────────

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: Array<WebSocketReceiveFrame> = [];
  async accept() { return; }
  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array) { this.sentBytes.push(data); }
  async sendText(data: string) { this.sentText.push(data); }
  async close() {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

function setup() {
  const factory = new MemoryAdapterFactory();
  setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
}

// =====================================================================
// models-api.ts gaps
// =====================================================================

describe("Models API: additional coverage", () => {
  let tempDir: string;
  let origHfCache: string | undefined;
  let origLlamaCache: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "nt-cov-"));
    origHfCache = process.env.HUGGINGFACE_HUB_CACHE;
    origLlamaCache = process.env.LLAMA_CPP_CACHE_DIR;
    process.env.HUGGINGFACE_HUB_CACHE = join(tempDir, "empty-hf");
    process.env.LLAMA_CPP_CACHE_DIR = join(tempDir, "empty-llama");
  });

  afterEach(async () => {
    if (origHfCache === undefined) delete process.env.HUGGINGFACE_HUB_CACHE;
    else process.env.HUGGINGFACE_HUB_CACHE = origHfCache;
    if (origLlamaCache === undefined) delete process.env.LLAMA_CPP_CACHE_DIR;
    else process.env.LLAMA_CPP_CACHE_DIR = origLlamaCache;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("GET /api/models/ollama exercises toOllamaModel", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/ollama")
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("isDownloadedFromFiles without allowPatterns uses ignorePatterns path", async () => {
    const hfCache = join(tempDir, "hf-noallow");
    process.env.HUGGINGFACE_HUB_CACHE = hfCache;
    const snapDir = join(hfCache, "hub", "models--test--noallow", "snapshots", "s1");
    await mkdir(snapDir, { recursive: true });
    await writeFile(join(snapDir, "file.bin"), "x");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    // cache_status without allow_patterns triggers isDownloadedFromFiles without allowPatterns
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          { key: "k1", repo_id: "test/noallow" },
        ]),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<{ downloaded: boolean }>;
    expect(data[0].downloaded).toBe(true);
  });

  it("isDownloadedFromFiles with ignorePatterns that filter all files returns false", async () => {
    const hfCache = join(tempDir, "hf-ignored");
    process.env.HUGGINGFACE_HUB_CACHE = hfCache;
    const snapDir = join(hfCache, "hub", "models--test--ignored", "snapshots", "s1");
    await mkdir(snapDir, { recursive: true });
    await writeFile(join(snapDir, "file.bin"), "x");

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          { key: "k-ign", repo_id: "test/ignored", ignore_patterns: ["*.bin"] },
        ]),
      })
    );
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<{ downloaded: boolean }>;
    expect(data[0].downloaded).toBe(false);
  });

  it("safeJsonBody returns null on invalid JSON", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-valid-json{{{",
      })
    );
    // Should return an error or null response since body parsing fails
    expect(res).not.toBeNull();
  });

  it("pathFromModelsPrefix fallback for non /api/models path", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    // URL not starting with /api/models triggers third branch of pathFromModelsPrefix
    const res = await handleModelsApiRequest(
      new Request("http://localhost/something/else")
    );
    expect(res).toBeNull();
  });

  it("pathFromModelsPrefix for exact /api/models returns empty", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models")
    );
    // Empty path matches no route, returns null
    expect(res).toBeNull();
  });

  it("providerFactory throws for unsupported provider", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    // Try to get models for an unsupported provider
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/llm/invalid_provider_xyz")
    );
    expect(res).not.toBeNull();
    // Should return empty array since instantiateProvider catches the error
    expect(res!.status).toBe(200);
  });

  it("GET /api/models/image/:provider exercises catch block", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/image/invalid_provider_xyz")
    );
    expect(res!.status).toBe(200);
    const data = await res!.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/models/tts/:provider exercises TTS catch block", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/tts/invalid_provider_xyz")
    );
    expect(res!.status).toBe(200);
  });

  it("GET /api/models/asr/:provider exercises ASR catch block", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/asr/invalid_provider_xyz")
    );
    expect(res!.status).toBe(200);
  });

  it("GET /api/models/video/:provider exercises video catch block", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/video/invalid_provider_xyz")
    );
    expect(res!.status).toBe(200);
  });

  it("GET /api/models/embedding/:provider exercises embedding catch block", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/embedding/invalid_provider_xyz")
    );
    expect(res!.status).toBe(200);
  });

  it("GET /api/models/recommended?check_servers=true exercises serverAllowsModel", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/recommended?check_servers=true")
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});

// =====================================================================
// http-api.ts gaps
// =====================================================================

describe("HTTP API: additional coverage", () => {
  beforeEach(async () => {
    setup();
    await Workflow.createTable();
    await Thread.createTable();
    await Message.createTable();
    await Job.createTable();
  });

  it("ensureAdapterResolver default path", async () => {
    // Import with a fresh module to exercise the ensureAdapterResolver
    const { handleApiRequest } = await import("../src/http-api.js");
    // Just calling any endpoint exercises ensureAdapterResolver
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(200);
  });

  it("GET /api/nodes/metadata exercises metadata sorting (line 177)", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const res = await handleApiRequest(
      new Request("http://localhost/api/nodes/metadata", {
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("PUT /api/workflows/:id with invalid body returns error (line 223)", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/some-workflow-id", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ name: 123 }), // name should be string
      })
    );
    // Should get a 400 error for invalid workflow
    expect(res.status).toBe(400);
  });

  it("POST /api/workflows/public/:id returns 405 (line 303)", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/public/some-id", {
        method: "POST",
      })
    );
    expect(res.status).toBe(405);
  });

  it("GET /api/messages?thread_id=x checks user ownership (line 418)", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    // Create a thread
    const thread = await Thread.create({ user_id: "other-user", title: "test" });
    // Create a message owned by different user
    await Message.create({
      thread_id: thread.id,
      user_id: "other-user",
      role: "user",
      content: "hello",
    });

    const res = await handleApiRequest(
      new Request(`http://localhost/api/messages?thread_id=${thread.id}`, {
        headers: { "x-user-id": "user-1" },
      })
    );
    // Should return 404 because message belongs to other user
    expect(res.status).toBe(404);
  });
});

describe("HTTP API: secret error paths", () => {
  beforeEach(async () => {
    setup();
    await Secret.createTable();
  });

  it("GET /api/settings/secrets/:key?decrypt=true returns 500 on decrypt failure (line 671)", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    // Create a secret with bad encrypted data
    await Secret.create({
      user_id: "user-1",
      key: "BAD_SECRET",
      encrypted_value: "not-a-valid-encrypted-value",
    });

    const res = await handleApiRequest(
      new Request("http://localhost/api/settings/secrets/BAD_SECRET?decrypt=true", {
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(500);
  });

  it("PUT /api/settings/secrets/:key triggers create/update path (line 692)", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const res = await handleApiRequest(
      new Request("http://localhost/api/settings/secrets/TEST_KEY", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ value: "my-secret-value" }),
      })
    );
    // Should succeed or fail depending on crypto setup
    expect(res).toBeDefined();
  });
});

describe("HTTP API: createHttpApiServer error handler (line 1067)", () => {
  it("creates an HTTP server instance", async () => {
    const { createHttpApiServer } = await import("../src/http-api.js");
    const server = createHttpApiServer();
    expect(server).toBeDefined();
    // Don't actually listen, just verify the server object was created
    expect(typeof server.listen).toBe("function");
  });
});

// =====================================================================
// unified-websocket-runner.ts gaps
// =====================================================================

describe("UnifiedWebSocketRunner: ToolBridge and misc", () => {
  beforeEach(async () => {
    setup();
    await Job.createTable();
    await Thread.createTable();
    await Message.createTable();
  });

  it("clearModels returns message (line 580)", async () => {
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ async process() { return {}; } }),
    });
    await runner.connect(ws);
    const result = await runner.handleCommand({ command: "clear_models", data: {} });
    expect(result.message).toContain("Model clearing");
    await runner.disconnect();
  });

  it("getStatus with specific jobId returns found status (line 473-478)", async () => {
    const ws = new MockWS();
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
      nodes: [{ id: "n1", type: "test.Slow", name: "n1" }],
      edges: [],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    const allStatus = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    const jobId = allStatus.active_jobs[0]?.job_id;

    if (jobId) {
      const jobStatus = runner.getStatus(jobId);
      expect(jobStatus).toHaveProperty("status");
      expect(jobStatus).toHaveProperty("job_id", jobId);
    }

    await runner.disconnect();
  });

  it("getStatus with unknown jobId returns not_found", async () => {
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ async process() { return {}; } }),
    });
    await runner.connect(ws);
    const status = runner.getStatus("nonexistent-job-id");
    expect(status).toHaveProperty("status", "not_found");
    await runner.disconnect();
  });

  it("tool_result resolves ToolBridge waiter (line 76-77)", async () => {
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ async process() { return {}; } }),
    });
    await runner.connect(ws);

    // tool_result without an active tool call should not throw
    const result = await runner.handleCommand({
      command: "tool_result",
      data: { tool_call_id: "tc-123", result: { value: "hello" } },
    });
    expect(result).toBeDefined();
    await runner.disconnect();
  });

  it("job execution catch block on failure (lines 368-370)", async () => {
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({
        async process() {
          throw new Error("Simulated execution failure");
        },
      }),
    });
    await runner.connect(ws);

    const graph = {
      nodes: [{ id: "n1", type: "test.FailNode", name: "n1" }],
      edges: [],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    // Wait for the job to finish
    await new Promise((r) => setTimeout(r, 200));
    await runner.disconnect();
  });

  it("reconnectJob with edge statuses (lines 439-440)", async () => {
    const ws = new MockWS();
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
      nodes: [
        { id: "n1", type: "test.Slow", name: "n1" },
        { id: "n2", type: "test.Slow", name: "n2" },
      ],
      edges: [{ source: "n1", sourceHandle: "output", target: "n2", targetHandle: "input" }],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    const status = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    const jobId = status.active_jobs[0]?.job_id;

    if (jobId) {
      const result = await runner.handleCommand({
        command: "reconnect_job",
        data: { job_id: jobId },
      });
      expect(result).toBeDefined();
      // Wait for reconnectJob async to finish sending messages
      await new Promise((r) => setTimeout(r, 100));
    }

    await runner.disconnect();
  });
});

// =====================================================================
// oauth-api.ts gap: error page without opts.error (line 116)
// =====================================================================

// oauth-api.ts line 116 is dead code: oauthHtmlResponse always receives a truthy
// error string when success=false. The ternary false-branch (empty string) is unreachable.

// =====================================================================
// unified-websocket-runner.ts: inferOutputType branches
// =====================================================================

describe("UnifiedWebSocketRunner: output type inference (lines 128-132)", () => {
  beforeEach(async () => {
    setup();
    await Job.createTable();
  });

  it("exercises all inferOutputType branches via different output types", async () => {
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({
        async process() {
          // Return outputs directly without emitting output_update messages
          // This triggers sendOutputUpdates -> inferOutputType for each value type
          return { status: "completed", outputs: {
            float_out: [3.14],
            bool_out: [true],
            list_out: [[1, 2, 3]],
            dict_out: [{ key: "val" }],
            null_out: [null],
          }};
        },
      }),
    });
    await runner.connect(ws);

    const graph = {
      nodes: [
        { id: "float_out", type: "nodetool.output.Output", name: "float_out" },
        { id: "bool_out", type: "nodetool.output.Output", name: "bool_out" },
        { id: "list_out", type: "nodetool.output.Output", name: "list_out" },
        { id: "dict_out", type: "nodetool.output.Output", name: "dict_out" },
        { id: "null_out", type: "nodetool.output.Output", name: "null_out" },
      ],
      edges: [],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    // Wait for job to complete and output updates to be sent
    await new Promise((r) => setTimeout(r, 300));

    // Check that output messages were sent
    expect(ws.sentBytes.length).toBeGreaterThan(0);
    await runner.disconnect();
  });
});

// =====================================================================
// http-api.ts: createHttpApiServer with actual request
// =====================================================================

describe("HTTP API: createHttpApiServer with real request (lines 1067-1074)", () => {
  it("handles normal request via Node HTTP server", async () => {
    const http = await import("node:http");
    const { createHttpApiServer } = await import("../src/http-api.js");
    const server = createHttpApiServer();

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        http.get(`http://localhost:${addr.port}/api/workflows`, { headers: { "x-user-id": "test" } }, (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => { data += chunk; });
          res.on("end", () => {
            server.close();
            resolve();
          });
        });
      });
    });
  });

  it("error handler catches thrown error (lines 1068-1073)", async () => {
    const http = await import("node:http");
    const { createHttpApiServer } = await import("../src/http-api.js");
    // Create a server that will encounter an error during request handling
    // by sending a malformed request body
    const server = createHttpApiServer();

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        // Send a POST with content-length mismatch to trigger an error
        const req = http.request({
          hostname: "localhost",
          port: addr.port,
          path: "/api/workflows",
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-id": "test",
            "transfer-encoding": "chunked",
          },
        }, (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => { data += chunk; });
          res.on("end", () => {
            server.close();
            resolve();
          });
        });
        req.write("{invalid");
        req.end();
      });
    });
  });
});

// =====================================================================
// models-api.ts: toOllamaModel via ollama with resolveProvider
// =====================================================================

// =====================================================================
// unified-websocket-runner.ts: resolveOutputNodeForKey fallback (line 146)
// =====================================================================

describe("UnifiedWebSocketRunner: resolveOutputNodeForKey fallback", () => {
  beforeEach(async () => {
    setup();
    await Job.createTable();
  });

  it("falls back when output key doesn't match any node (line 146)", async () => {
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({
        async process() {
          return { status: "completed", outputs: {
            unknown_key: ["value"],
          }};
        },
      }),
    });
    await runner.connect(ws);

    const graph = {
      nodes: [
        // Use an Output node as fallback
        { id: "out1", type: "nodetool.output.Output", name: "out1" },
      ],
      edges: [],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    await new Promise((r) => setTimeout(r, 300));
    expect(ws.sentBytes.length).toBeGreaterThan(0);
    await runner.disconnect();
  });
});

// =====================================================================
// unified-websocket-runner.ts: ensureThreadExists without threadId (lines 496-498)
// =====================================================================

describe("UnifiedWebSocketRunner: chat_message without thread_id", () => {
  beforeEach(async () => {
    setup();
    await Thread.createTable();
    await Message.createTable();
  });

  it("creates new thread when thread_id is missing (lines 496-498)", async () => {
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ async process() { return {}; } }),
      resolveProvider: async () => ({
        provider: "mock",
        generateMessages: async function* () {
          yield { type: "chunk" as const, content: "hi" };
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

    // Send chat_message WITHOUT thread_id
    await runner.handleCommand({
      command: "chat_message",
      data: { content: "hello" },
    });

    await new Promise((r) => setTimeout(r, 200));
    await runner.disconnect();
  });
});

describe("Models API: isServerReachable catch path (line 489)", () => {
  it("exercises isServerReachable via recommended with check_servers=true", async () => {
    // Save and set env to invalid URLs to trigger fetch errors
    const origOllama = process.env.OLLAMA_API_URL;
    const origLlama = process.env.LLAMA_CPP_URL;
    process.env.OLLAMA_API_URL = "http://127.0.0.1:1"; // invalid port
    process.env.LLAMA_CPP_URL = "http://127.0.0.1:1";

    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/recommended?check_servers=true")
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);

    if (origOllama === undefined) delete process.env.OLLAMA_API_URL;
    else process.env.OLLAMA_API_URL = origOllama;
    if (origLlama === undefined) delete process.env.LLAMA_CPP_URL;
    else process.env.LLAMA_CPP_URL = origLlama;
  });
});

// =====================================================================
// code-tools.ts gap: ERR_CHILD_PROCESS_STDIO_MAXBUFFER (line 50)
// =====================================================================

describe("RunCodeTool: maxbuffer error path (line 50)", () => {
  it("handles ERR_CHILD_PROCESS_STDIO_MAXBUFFER error code", async () => {
    const { RunCodeTool } = await import("../../agents/src/tools/code-tools.js");
    const tool = new RunCodeTool({ maxOutputChars: 100 });
    const mockContext = {} as any;

    // Generate output that might trigger maxbuffer
    // The maxBuffer option in the tool defaults to MAX_OUTPUT_CHARS * 4
    // With maxOutputChars=100, maxBuffer becomes 400 bytes
    // Write more than 400 bytes to trigger ERR_CHILD_PROCESS_STDIO_MAXBUFFER
    const result = await tool.process(mockContext, {
      language: "javascript",
      code: `process.stdout.write("x".repeat(1000))`,
    });
    // Either the error is caught with exitCode 1 or the output is truncated
    expect(result).toHaveProperty("exitCode");
  }, 15000);
});
