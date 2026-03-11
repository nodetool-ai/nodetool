/**
 * E2E test: CLI (stdin mode) → WebSocket → UnifiedWebSocketRunner + FakeProvider
 *
 * Spawns the CLI as a child process with piped stdin/stdout. The server runs
 * in-process with an InstrumentedWsAdapter that captures every frame in both
 * directions for protocol-level assertions.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  Thread,
  Message,
  Workflow,
  Job,
} from "@nodetool/models";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame,
  type UnifiedWebSocketRunnerOptions,
} from "../src/unified-websocket-runner.js";
import {
  FakeProvider,
  createStreamingFakeProvider,
  createFakeToolCall,
} from "@nodetool/runtime";
import type { BaseProvider } from "@nodetool/runtime";
import { Tool } from "@nodetool/agents";

// ─── InstrumentedWsAdapter ─────────────────────────────────────────────────
// Re-implements WsAdapter from server.ts with frame capture on both directions.

class InstrumentedWsAdapter implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";

  private queue: WebSocketReceiveFrame[] = [];
  private waiters: Array<(frame: WebSocketReceiveFrame) => void> = [];

  /** Frames received from the client (parsed JSON). */
  capturedInbound: unknown[] = [];
  /** Frames sent to the client (parsed JSON). */
  capturedOutbound: unknown[] = [];

  constructor(private socket: WebSocket) {
    socket.on("message", (raw: Buffer | string, isBinary: boolean) => {
      const frame: WebSocketReceiveFrame = isBinary
        ? { type: "websocket.message", bytes: raw instanceof Uint8Array ? raw : new Uint8Array(raw as Buffer) }
        : { type: "websocket.message", text: raw.toString() };

      // Capture inbound for assertions
      if (!isBinary) {
        try {
          this.capturedInbound.push(JSON.parse(raw.toString()));
        } catch {
          this.capturedInbound.push(raw.toString());
        }
      }

      const waiter = this.waiters.shift();
      if (waiter) waiter(frame);
      else this.queue.push(frame);
    });

    socket.on("close", () => {
      this.clientState = "disconnected";
      this.applicationState = "disconnected";
      const waiter = this.waiters.shift();
      if (waiter) waiter({ type: "websocket.disconnect" });
    });
  }

  async accept(): Promise<void> {}

  async receive(): Promise<WebSocketReceiveFrame> {
    const next = this.queue.shift();
    if (next) return next;
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async sendBytes(data: Uint8Array): Promise<void> {
    this.socket.send(data);
  }

  async sendText(data: string): Promise<void> {
    // Capture outbound for assertions
    try {
      this.capturedOutbound.push(JSON.parse(data));
    } catch {
      this.capturedOutbound.push(data);
    }
    this.socket.send(data);
  }

  async close(code?: number, _reason?: string): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
    this.socket.close(code);
  }
}

// ─── Test Server ────────────────────────────────────────────────────────────

interface TestServer {
  listen(): Promise<number>;
  close(): Promise<void>;
  /** All inbound frames (client → server) across connections. */
  inbound: unknown[];
  /** All outbound frames (server → client) across connections. */
  outbound: unknown[];
  /** The adapter for the latest connection. */
  adapter: InstrumentedWsAdapter | null;
}

