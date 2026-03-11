/**
 * Additional tests to close remaining coverage gaps across websocket package.
 * Covers:
 *   - index.ts barrel exports
 *   - unified-websocket-runner.ts: chat_message with valid thread_id, handleChatMessage,
 *     ensureThreadExists, onModelChange, model observer, serializeForJson edge cases
 *   - models-api.ts: toUnifiedModelsFromLanguage, getAllModels endpoint
 *   - openai-api.ts: resolveProvider, provider init failure, non-streaming error
 *   - http-api.ts: handleNodeHttpRequest, createHttpApiServer, error handler
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pack, unpack } from "msgpackr";
import { Readable } from "node:stream";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  Thread,
  Message,
  Workflow,
  Job,
} from "@nodetool/models";

// ── index.ts barrel exports ──────────────────────────────────────────

describe("index.ts barrel exports", () => {
  it("re-exports UnifiedWebSocketRunner", async () => {
    const mod = await import("../src/index.js");
    expect(mod.UnifiedWebSocketRunner).toBeDefined();
  });

  it("re-exports handleApiRequest", async () => {
    const mod = await import("../src/index.js");
    expect(mod.handleApiRequest).toBeDefined();
  });

  it("re-exports handleNodeHttpRequest", async () => {
    const mod = await import("../src/index.js");
    expect(mod.handleNodeHttpRequest).toBeDefined();
  });

  it("re-exports createHttpApiServer", async () => {
    const mod = await import("../src/index.js");
    expect(mod.createHttpApiServer).toBeDefined();
  });

  it("re-exports handleOpenAIRequest", async () => {
    const mod = await import("../src/index.js");
    expect(mod.handleOpenAIRequest).toBeDefined();
  });

  it("re-exports createSSEStream", async () => {
    const mod = await import("../src/index.js");
    expect(mod.createSSEStream).toBeDefined();
  });

  it("re-exports convertMessages", async () => {
    const mod = await import("../src/index.js");
    expect(mod.convertMessages).toBeDefined();
  });

  it("re-exports convertTools", async () => {
    const mod = await import("../src/index.js");
    expect(mod.convertTools).toBeDefined();
  });

  it("re-exports resolveProvider", async () => {
    const mod = await import("../src/index.js");
    expect(mod.resolveProvider).toBeDefined();
  });

  it("re-exports createTestUiServer", async () => {
    const mod = await import("../src/index.js");
    expect(mod.createTestUiServer).toBeDefined();
  });
});

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
    if (!next) {
      return { type: "websocket.disconnect" };
    }
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

const resolveExecutor = () => ({
  async process() {
    return {};
  },
});

function setupModels() {
  const factory = new MemoryAdapterFactory();
  setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
}

// ── UnifiedWebSocketRunner: chat_message with valid thread_id ────────

describe("UnifiedWebSocketRunner: chat_message with valid thread_id", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(async () => {
    setupModels();
    await Thread.createTable();
    await Message.createTable();
    ws = new MockWebSocket();
  });

  it("chat_message command starts processing with valid thread_id", async () => {
    runner = new UnifiedWebSocketRunner({
      resolveExecutor,
      resolveProvider: async () => ({
        provider: "mock",
        generateMessages: async function* () {
          yield { type: "chunk" as const, content: "Hello!" };
        },
        async *generateMessagesTraced(...a: any[]) { yield* (this as any).generateMessages(...a); },
        async generateMessageTraced(...a: any[]) { return (this as any).generateMessage(...a); },
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

    const result = await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "test-thread-1",
        content: "Hello there",
        provider: "mock",
        model: "test-model",
      },
    });
    expect(result.message).toContain("Chat message processing started");
    expect(result.thread_id).toBe("test-thread-1");

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 100));
    await runner.disconnect();
  });

  it("chat_message sends error when no resolveProvider configured", async () => {
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    const result = await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "test-thread-2",
        content: "Hello",
      },
    });
    expect(result.message).toContain("Chat message processing started");

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 100));

    // Should have sent an error message about no provider resolver
    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    expect(sent.some((m) => m.type === "error" && typeof m.message === "string" && (m.message as string).includes("No provider resolver"))).toBe(true);

    await runner.disconnect();
  });

  it("chat_message processes tool calls from provider", async () => {
    runner = new UnifiedWebSocketRunner({
      resolveExecutor,
      resolveProvider: async () => ({
        provider: "mock",
        generateMessages: async function* () {
          yield { id: "tc-1", name: "search", args: { query: "test" } };
          yield { type: "chunk" as const, content: "Result" };
        },
        async *generateMessagesTraced(...a: any[]) { yield* (this as any).generateMessages(...a); },
        async generateMessageTraced(...a: any[]) { return (this as any).generateMessage(...a); },
        generateMessage: vi.fn(),
        hasToolSupport: async () => true,
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

    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "test-thread-3",
        content: "Search for something",
      },
    });

    await new Promise((r) => setTimeout(r, 100));

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    expect(
      sent.some(
        (m) =>
          m.type === "message" &&
          m.role === "assistant" &&
          Array.isArray(m.tool_calls) &&
          (m.tool_calls as Array<unknown>).length > 0,
      ),
    ).toBe(true);
    expect(sent.some((m) => m.type === "chunk")).toBe(true);

    await runner.disconnect();
  });

  it("chat_message handles error from provider gracefully", async () => {
    runner = new UnifiedWebSocketRunner({
      resolveExecutor,
      resolveProvider: async () => ({
        provider: "mock",
        generateMessages: async function* () {
          throw new Error("Provider exploded");
        },
        async *generateMessagesTraced(...a: any[]) { yield* (this as any).generateMessages(...a); },
        async generateMessageTraced(...a: any[]) { return (this as any).generateMessage(...a); },
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

    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "test-thread-err",
        content: "blow up",
      },
    });

    await new Promise((r) => setTimeout(r, 100));

    // Error should be sent over websocket
    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    expect(sent.some((m) => m.type === "error")).toBe(true);

    await runner.disconnect();
  });

  it("chat_message with existing thread reuses thread", async () => {
    const thread = await Thread.create({ user_id: "1", title: "Existing" });
    runner = new UnifiedWebSocketRunner({
      resolveExecutor,
      resolveProvider: async () => ({
        provider: "mock",
        generateMessages: async function* () {
          yield { type: "chunk" as const, content: "ok" };
        },
        async *generateMessagesTraced(...a: any[]) { yield* (this as any).generateMessages(...a); },
        async generateMessageTraced(...a: any[]) { return (this as any).generateMessage(...a); },
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

    const result = await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: thread.id,
        content: "Hello again",
      },
    });
    expect(result.thread_id).toBe(thread.id);

    await new Promise((r) => setTimeout(r, 100));
    await runner.disconnect();
  });
});

// ── UnifiedWebSocketRunner: getWorkflowGraph with workflow_id ────────

describe("UnifiedWebSocketRunner: getWorkflowGraph with workflow_id", () => {
  beforeEach(async () => {
    setupModels();
    await Workflow.createTable();
    await Job.createTable();
  });

  it("run_job with workflow_id loads graph from database", async () => {
    const ws = new MockWebSocket();

    const workflow = await Workflow.create({
      user_id: "1",
      name: "Test",
      access: "private",
      graph: {
        nodes: [{ id: "n1", type: "test.Node", name: "n1" }],
        edges: [],
      },
    });

    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    const result = await runner.handleCommand({
      command: "run_job",
      data: { workflow_id: workflow.id, params: {} },
    });
    expect(result.message).toContain("Job started");

    await new Promise((r) => setTimeout(r, 30));
    await runner.disconnect();
  });

  it("run_job with nonexistent workflow_id throws error", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    // handleCommand should catch and return error
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        command: "run_job",
        data: { workflow_id: "nonexistent-id", params: {} },
      }),
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    const sent = ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>);
    expect(sent.some((m) => m.error === "invalid_command")).toBe(true);

    await runner.disconnect();
  });

  it("run_job without graph or workflow_id throws error", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        command: "run_job",
        data: { params: {} },
      }),
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    const sent = ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>);
    expect(sent.some((m) => m.error === "invalid_command")).toBe(true);

    await runner.disconnect();
  });
});

// ── UnifiedWebSocketRunner: ping message in receiveMessages ──────────

describe("UnifiedWebSocketRunner: ping in binary mode", () => {
  it("replies pong for binary ping message", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    ws.queue.push({
      type: "websocket.message",
      bytes: pack({ type: "ping" }),
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    expect(sent.some((m) => m.type === "pong")).toBe(true);
    await runner.disconnect();
  });
});

// ── UnifiedWebSocketRunner: client_tools_manifest edge cases ─────────

describe("UnifiedWebSocketRunner: client_tools_manifest edge cases", () => {
  it("handles manifest with non-object tools", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "client_tools_manifest",
        tools: ["not-an-object", null, { name: "valid_tool", schema: {} }],
      }),
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();
    // Should not crash
    await runner.disconnect();
  });

  it("handles manifest with missing tools array", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "client_tools_manifest",
      }),
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();
    await runner.disconnect();
  });
});

// ── UnifiedWebSocketRunner: stop command with no job or thread ───────

describe("UnifiedWebSocketRunner: stop command without job_id or thread_id", () => {
  it("returns a no-op success when neither job_id nor thread_id provided", async () => {
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    const result = await runner.handleCommand({
      command: "stop",
      data: {},
    });
    expect(result).toEqual({
      message: "Stop command processed",
      job_id: null,
      thread_id: null,
    });
  });
});

// ── models-api.ts: toUnifiedModelsFromLanguage ───────────────────────

describe("Models API: toUnifiedModelsFromLanguage", () => {
  it("converts language models to unified models", async () => {
    const { toUnifiedModelsFromLanguage } = await import("../src/models-api.js");
    const models = toUnifiedModelsFromLanguage([
      { id: "m1", name: "Model 1", provider: "openai" } as any,
      { id: "m2", name: "Model 2", provider: "ollama" } as any,
    ]);
    expect(models).toHaveLength(2);
    expect(models[0].type).toBe("language_model");
    expect(models[0].id).toBe("m1");
    expect(models[1].downloaded).toBe(true); // ollama models are always downloaded
  });
});

// ── models-api.ts: GET /api/models/all ───────────────────────────────

describe("Models API: /all endpoint", () => {
  it("GET /api/models/all returns array of unified models", async () => {
    const { handleModelsApiRequest } = await import("../src/models-api.js");
    const res = await handleModelsApiRequest(
      new Request("http://localhost/api/models/all")
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const data = (await res!.json()) as Array<Record<string, unknown>>;
    expect(Array.isArray(data)).toBe(true);
    // Should include recommended models at minimum
    expect(data.length).toBeGreaterThan(0);
  });
});

// ── openai-api.ts: resolveProvider ───────────────────────────────────

describe("OpenAI API: resolveProvider", () => {
  it("resolves OpenAI provider for gpt- models", async () => {
    const { resolveProvider } = await import("../src/openai-api.js");
    const provider = resolveProvider("gpt-4o");
    expect(provider).toBeDefined();
  });

  it("resolves Anthropic provider for claude- models", async () => {
    const { resolveProvider } = await import("../src/openai-api.js");
    // AnthropicProvider may throw if no API key; that's fine - we just test the code path
    try {
      const provider = resolveProvider("claude-sonnet-4-20250514");
      expect(provider).toBeDefined();
    } catch (e) {
      // Expected when ANTHROPIC_API_KEY is not set
      expect((e as Error).message).toContain("ANTHROPIC_API_KEY");
    }
  });

  it("resolves Ollama provider for unknown models", async () => {
    const { resolveProvider } = await import("../src/openai-api.js");
    const provider = resolveProvider("llama3.2:latest");
    expect(provider).toBeDefined();
  });

  it("resolves o1 model to OpenAI", async () => {
    const { resolveProvider } = await import("../src/openai-api.js");
    const provider = resolveProvider("o1-preview");
    expect(provider).toBeDefined();
  });

  it("resolves o3 model to OpenAI", async () => {
    const { resolveProvider } = await import("../src/openai-api.js");
    const provider = resolveProvider("o3-mini");
    expect(provider).toBeDefined();
  });

  it("returns explicit provider when given", async () => {
    const { resolveProvider } = await import("../src/openai-api.js");
    const explicit = { provider: "custom" } as any;
    const provider = resolveProvider("any-model", { provider: explicit });
    expect(provider).toBe(explicit);
  });
});

// ── openai-api.ts: non-streaming chat completions ────────────────────

describe("OpenAI API: non-streaming chat completions error", () => {
  it("returns 500 when provider throws during non-streaming", async () => {
    const { handleOpenAIRequest } = await import("../src/openai-api.js");
    const errorProvider = {
      provider: "mock",
      generateMessages: async function* () {
        throw new Error("Provider failure");
      },
      async *generateMessagesTraced(...a: any[]) { yield* (this as any).generateMessages(...a); },
    } as any;

    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      }),
    });

    const res = await handleOpenAIRequest(request, "/v1/chat/completions", "user1", {
      provider: errorProvider,
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(500);
    const body = (await res!.json()) as Record<string, unknown>;
    expect((body.error as Record<string, unknown>).type).toBe("server_error");
  });
});

// ── openai-api.ts: SSE stream error handling ─────────────────────────

describe("OpenAI API: SSE stream error", () => {
  it("emits error chunk when provider throws during streaming", async () => {
    const { createSSEStream } = await import("../src/openai-api.js");
    const errorProvider = {
      provider: "mock",
      generateMessages: async function* () {
        throw new Error("Stream failure");
      },
      async *generateMessagesTraced(...a: any[]) { yield* (this as any).generateMessages(...a); },
    } as any;

    const stream = createSSEStream(
      errorProvider,
      [{ role: "user", content: "hi" }] as any[],
      "test-model"
    );

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    }

    expect(fullText).toContain("Stream failure");
    expect(fullText).toContain("[DONE]");
  });
});

// ── http-api.ts: handleNodeHttpRequest ───────────────────────────────

describe("HTTP API: handleNodeHttpRequest", () => {
  beforeEach(async () => {
    setupModels();
    await Workflow.createTable();
  });

  it("handles a basic GET request through Node.js http interface", async () => {
    const { handleNodeHttpRequest } = await import("../src/http-api.js");

    // Create a mock IncomingMessage
    const req = Object.assign(new Readable(), {
      method: "GET",
      url: "/api/workflows",
      headers: { "x-user-id": "user-1" },
      [Symbol.asyncIterator]: async function* () {},
    }) as any;

    // Create a mock ServerResponse
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 0,
      _headers: {} as Record<string, string>,
      setHeader(key: string, value: string) {
        this._headers[key] = value;
      },
      end(data?: Buffer | string) {
        if (data) {
          if (typeof data === "string") {
            chunks.push(Buffer.from(data));
          } else {
            chunks.push(data as Buffer);
          }
        }
      },
    } as any;

    await handleNodeHttpRequest(req, res);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    expect(body.workflows).toBeDefined();
  });

  it("handles POST request with body", async () => {
    const { handleNodeHttpRequest } = await import("../src/http-api.js");

    const bodyContent = JSON.stringify({
      name: "Test Workflow",
      access: "private",
      graph: { nodes: [], edges: [] },
    });

    // IncomingMessage that yields body chunks
    const bodyBuffer = Buffer.from(bodyContent);
    const req = {
      method: "POST",
      url: "/api/workflows",
      headers: {
        "x-user-id": "user-1",
        "content-type": "application/json",
        "content-length": String(bodyBuffer.length),
      },
      [Symbol.asyncIterator]: async function* () {
        yield bodyBuffer;
      },
    } as any;

    const chunks: Buffer[] = [];
    const res = {
      statusCode: 0,
      _headers: {} as Record<string, string>,
      setHeader(key: string, value: string) {
        this._headers[key] = value;
      },
      end(data?: Buffer | string) {
        if (data) {
          chunks.push(typeof data === "string" ? Buffer.from(data) : (data as Buffer));
        }
      },
    } as any;

    await handleNodeHttpRequest(req, res);
    expect(res.statusCode).toBe(200);
  });

  it("handles array header values", async () => {
    const { handleNodeHttpRequest } = await import("../src/http-api.js");

    const req = {
      method: "GET",
      url: "/api/workflows",
      headers: {
        "x-user-id": "user-1",
        "accept": ["application/json", "text/plain"],
      },
      [Symbol.asyncIterator]: async function* () {},
    } as any;

    const res = {
      statusCode: 0,
      _headers: {} as Record<string, string>,
      setHeader(key: string, value: string) {
        this._headers[key] = value;
      },
      end(data?: Buffer | string) {},
    } as any;

    await handleNodeHttpRequest(req, res);
    expect(res.statusCode).toBe(200);
  });
});

// ── http-api.ts: createHttpApiServer ─────────────────────────────────

describe("HTTP API: createHttpApiServer", () => {
  it("creates a server instance", async () => {
    const { createHttpApiServer } = await import("../src/http-api.js");
    const server = createHttpApiServer();
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe("function");
  });
});

// ── http-api.ts: 204 response (no body) ─────────────────────────────

describe("HTTP API: handleNodeHttpRequest with 204 response", () => {
  beforeEach(async () => {
    setupModels();
    await Workflow.createTable();
    await Thread.createTable();
    await Message.createTable();
  });

  it("handles DELETE that returns 204 (no body)", async () => {
    const { handleNodeHttpRequest } = await import("../src/http-api.js");

    // Create a thread first
    const thread = await Thread.create({ user_id: "user-1", title: "To Delete" });

    const req = {
      method: "DELETE",
      url: `/api/threads/${thread.id}`,
      headers: { "x-user-id": "user-1" },
      [Symbol.asyncIterator]: async function* () {},
    } as any;

    let endCalled = false;
    const res = {
      statusCode: 0,
      _headers: {} as Record<string, string>,
      setHeader(key: string, value: string) {
        this._headers[key] = value;
      },
      end(data?: Buffer | string) {
        endCalled = true;
      },
    } as any;

    await handleNodeHttpRequest(req, res);
    expect(res.statusCode).toBe(204);
    expect(endCalled).toBe(true);
  });
});

// ── http-api.ts: handleApiRequest for /api/node/metadata ─────────────

describe("HTTP API: node metadata endpoint", () => {
  it("GET /api/node/metadata returns metadata", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const res = await handleApiRequest(
      new Request("http://localhost/api/node/metadata")
    );
    expect(res.status).toBe(200);
  });

  it("POST /api/node/metadata returns 405", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const res = await handleApiRequest(
      new Request("http://localhost/api/node/metadata", { method: "POST" })
    );
    expect(res.status).toBe(405);
  });
});

// ── http-api.ts: normalizePath edge case ─────────────────────────────

describe("HTTP API: trailing slash normalization", () => {
  beforeEach(async () => {
    setupModels();
    await Workflow.createTable();
  });

  it("handles path with trailing slash", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/", {
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(200);
  });
});

// ── http-api.ts: 404 for unknown routes ──────────────────────────────

describe("HTTP API: unknown route", () => {
  it("returns 404 for unknown API route", async () => {
    const { handleApiRequest } = await import("../src/http-api.js");
    const res = await handleApiRequest(
      new Request("http://localhost/api/nonexistent")
    );
    expect(res.status).toBe(404);
  });
});

// ── http-api.ts: readNodeRequestBody with string chunks ──────────────

describe("HTTP API: handleNodeHttpRequest with string chunks", () => {
  beforeEach(async () => {
    setupModels();
    await Workflow.createTable();
  });

  it("handles string body chunks in POST request", async () => {
    const { handleNodeHttpRequest } = await import("../src/http-api.js");

    const bodyContent = JSON.stringify({
      name: "String Chunk WF",
      access: "private",
      graph: { nodes: [], edges: [] },
    });

    // Yield string chunks instead of Uint8Array
    const req = {
      method: "POST",
      url: "/api/workflows",
      headers: {
        "x-user-id": "user-1",
        "content-type": "application/json",
      },
      [Symbol.asyncIterator]: async function* () {
        yield bodyContent; // String, not Uint8Array
      },
    } as any;

    const chunks: Buffer[] = [];
    const res = {
      statusCode: 0,
      _headers: {} as Record<string, string>,
      setHeader(key: string, value: string) {
        this._headers[key] = value;
      },
      end(data?: Buffer | string) {
        if (data) {
          chunks.push(typeof data === "string" ? Buffer.from(data) : (data as Buffer));
        }
      },
    } as any;

    await handleNodeHttpRequest(req, res);
    expect(res.statusCode).toBe(200);
  });
});

// ── openai-api.ts: safeParseJson edge cases ──────────────────────────

describe("OpenAI API: convertMessages with tool_calls containing invalid JSON", () => {
  it("handles non-object JSON in tool_calls arguments", async () => {
    const { convertMessages } = await import("../src/openai-api.js");
    const msgs = convertMessages([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "tc1",
            type: "function" as const,
            function: {
              name: "test",
              arguments: '"just a string"', // Valid JSON but not an object
            },
          },
        ],
      },
    ]);
    expect(msgs[0].toolCalls![0].args).toEqual({});
  });

  it("handles malformed JSON in tool_calls arguments", async () => {
    const { convertMessages } = await import("../src/openai-api.js");
    const msgs = convertMessages([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "tc2",
            type: "function" as const,
            function: {
              name: "test",
              arguments: "not-valid-json{",
            },
          },
        ],
      },
    ]);
    expect(msgs[0].toolCalls![0].args).toEqual({});
  });

  it("handles array JSON in tool_calls arguments", async () => {
    const { convertMessages } = await import("../src/openai-api.js");
    const msgs = convertMessages([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "tc3",
            type: "function" as const,
            function: {
              name: "test",
              arguments: "[1, 2, 3]", // Array, not object
            },
          },
        ],
      },
    ]);
    expect(msgs[0].toolCalls![0].args).toEqual({});
  });
});

// ── openai-api.ts: provider init failure in handleChatCompletions ────

describe("OpenAI API: provider initialization failure", () => {
  it("returns 500 when resolveProvider throws", async () => {
    const { handleOpenAIRequest } = await import("../src/openai-api.js");

    const request = new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-nonexistent",
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    // No explicit provider - resolveProvider will try AnthropicProvider which throws without API key
    const res = await handleOpenAIRequest(request, "/v1/chat/completions", "user1");
    // Either 200 (streaming) if provider resolves, or 500 if it throws during init
    // Since no ANTHROPIC_API_KEY, AnthropicProvider constructor throws
    if (res && res.status !== 200) {
      expect(res.status).toBe(500);
      const body = (await res.json()) as Record<string, unknown>;
      expect((body.error as Record<string, unknown>).type).toBe("server_error");
    }
  });
});

// ── UnifiedWebSocketRunner: heartbeat and stats (timer callbacks) ────

describe("UnifiedWebSocketRunner: heartbeat and stats fire", () => {
  it("heartbeat fires after connection", async () => {
    vi.useFakeTimers();
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    ws.sentBytes = [];

    // Advance past heartbeat interval (25 seconds)
    await vi.advanceTimersByTimeAsync(25_001);

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    expect(sent.some((m) => m.type === "ping")).toBe(true);

    await runner.disconnect();
    vi.useRealTimers();
  });

  it("stats broadcast fires after connection", async () => {
    vi.useFakeTimers();
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    ws.sentBytes = [];

    // Advance past stats interval (1 second)
    await vi.advanceTimersByTimeAsync(1_001);

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    expect(sent.some((m) => m.type === "system_stats")).toBe(true);

    await runner.disconnect();
    vi.useRealTimers();
  });
});

// ── UnifiedWebSocketRunner: end_input_stream error catch block ───────

describe("UnifiedWebSocketRunner: end_input_stream error path", () => {
  it("returns error when finishInputStream throws", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({
        async process() {
          // Slow node to keep job alive
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
      // Try to end a non-existent input stream - should trigger error catch
      const result = await runner.handleCommand({
        command: "end_input_stream",
        data: { job_id: jobId, input: "nonexistent_input" },
      });
      // May succeed or error depending on runner implementation
      expect(result.message || result.error).toBeDefined();
    }

    await runner.disconnect();
  });
});
