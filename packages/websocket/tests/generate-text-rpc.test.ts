/**
 * Integration test for the `generate_text` RPC on the unified WebSocket.
 *
 * The text twin of `generate_media`: one LLM call answered on the request id,
 * with no chat thread and no workflow. Two contracts are pinned here —
 *
 *  - a plain request reaches the provider as system+user messages and comes
 *    back as `{ text }`;
 *  - a request carrying a `schema` becomes structured output: the model is
 *    forced into one tool whose input schema is that shape, and the tool call
 *    arguments come back as `{ data }`.
 *
 * The second is what the storyboard's Director depends on: without the forced
 * tool the model answers prose and the board gets no shots.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pack, unpack } from "msgpackr";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
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
    return this.queue.shift() ?? { type: "websocket.disconnect" };
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

type ResolveProvider = ConstructorParameters<
  typeof UnifiedWebSocketRunner
>[0]["resolveProvider"];

async function makeRunner(
  ws: MockWebSocket,
  resolveProvider: ResolveProvider
): Promise<UnifiedWebSocketRunner> {
  const runner = new UnifiedWebSocketRunner({
    resolveExecutor: () => ({
      async process() {
        return {};
      }
    }),
    resolveProvider,
    nodeRegistry: {
      listMetadata: () => [],
      has: () => false,
      resolve: () => ({ async process() { return {}; } }),
      getMetadata: () => undefined,
      createNodeValidator: () => () => undefined
    } as never,
    apiOptions: {
      metadataRoots: [],
      registry: {} as never,
      storage: {}
    } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => true
  });
  await runner.connect(ws);
  return runner;
}

function decodeFrame(ws: MockWebSocket, idx: number): Record<string, unknown> {
  if (ws.sentBytes[idx]) {
    return unpack(ws.sentBytes[idx]) as Record<string, unknown>;
  }
  return JSON.parse(ws.sentText[idx]) as Record<string, unknown>;
}

/**
 * Send one command frame and read the reply. `/ws` clients are MsgPack, so
 * that is the default transport here; `text` covers the JSON clients (the
 * CLI, tests) the runner also accepts.
 */
async function runOne(
  ws: MockWebSocket,
  runner: UnifiedWebSocketRunner,
  frame: Record<string, unknown>,
  transport: "bytes" | "text" = "bytes"
): Promise<Record<string, unknown>> {
  ws.queue.push(
    transport === "bytes"
      ? { type: "websocket.message", bytes: pack(frame) }
      : { type: "websocket.message", text: JSON.stringify(frame) }
  );
  ws.queue.push({ type: "websocket.disconnect" });
  await runner.receiveMessages();
  return decodeFrame(ws, 0);
}

/** A provider that records what it was asked and answers as instructed. */
function fakeProvider(answer: {
  content?: string;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    provider: {
      provider: "fake",
      getTotalCost: () => 0,
      async generateMessageTraced(args: Record<string, unknown>) {
        calls.push(args);
        return {
          role: "assistant",
          content: answer.content ?? "",
          toolCalls: answer.toolCalls ?? null
        };
      }
    }
  };
}