function createTestServer(
  resolveProvider: (id: string) => Promise<BaseProvider>,
  extraOptions?: Partial<UnifiedWebSocketRunnerOptions>,
): TestServer {
  const inbound: unknown[] = [];
  const outbound: unknown[] = [];
  let adapter: InstrumentedWsAdapter | null = null;

  const httpServer = createServer();
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const wsAdapter = new InstrumentedWsAdapter(ws);
      adapter = wsAdapter;

      // Wire captured arrays to the shared test arrays
      const origInbound = wsAdapter.capturedInbound;
      const origOutbound = wsAdapter.capturedOutbound;
      // Use proxy arrays so pushes go to both the adapter's and test's arrays
      Object.defineProperty(wsAdapter, "capturedInbound", {
        get: () => origInbound,
      });
      Object.defineProperty(wsAdapter, "capturedOutbound", {
        get: () => origOutbound,
      });

      const runner = new UnifiedWebSocketRunner({
        resolveExecutor: extraOptions?.resolveExecutor ?? (() => ({ async process() { return {}; } })),
        resolveProvider,
        ...extraOptions,
      });

      // Run the message loop (run() calls connect() internally)
      void (async () => {
        await runner.run(wsAdapter);
      })();
    });
  });

  return {
    inbound,
    outbound,
    get adapter() { return adapter; },
    async listen(): Promise<number> {
      return new Promise((resolve) => {
        httpServer.listen(0, "127.0.0.1", () => {
          const addr = httpServer.address();
          const port = typeof addr === "object" && addr ? addr.port : 0;
          resolve(port);
        });
      });
    },
    async close(): Promise<void> {
      return new Promise((resolve, reject) => {
        wss.close(() => {
          httpServer.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Event-driven stdout reader. Accumulates data events and resolves when
 * predicate matches. Rejects on timeout with the buffer so far.
 */
function waitForOutput(
  stream: Readable,
  predicate: (buf: string) => boolean,
  timeoutMs = 15_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let accumulated = "";
    const onData = (chunk: Buffer | string) => {
      accumulated += chunk.toString();
      if (predicate(accumulated)) {
        clearTimeout(timer);
        stream.removeListener("data", onData);
        resolve(accumulated);
      }
    };
    stream.on("data", onData);

    const timer = setTimeout(() => {
      stream.removeListener("data", onData);
      reject(new Error(`Timed out after ${timeoutMs}ms. Accumulated stdout:\n${accumulated}`));
    }, timeoutMs);
  });
}

function spawnCli(port: number, extraArgs: string[] = []): ChildProcess {
  const cliPath = resolve(__dirname, "../../cli/dist/index.js");
  return spawn("node", [cliPath, "--url", `ws://127.0.0.1:${port}/ws`, "--provider", "fake", "--model", "fake-m", ...extraArgs], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NODETOOL_LOG_LEVEL: "debug",
      // Prevent CLI from trying to create its own SQLite DB
      DB_PATH: "/tmp/nodetool-e2e-test-cli.db",
    },
  });
}

function killChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.on("exit", () => resolve());
    child.stdin?.end();
    child.kill("SIGTERM");
    // Force kill after 2s
    setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* already dead */ }
    }, 2000);
  });
}

/**
 * Wait for the WebSocket connection to be established by watching
 * for the adapter to appear on the test server.
 */
