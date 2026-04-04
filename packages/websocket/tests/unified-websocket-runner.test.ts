import { describe, it, expect, vi, beforeEach } from "vitest";
import { unpack } from "msgpackr";
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
  }
});

describe("UnifiedWebSocketRunner", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(() => {
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
  });

  it("connects and defaults user id", async () => {
    await runner.connect(ws);
    expect(runner.userId).toBe("1");
    expect(runner.websocket).toBe(ws);
    await runner.disconnect();
  });

  it("sends binary messages by default", async () => {
    await runner.connect(ws);
    await runner.sendMessage({ type: "test", value: "hello" });
    expect(ws.sentBytes).toHaveLength(1);
    const decoded = unpack(ws.sentBytes[0]) as Record<string, unknown>;
    expect(decoded.type).toBe("test");
    await runner.disconnect();
  });

  it("switches to text mode", async () => {
    const res = await runner.handleCommand({
      command: "set_mode",
      data: { mode: "text" }
    });
    expect(res.message).toBe("Mode set to text");
    expect(runner.mode).toBe("text");
  });

  it("validates chat_message thread id", async () => {
    const res = await runner.handleCommand({
      command: "chat_message",
      data: { content: "hello" }
    });
    expect(res.error).toContain("thread_id is required");
  });

  it("stop with empty data cancels in-progress generation", async () => {
    const res = await runner.handleCommand({ command: "stop", data: {} });
    expect(res.message).toBe("Stop command processed");
    expect(res.job_id).toBeNull();
    expect(res.thread_id).toBeNull();
  });

  it("replies pong for ping in receive loop", async () => {
    await runner.connect(ws);
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ type: "ping" })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    expect(ws.sentBytes.length + ws.sentText.length).toBeGreaterThan(0);
    const first =
      ws.sentBytes.length > 0
        ? (unpack(ws.sentBytes[0]) as Record<string, unknown>)
        : (JSON.parse(ws.sentText[0]) as Record<string, unknown>);
    expect(first.type).toBe("pong");
    await runner.disconnect();
  });

  it("processes get_status command envelope", async () => {
    await runner.connect(ws);
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ command: "get_status", data: {} })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();

    const out =
      ws.sentBytes.length > 0
        ? (unpack(ws.sentBytes[0]) as Record<string, unknown>)
        : (JSON.parse(ws.sentText[0]) as Record<string, unknown>);
    expect(Array.isArray(out.active_jobs)).toBe(true);
    await runner.disconnect();
  });

  it("stores client tools manifest", async () => {
    await runner.connect(ws);
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "client_tools_manifest",
        tools: [{ name: "tool_1", description: "x" }]
      })
    });
    ws.queue.push({ type: "websocket.disconnect" });

    const sendSpy = vi.spyOn(runner, "sendMessage");
    await runner.receiveMessages();

    // manifest itself doesn't require response
    expect(sendSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: "invalid_message" })
    );
    await runner.disconnect();
  });

  it("handles stream_input and end_input_stream commands", async () => {
    await runner.connect(ws);

    const graph = {
      nodes: [
        { id: "stream_input", type: "test.Input", name: "stream_input" },
        { id: "sink", type: "test.Sink", name: "sink" }
      ],
      edges: [
        {
          source: "stream_input",
          sourceHandle: "value",
          target: "sink",
          targetHandle: "value"
        }
      ]
    };

    await runner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    const status = runner.getStatus() as {
      active_jobs: Array<{ job_id: string }>;
    };
    expect(status.active_jobs.length).toBeGreaterThan(0);
    const jobId = status.active_jobs[0].job_id;

    const streamed = await runner.handleCommand({
      command: "stream_input",
      data: { job_id: jobId, input: "stream_input", value: 7 }
    });
    expect(streamed.message).toBe("Input item streamed");

    const ended = await runner.handleCommand({
      command: "end_input_stream",
      data: { job_id: jobId, input: "stream_input" }
    });
    expect(ended.message).toBe("Input stream ended");

    // Give the runner time to drain queue and complete.
    await new Promise((r) => setTimeout(r, 20));
    await runner.disconnect();
  });

  it("emits output_update for constant -> output graph", async () => {
    const outputRunner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "nodetool.constant.String") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? "hello world" };
            }
          };
        }
        if (node.type === "nodetool.output.Output") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? null };
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      }
    });

    await outputRunner.connect(ws);
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.String",
          name: "nodetool.constant.String",
          properties: { value: "hello world" }
        },
        {
          id: "n2",
          type: "nodetool.output.Output",
          name: "nodetool.output.Output",
          properties: {}
        }
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          sourceHandle: "output",
          targetHandle: "value",
          edge_type: "data"
        }
      ]
    };

    await outputRunner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    await new Promise((r) => setTimeout(r, 30));

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    const updates = sent.filter((m) => m.type === "output_update");
    expect(updates.length).toBe(1);
    expect(updates.some((m) => m.value === "hello world")).toBe(true);

    await outputRunner.disconnect();
  });

  it("streams node_update events for executed nodes", async () => {
    const outputRunner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "nodetool.constant.String") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? "hello world" };
            }
          };
        }
        if (node.type === "nodetool.output.Output") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? null };
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      }
    });

    await outputRunner.connect(ws);
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.String",
          name: "nodetool.constant.String",
          properties: { value: "hello world" }
        },
        {
          id: "n2",
          type: "nodetool.output.Output",
          name: "nodetool.output.Output",
          properties: {}
        }
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          sourceHandle: "output",
          targetHandle: "value",
          edge_type: "data"
        }
      ]
    };

    await outputRunner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    await new Promise((r) => setTimeout(r, 30));

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    const nodeUpdates = sent.filter((m) => m.type === "node_update");

    expect(
      nodeUpdates.some((m) => m.node_id === "n1" && m.status === "running")
    ).toBe(true);
    expect(
      nodeUpdates.some((m) => m.node_id === "n1" && m.status === "completed")
    ).toBe(true);
    expect(
      nodeUpdates.some((m) => m.node_id === "n2" && m.status === "running")
    ).toBe(true);
    expect(
      nodeUpdates.some((m) => m.node_id === "n2" && m.status === "completed")
    ).toBe(true);

    await outputRunner.disconnect();
  });

  it("includes outputs in terminal job_update", async () => {
    const outputRunner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "nodetool.constant.String") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? "hello world" };
            }
          };
        }
        if (node.type === "nodetool.output.Output") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? null };
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      }
    });

    await outputRunner.connect(ws);
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.String",
          name: "nodetool.constant.String",
          properties: { value: "hello world" }
        },
        {
          id: "n2",
          type: "nodetool.output.Output",
          name: "nodetool.output.Output",
          properties: {}
        }
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          sourceHandle: "output",
          targetHandle: "value",
          edge_type: "data"
        }
      ]
    };

    await outputRunner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    await new Promise((r) => setTimeout(r, 30));

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    const terminal = sent
      .filter((m) => m.type === "job_update" && m.status === "completed")
      .at(-1) as Record<string, unknown> | undefined;
    expect(terminal).toBeDefined();
    expect(terminal?.result).toBeDefined();
    const result = terminal?.result as { outputs?: Record<string, unknown[]> };
    expect(result.outputs).toBeDefined();
    const outputValues = result.outputs?.["nodetool.output.Output"] ?? [];
    expect(Array.isArray(outputValues)).toBe(true);
    expect(outputValues).toContain("hello world");

    await outputRunner.disconnect();
  });

  it("emits output_update in text mode", async () => {
    const outputRunner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "nodetool.constant.String") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? "hello world" };
            }
          };
        }
        if (node.type === "nodetool.output.Output") {
          return {
            async process(inputs: Record<string, unknown>) {
              return { output: inputs.value ?? null };
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      }
    });

    await outputRunner.connect(ws);
    await outputRunner.handleCommand({
      command: "set_mode",
      data: { mode: "text" }
    });

    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.String",
          name: "nodetool.constant.String",
          properties: { value: "hello world" }
        },
        {
          id: "n2",
          type: "nodetool.output.Output",
          name: "nodetool.output.Output",
          properties: {}
        }
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          sourceHandle: "output",
          targetHandle: "value",
          edge_type: "data"
        }
      ]
    };

    await outputRunner.handleCommand({
      command: "run_job",
      data: { graph, params: {} }
    });
    await new Promise((r) => setTimeout(r, 30));

    const sent = ws.sentText.map(
      (t) => JSON.parse(t) as Record<string, unknown>
    );
    const outputUpdate = sent.find((m) => m.type === "output_update");
    expect(outputUpdate).toBeDefined();
    expect(outputUpdate?.value).toBe("hello world");

    await outputRunner.disconnect();
  });

  it("hydrates stored graphs so streaming nodes use genProcess during run_job", async () => {
    const sinkValues: unknown[] = [];
    let processCalls = 0;
    let genProcessCalls = 0;
    const outputRunner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "test.Streamer") {
          return {
            async process() {
              processCalls += 1;
              return { chunk: "buffered" };
            },
            async *genProcess() {
              genProcessCalls += 1;
              yield { chunk: "first" };
              yield { chunk: "second" };
            }
          };
        }
        if (node.type === "nodetool.workflows.base_node.Preview") {
          return {
            async process(inputs: Record<string, unknown>) {
              sinkValues.push(inputs.value ?? null);
              return { output: inputs.value ?? null };
            }
          };
        }
        return {
          async process() {
            return {};
          }
        };
      },
      resolveNodeType: {
        resolveNodeType: async (nodeType: string) => {
          if (nodeType === "test.Streamer") {
            return {
              nodeType,
              outputs: { chunk: "chunk" },
              descriptorDefaults: {
                is_streaming_output: true,
                name: "Streamer"
              }
            };
          }
          if (nodeType === "nodetool.workflows.base_node.Preview") {
            return {
              nodeType,
              propertyTypes: { value: "any" },
              outputs: { output: "any" },
              descriptorDefaults: { name: "Preview" }
            };
          }
          return null;
        }
      }
    });

    await outputRunner.connect(ws);
    await outputRunner.handleCommand({
      command: "run_job",
      data: {
        graph: {
          nodes: [
            { id: "stream", type: "test.Streamer" },
            { id: "preview", type: "nodetool.workflows.base_node.Preview" }
          ],
          edges: [
            {
              id: "e1",
              source: "stream",
              sourceHandle: "chunk",
              target: "preview",
              targetHandle: "value",
              edge_type: "data"
            }
          ]
        }
      }
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(processCalls).toBe(0);
    expect(genProcessCalls).toBe(1);
    expect(sinkValues).toEqual(["first", "second"]);

    await outputRunner.disconnect();
  });
});