describe("generate_text RPC", () => {
  let ws: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    ws = new MockWebSocket();
  });

  afterEach(() => {
    ws.queue.length = 0;
  });

  it("sends system + prompt as messages and returns the text answer", async () => {
    const { calls, provider } = fakeProvider({ content: "a lighthouse" });
    const runner = await makeRunner(ws, async () => provider as never);

    const out = await runOne(ws, runner, {
      command: "generate_text",
      request_id: "t-1",
      data: {
        provider: "fake",
        model: "fake-model",
        system: "You are terse.",
        prompt: "Name one landmark.",
        max_tokens: 256
      }
    });

    expect(out.type).toBe("rpc_response");
    expect(out.error).toBeUndefined();
    expect(out.result).toEqual({ text: "a lighthouse", data: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe("fake-model");
    expect(calls[0].maxTokens).toBe(256);
    expect(calls[0].messages).toMatchObject([
      { role: "system", content: "You are terse." },
      { role: "user", content: "Name one landmark." }
    ]);
    // No schema — nothing is forced, so the model can answer freely.
    expect(calls[0].toolChoice).toBeUndefined();
  });

  it("forces the schema tool and returns its arguments as data", async () => {
    const { calls, provider } = fakeProvider({
      toolCalls: [
        { id: "c1", name: "screenplay", args: { title: "Dusk", shots: [] } }
      ]
    });
    const runner = await makeRunner(ws, async () => provider as never);
    const schema = {
      type: "object",
      required: ["title"],
      properties: { title: { type: "string" } }
    };

    const out = await runOne(ws, runner, {
      command: "generate_text",
      request_id: "t-2",
      data: {
        provider: "fake",
        model: "fake-model",
        prompt: "Direct a short.",
        schema,
        schema_name: "screenplay",
        schema_description: "Submit the finished screenplay."
      }
    });

    expect(out.error).toBeUndefined();
    expect(out.result).toEqual({
      text: "",
      data: { title: "Dusk", shots: [] }
    });
    expect(calls[0].toolChoice).toBe("screenplay");
    expect(calls[0].tools).toMatchObject([
      {
        name: "screenplay",
        description: "Submit the finished screenplay.",
        inputSchema: schema
      }
    ]);
  });

  it("recovers JSON from prose when the model ignores the tool", async () => {
    const { provider } = fakeProvider({
      content: 'Here you go:\n```json\n{"title":"Dusk"}\n```'
    });
    const runner = await makeRunner(ws, async () => provider as never);

    const out = await runOne(ws, runner, {
      command: "generate_text",
      request_id: "t-3",
      data: {
        provider: "fake",
        model: "fake-model",
        prompt: "Direct a short.",
        schema: { type: "object" }
      }
    });

    expect(out.error).toBeUndefined();
    expect(out.result).toEqual({ text: "", data: { title: "Dusk" } });
  });

  it("answers a JSON text frame the same way as a MsgPack one", async () => {
    const { provider } = fakeProvider({ content: "a lighthouse" });
    const runner = await makeRunner(ws, async () => provider as never);

    const out = await runOne(
      ws,
      runner,
      {
        command: "generate_text",
        request_id: "t-json",
        data: {
          provider: "fake",
          model: "fake-model",
          prompt: "Name one landmark."
        }
      },
      "text"
    );

    expect(out.result).toEqual({ text: "a lighthouse", data: null });
  });

  it("rejects a malformed payload before it reaches the provider", async () => {
    const { calls, provider } = fakeProvider({ content: "" });
    const runner = await makeRunner(ws, async () => provider as never);

    const out = await runOne(ws, runner, {
      command: "generate_text",
      request_id: "t-bad",
      data: {
        provider: "fake",
        model: "fake-model",
        prompt: "hi",
        // The schema becomes a tool's inputSchema; a string cannot be one.
        schema: "not-an-object"
      }
    });

    expect(out.error).toBe("invalid_command");
    expect(String(out.details)).toContain("schema");
    expect(calls).toHaveLength(0);
  });

  it("aborts an in-flight call when the socket drops", async () => {
    // The model is still generating when the client goes away. Without a
    // signal the call runs to completion and bills for an answer nobody
    // reads; with one it is interrupted.
    let seenSignal: AbortSignal | undefined;
    const provider = {
      provider: "fake",
      getTotalCost: () => 0,
      generateMessageTraced(args: { signal?: AbortSignal }) {
        seenSignal = args.signal;
        return new Promise((_resolve, reject) => {
          args.signal?.addEventListener("abort", () =>
            reject(new Error("call aborted"))
          );
        });
      }
    };
    const runner = await makeRunner(ws, async () => provider as never);

    ws.queue.push({
      type: "websocket.message",
      bytes: pack({
        command: "generate_text",
        request_id: "t-abort",
        data: { provider: "fake", model: "fake-model", prompt: "write" }
      })
    });
    const loop = runner.receiveMessages();
    // Let the command reach the provider before the socket drops.
    await new Promise((r) => setImmediate(r));
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(false);

    await runner.disconnect();
    await loop;

    // Aborted, and the loop finished instead of hanging on the provider.
    // No reply frame: the socket the answer would go to is gone.
    expect(seenSignal?.aborted).toBe(true);
    expect(ws.sentBytes).toHaveLength(0);
    expect(ws.sentText).toHaveLength(0);
  });

  it("reports a request with neither prompt nor messages", async () => {
    const { provider } = fakeProvider({ content: "" });
    const runner = await makeRunner(ws, async () => provider as never);

    const out = await runOne(ws, runner, {
      command: "generate_text",
      request_id: "t-4",
      data: { provider: "fake", model: "fake-model" }
    });

    expect(out.result).toBeUndefined();
    expect((out.error as { message?: string }).message).toContain(
      "prompt or messages is required"
    );
  });
});