async function waitForConnection(server: TestServer, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!server.adapter) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for WebSocket connection");
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe("E2E CLI → WebSocket server", () => {
  let server: TestServer;
  let child: ChildProcess;
  let stderrOutput: string;

  beforeEach(async () => {
    // Set up in-memory DB for the server
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    // Create tables needed by the runner (Thread, Message for chat; Workflow, Job for /run)
    await Promise.all([
      Workflow.createTable(),
      Job.createTable(),
    ]);
    stderrOutput = "";
  });

  afterEach(async () => {
    if (child) {
      await killChild(child);
    }
    if (server) {
      await server.close();
    }
  });

  it("single-turn chat: CLI sends message, receives streamed response", async () => {
    const fakeProvider = createStreamingFakeProvider("Hello from the fake provider!", 5);

    server = createTestServer(async () => fakeProvider);
    const port = await server.listen();

    child = spawnCli(port);
    child.stderr?.on("data", (d: Buffer) => { stderrOutput += d.toString(); });

    // Wait for WS handshake
    await waitForConnection(server);

    // Give the CLI a moment to send set_mode
    await new Promise((r) => setTimeout(r, 300));

    // Send a chat message via stdin
    child.stdin!.write("Hello!\n");

    // Wait for the response to appear on stdout
    const output = await waitForOutput(
      child.stdout!,
      (buf) => buf.includes("Hello from the fake provider!"),
    );

    expect(output).toContain("Hello from the fake provider!");
    expect(fakeProvider.callCount).toBe(1);

    // Check inbound frames: should have set_mode + chat_message
    const inbound = server.adapter!.capturedInbound as Record<string, unknown>[];
    const setMode = inbound.find((f) => f.command === "set_mode");
    expect(setMode).toBeTruthy();
    expect((setMode as any).data?.mode).toBe("text");

    const chatMsg = inbound.find((f) => f.command === "chat_message");
    expect(chatMsg).toBeTruthy();
    expect((chatMsg as any).data?.content).toBe("Hello!");

    // Check outbound frames: should have chunks and a done chunk
    const outbound = server.adapter!.capturedOutbound as Record<string, unknown>[];
    const chunks = outbound.filter((f) => f.type === "chunk");
    expect(chunks.length).toBeGreaterThan(0);

    const doneChunk = chunks.find((c) => c.done === true);
    expect(doneChunk).toBeTruthy();

    // Final assistant message should be present
    const assistantMsg = outbound.find((f) => f.type === "message" && f.role === "assistant");
    expect(assistantMsg).toBeTruthy();
  }, 30_000);

  it("multi-turn chat: two consecutive messages both get responses", async () => {
    let callCount = 0;
    const fakeProvider = new FakeProvider({
      shouldStream: true,
      chunkSize: 5,
      customResponseFn: () => {
        callCount++;
        return callCount === 1 ? "First reply from provider" : "Second reply from provider";
      },
    });

    server = createTestServer(async () => fakeProvider);
    const port = await server.listen();

    child = spawnCli(port);
    child.stderr?.on("data", (d: Buffer) => { stderrOutput += d.toString(); });

    // Accumulate ALL stdout for multi-turn assertions
    let allStdout = "";
    child.stdout!.on("data", (d: Buffer) => { allStdout += d.toString(); });

    await waitForConnection(server);
    await new Promise((r) => setTimeout(r, 300));

    // First message
    child.stdin!.write("msg one\n");
    await waitForOutput(
      child.stdout!,
      () => allStdout.includes("First reply from provider"),
    );
    expect(allStdout).toContain("First reply from provider");

    // Second message — this is the exact bug scenario
    child.stdin!.write("msg two\n");
    await waitForOutput(
      child.stdout!,
      () => allStdout.includes("Second reply from provider"),
    );
    expect(allStdout).toContain("Second reply from provider");

    expect(fakeProvider.callCount).toBe(2);

    // Verify both chat_message commands arrived
    const inbound = server.adapter!.capturedInbound as Record<string, unknown>[];
    const chatMsgs = inbound.filter((f) => f.command === "chat_message");
    expect(chatMsgs.length).toBe(2);

    // Verify done chunks were sent back (2 per response: streaming done + explicit done)
    const outbound = server.adapter!.capturedOutbound as Record<string, unknown>[];
    const doneChunks = outbound.filter((f) => f.type === "chunk" && f.done === true);
    expect(doneChunks.length).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("protocol frame sequence is correct", async () => {
    const fakeProvider = createStreamingFakeProvider("ABCDE", 2); // chunks: "AB", "CD", "E"

    server = createTestServer(async () => fakeProvider);
    const port = await server.listen();

    child = spawnCli(port);
    child.stderr?.on("data", (d: Buffer) => { stderrOutput += d.toString(); });

    await waitForConnection(server);
    await new Promise((r) => setTimeout(r, 300));

    child.stdin!.write("Hi\n");
    await waitForOutput(child.stdout!, (buf) => buf.includes("ABCDE"));

    // Filter out noise (system_stats, ping/pong)
    const outbound = (server.adapter!.capturedOutbound as Record<string, unknown>[]).filter(
      (f) => f.type !== "system_stats" && f.type !== "ping",
    );

    // Expected sequence:
    // 1. set_mode ack: { message: "Mode set to text" }
    // 2. chat_message ack: { message: "Chat message processing started" }
    // 3. content chunks (type: "chunk", done: false/undefined)
    // 4. done chunk (type: "chunk", done: true)
    // 5. final assistant message (type: "message", role: "assistant")

    const modeAck = outbound.find((f) => typeof f.message === "string" && (f.message as string).includes("Mode set to"));
    expect(modeAck).toBeTruthy();

    const chatAck = outbound.find((f) => typeof f.message === "string" && (f.message as string).includes("Chat message processing started"));
    expect(chatAck).toBeTruthy();

    // Mode ack should come before chat ack
    const modeIdx = outbound.indexOf(modeAck!);
    const chatIdx = outbound.indexOf(chatAck!);
    expect(modeIdx).toBeLessThan(chatIdx);

    // Content chunks should come after chat ack
    const contentChunks = outbound.filter((f) => f.type === "chunk" && f.done !== true);
    expect(contentChunks.length).toBeGreaterThan(0);

    const firstChunkIdx = outbound.indexOf(contentChunks[0]);
    expect(firstChunkIdx).toBeGreaterThan(chatIdx);

    // Done chunk should come after content chunks
    const doneChunk = outbound.find((f) => f.type === "chunk" && f.done === true);
    expect(doneChunk).toBeTruthy();
    const doneIdx = outbound.indexOf(doneChunk!);
    expect(doneIdx).toBeGreaterThan(firstChunkIdx);

    // Final assistant message after done chunk
    const assistantMsg = outbound.find((f) => f.type === "message" && f.role === "assistant");
    expect(assistantMsg).toBeTruthy();
    const msgIdx = outbound.indexOf(assistantMsg!);
    expect(msgIdx).toBeGreaterThan(doneIdx);

    // Concatenated content chunks should equal the response
    const fullContent = contentChunks.map((c) => c.content).join("");
    // The done chunk may also carry the last piece — check combined
    const doneContent = typeof doneChunk!.content === "string" ? doneChunk!.content : "";
    expect(fullContent + doneContent).toBe("ABCDE");
  }, 30_000);

  it("tool calling: provider returns tool call, server executes tool, provider continues with result", async () => {
    // This test uses a direct WebSocket client (not CLI subprocess) to send
    // tool schemas in the chat_message — the server needs tool declarations
    // to register them for execution via resolveTools.

    let providerCallCount = 0;
    const fakeProvider = new FakeProvider({
      shouldStream: true,
      chunkSize: 100,
      customResponseFn: () => {
        providerCallCount++;
        if (providerCallCount === 1) {
          return [createFakeToolCall("get_weather", { city: "Berlin" }, "tc-1")];
        }
        return "The weather in Berlin is sunny, 22°C.";
      },
    });

    // Server-side tool that returns a deterministic result
    class GetWeatherTool extends Tool {
      readonly name = "get_weather";
      readonly description = "Get weather for a city";
      readonly inputSchema = {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      };
      async process(_ctx: any, params: Record<string, unknown>) {
        return { temperature: "22°C", condition: "sunny", city: params.city };
      }
    }

    const weatherTool = new GetWeatherTool();

    server = createTestServer(
      async () => fakeProvider,
      {
        resolveTools: async (toolNames: string[]) => {
          return toolNames.includes("get_weather") ? [weatherTool] : [];
        },
      },
    );
    const port = await server.listen();

    // Connect a raw WebSocket client
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", (e) => reject(e));
    });

    // Collect all received messages
    const received: Record<string, unknown>[] = [];
    ws.on("message", (data: Buffer | string) => {
      try {
        received.push(JSON.parse(typeof data === "string" ? data : data.toString("utf8")));
      } catch { /* ignore */ }
    });

    // Switch to text mode
    ws.send(JSON.stringify({ command: "set_mode", data: { mode: "text" } }));
    await new Promise((r) => setTimeout(r, 100));

    // Send chat_message with tool schemas
    const threadId = crypto.randomUUID();
    ws.send(JSON.stringify({
      command: "chat_message",
      data: {
        role: "user",
        content: "What is the weather in Berlin?",
        thread_id: threadId,
        model: "fake-m",
        provider: "fake",
        tools: [{
          name: "get_weather",
          description: "Get weather for a city",
          inputSchema: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        }],
      },
    }));

    // Wait for done chunk
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(
        `Timed out waiting for done chunk. Received:\n${received.map((r, i) => `${i}: ${r.type ?? r.message ?? "???"}`).join("\n")}`,
      )), 15_000);
      const check = setInterval(() => {
        const done = received.find((r) => r.type === "chunk" && r.done === true);
        if (done) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      }, 50);
    });

    ws.close();

    // Provider should have been called twice: tool call + text after tool result
    expect(fakeProvider.callCount).toBe(2);

    // Verify protocol frames
    const outbound = server.adapter!.capturedOutbound as Record<string, unknown>[];

    // Should have an assistant message with tool_calls
    const toolCallMsg = outbound.find(
      (f) => f.type === "message" && f.role === "assistant" && Array.isArray(f.tool_calls),
    );
    expect(toolCallMsg).toBeTruthy();
    const toolCalls = (toolCallMsg as any).tool_calls as any[];
    expect(toolCalls[0].name).toBe("get_weather");
    expect(toolCalls[0].args).toEqual({ city: "Berlin" });

    // Should have a tool result message with actual result (not error)
    const toolResultMsg = outbound.find(
      (f) => f.type === "message" && f.role === "tool" && f.name === "get_weather",
    );
    expect(toolResultMsg).toBeTruthy();
    const toolContent = JSON.parse(toolResultMsg!.content as string);
    expect(toolContent).toEqual({ temperature: "22°C", condition: "sunny", city: "Berlin" });

    // Should have final content chunks after tool result
    const contentChunks = outbound.filter(
      (f) => f.type === "chunk" && typeof f.content === "string" && (f.content as string).length > 0,
    );
    expect(contentChunks.length).toBeGreaterThan(0);

    // Final assistant message should contain the text response
    const finalMsg = outbound.filter((f) => f.type === "message" && f.role === "assistant");
    const lastAssistant = finalMsg[finalMsg.length - 1] as Record<string, unknown>;
    expect(typeof lastAssistant.content === "string" && lastAssistant.content.includes("sunny")).toBe(true);

    // Verify ordering: tool_call msg → tool result msg → content chunks → done
    const toolCallIdx = outbound.indexOf(toolCallMsg!);
    const toolResultIdx = outbound.indexOf(toolResultMsg!);
    const firstContentIdx = outbound.indexOf(contentChunks[0]);
    expect(toolCallIdx).toBeLessThan(toolResultIdx);
    expect(toolResultIdx).toBeLessThan(firstContentIdx);
  }, 30_000);

  it("agent mode: CLI sends objective via inference, receives streamed response", async () => {
    // In agent mode with --url, the CLI creates a local Agent that uses
    // WebSocketProvider → inference commands to the server. The server
    // handles each inference call independently (stateless).
    //
    // The Agent's planner calls inference once (for planning), then the
    // StepExecutor calls inference for each step. We provide a FakeProvider
    // that returns deterministic responses for the planning + execution phases.

    let inferenceCallCount = 0;
    const fakeProvider = new FakeProvider({
      shouldStream: false,
      customResponseFn: () => {
        inferenceCallCount++;
        if (inferenceCallCount === 1) {
          // Planning phase: return a simple plan with finish_step tool call
          return [createFakeToolCall("finish_step", { markdown: "Agent result: task completed" }, "step-done-1")];
        }
        // Any subsequent calls
        return "Done";
      },
    });

    server = createTestServer(async () => fakeProvider);
    const port = await server.listen();

    // Spawn CLI in agent mode
    child = spawnCli(port, ["--agent"]);
    child.stderr?.on("data", (d: Buffer) => { stderrOutput += d.toString(); });

    let allStdout = "";
    child.stdout!.on("data", (d: Buffer) => { allStdout += d.toString(); });

    await waitForConnection(server);
    await new Promise((r) => setTimeout(r, 300));

    // Send an objective
    child.stdin!.write("Summarize the weather\n");

    // The agent should eventually produce output. Agent mode writes chunks
    // and/or the final task result to stdout.
    // Wait for any output indicating the agent ran (the planning/execution
    // steps may vary, so we wait for either task result or agent text).
    await waitForOutput(
      child.stdout!,
      () => allStdout.length > 0,
      20_000,
    );

    // Verify inference commands were sent to the server
    const inbound = server.adapter!.capturedInbound as Record<string, unknown>[];
    const inferenceCommands = inbound.filter((f) => f.command === "inference");
    expect(inferenceCommands.length).toBeGreaterThanOrEqual(1);

    // Verify the server responded with inference_done
    const outbound = server.adapter!.capturedOutbound as Record<string, unknown>[];
    const inferenceDoneFrames = outbound.filter((f) => f.type === "inference_done");
    expect(inferenceDoneFrames.length).toBeGreaterThanOrEqual(1);

    // Verify provider was called at least once
    expect(fakeProvider.callCount).toBeGreaterThanOrEqual(1);
  }, 30_000);

  // ─── Slash command tests ────────────────────────────────────────────────

  it("/run: executes a workflow by ID, streams job events to CLI", async () => {
    // Create a simple workflow in the server-side DB: String → Output
    const workflow = await Workflow.create({
      user_id: "1",
      name: "E2E Test Workflow",
      access: "private",
      graph: {
        nodes: [
          { id: "n1", type: "nodetool.constant.String", name: "nodetool.constant.String", properties: { value: "workflow-output-42" } },
          { id: "n2", type: "nodetool.output.Output", name: "nodetool.output.Output", properties: {} },
        ],
        edges: [
          { id: "e1", source: "n1", target: "n2", sourceHandle: "output", targetHandle: "value", edge_type: "data" },
        ],
      },
    });

    // Executor that handles the two node types
    const resolveExecutor = (node: { id: string; type: string; [key: string]: unknown }) => {
      const props = (typeof node.properties === "object" && node.properties !== null)
        ? node.properties as Record<string, unknown>
        : {};
      if (node.type === "nodetool.constant.String") {
        return { async process() { return { output: props.value ?? "" }; } };
      }
      // Output node: passes through its input
      return { async process(inputs: Record<string, unknown>) { return { output: inputs.value ?? null }; } };
    };

    const fakeProvider = createStreamingFakeProvider("unused", 5);

    server = createTestServer(
      async () => fakeProvider,
      { resolveExecutor },
    );
    const port = await server.listen();

    child = spawnCli(port);
    child.stderr?.on("data", (d: Buffer) => { stderrOutput += d.toString(); });

    let allStdout = "";
    child.stdout!.on("data", (d: Buffer) => { allStdout += d.toString(); });

    await waitForConnection(server);
    await new Promise((r) => setTimeout(r, 300));

    // Send /run command with the workflow ID
    child.stdin!.write(`/run ${workflow.id}\n`);

    // Wait for the workflow output to appear on stdout
    // The CLI writes output_update values and job result to stdout as JSON
    await waitForOutput(
      child.stdout!,
      () => allStdout.includes("workflow-output-42"),
    );

    expect(allStdout).toContain("workflow-output-42");

    // Verify server-side protocol: run_job command was sent
    const inbound = server.adapter!.capturedInbound as Record<string, unknown>[];
    const runJobCmd = inbound.find((f) => f.command === "run_job");
    expect(runJobCmd).toBeTruthy();
    expect((runJobCmd as any).data?.workflow_id).toBe(workflow.id);

    // Verify server sent job_update events
    const outbound = server.adapter!.capturedOutbound as Record<string, unknown>[];
    const jobUpdates = outbound.filter((f) => f.type === "job_update");
    expect(jobUpdates.length).toBeGreaterThanOrEqual(1);

    // Should have a completed status
    const completed = jobUpdates.find((f) => f.status === "completed");
    expect(completed).toBeTruthy();

    // stderr should have status updates
    expect(stderrOutput).toContain("running");
  }, 30_000);

  it("/run with params: passes JSON parameters to workflow", async () => {
    // Workflow with a constant node — params don't change its output,
    // but we verify they're sent in the run_job command
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Params Test Workflow",
      access: "private",
      graph: {
        nodes: [
          { id: "n1", type: "nodetool.constant.String", name: "nodetool.constant.String", properties: { value: "param-test" } },
        ],
        edges: [],
      },
    });

    const resolveExecutor = (node: { type: string; [key: string]: unknown }) => {
      const props = (typeof node.properties === "object" && node.properties !== null)
        ? node.properties as Record<string, unknown>
        : {};
      return { async process() { return { output: props.value ?? "" }; } };
    };

    const fakeProvider = createStreamingFakeProvider("unused", 5);
    server = createTestServer(async () => fakeProvider, { resolveExecutor });
    const port = await server.listen();

    child = spawnCli(port);
    child.stderr?.on("data", (d: Buffer) => { stderrOutput += d.toString(); });

    await waitForConnection(server);
    await new Promise((r) => setTimeout(r, 300));

    // Send /run with JSON params
    child.stdin!.write(`/run ${workflow.id} {"input_text": "hello"}\n`);

    // Wait for job completion on stderr
    await waitForOutput(
      child.stderr!,
      (buf) => buf.includes("completed"),
    );

    // Verify params were sent in the run_job command
    const inbound = server.adapter!.capturedInbound as Record<string, unknown>[];
    const runJobCmd = inbound.find((f) => f.command === "run_job");
    expect(runJobCmd).toBeTruthy();
    expect((runJobCmd as any).data?.params).toEqual({ input_text: "hello" });
  }, 30_000);

  it("/help: prints available commands to stdout", async () => {
    const fakeProvider = createStreamingFakeProvider("unused", 5);
    server = createTestServer(async () => fakeProvider);
    const port = await server.listen();

    child = spawnCli(port);
    child.stderr?.on("data", (d: Buffer) => { stderrOutput += d.toString(); });

    await waitForConnection(server);
    await new Promise((r) => setTimeout(r, 300));

    child.stdin!.write("/help\n");

    const output = await waitForOutput(
      child.stdout!,
      (buf) => buf.includes("/run"),
    );

    expect(output).toContain("/run");
    expect(output).toContain("/stop");
    expect(output).toContain("/reconnect");
    expect(output).toContain("/resume");
    expect(output).toContain("/cancel");
    expect(output).toContain("/status");
    expect(output).toContain("/help");
  }, 30_000);

  it("/run then chat: slash commands and chat coexist in same session", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Mixed Session Workflow",
      access: "private",
      graph: {
        nodes: [
          { id: "n1", type: "nodetool.constant.String", name: "nodetool.constant.String", properties: { value: "wf-done" } },
        ],
        edges: [],
      },
    });

    const resolveExecutor = (node: { type: string; [key: string]: unknown }) => {
      const props = (typeof node.properties === "object" && node.properties !== null)
        ? node.properties as Record<string, unknown>
        : {};
      return { async process() { return { output: props.value ?? "" }; } };
    };

    const fakeProvider = createStreamingFakeProvider("Chat reply from provider", 100);

    server = createTestServer(async () => fakeProvider, { resolveExecutor });
    const port = await server.listen();

    child = spawnCli(port);
    child.stderr?.on("data", (d: Buffer) => { stderrOutput += d.toString(); });

    let allStdout = "";
    child.stdout!.on("data", (d: Buffer) => { allStdout += d.toString(); });

    await waitForConnection(server);
    await new Promise((r) => setTimeout(r, 300));

    // First: run a workflow
    child.stdin!.write(`/run ${workflow.id}\n`);
    await waitForOutput(child.stderr!, (buf) => buf.includes("completed"));

    // Then: send a regular chat message
    child.stdin!.write("Hello chat\n");
    await waitForOutput(
      child.stdout!,
      () => allStdout.includes("Chat reply from provider"),
    );

    expect(allStdout).toContain("Chat reply from provider");

    // Verify both commands were sent
    const inbound = server.adapter!.capturedInbound as Record<string, unknown>[];
    expect(inbound.some((f) => f.command === "run_job")).toBe(true);
    expect(inbound.some((f) => f.command === "chat_message")).toBe(true);
  }, 30_000);
});
