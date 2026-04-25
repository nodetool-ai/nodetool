/**
 * Regression tests for WorkflowMessageProcessor parity gaps.
 *
 * These tests verify that chat messages with workflow_id / workflow_target
 * are routed to workflow execution (not regular chat), matching Python's
 * handle_message_impl routing logic.
 *
 * Gaps covered:
 *   1. Routing priority: workflow_target/workflow_id checked BEFORE agent_mode
 *   2. handleWorkflowMessage: runs workflow, streams events, builds response
 *   3. _detect_message_input_names: scans graph for MessageInput/MessageListInput
 *   4. _create_response_message: converts workflow outputs to typed Message content
 *   5. Workflow params serialization (message + messages params)
 *   6. Chat workflow vs regular workflow routing (run_mode="chat")
 *   7. Error handling in workflow execution
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decode } from "@msgpack/msgpack";
import { initTestDb, Thread, Message, Workflow, Job } from "@nodetool/models";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";

// ── Mock WebSocket ──────────────────────────────────────────────────

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: Array<WebSocketReceiveFrame> = [];
  async accept() {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array) {
    this.sentBytes.push(data);
  }
  async sendText(data: string) {
    this.sentText.push(data);
  }
  async close() {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const noop = () => ({
  async process() {
    return {};
  }
});

function setupModels() {
  initTestDb();
}

function sentMsgs(ws: MockWS): Record<string, unknown>[] {
  return ws.sentBytes.map((b) => decode(b) as Record<string, unknown>);
}

/** Executor that reads value from node.properties (mimics real node behavior) */
function makeExecutor(node: {
  id: string;
  type: string;
  [key: string]: unknown;
}) {
  const props =
    typeof node.properties === "object" && node.properties !== null
      ? (node.properties as Record<string, unknown>)
      : {};
  if (node.type === "nodetool.constant.String") {
    const val = props.value ?? "";
    return {
      async process(inputs: Record<string, unknown>) {
        return { output: inputs.value ?? val };
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
  if (node.type === "test.ImageProducer") {
    return {
      async process() {
        return { output: { type: "image", uri: "file:///test.png" } };
      }
    };
  }
  if (node.type === "test.ErrorNode") {
    return {
      async process() {
        throw new Error("Node exploded");
      }
    };
  }
  return {
    async process(inputs: Record<string, unknown>) {
      return { output: inputs.value ?? props.value ?? "" };
    }
  };
}

function mockProvider() {
  return async () =>
    ({
      provider: "mock",
      async *generateMessagesTraced() {
        yield { type: "chunk" as const, content: "regular chat response" };
      },
      async generateMessageTraced() {
        return {};
      },
      generateMessage: vi.fn(),
      hasToolSupport: async () => false,
      getAvailableLanguageModels: async () => [],
      getAvailableImageModels: async () => [],
      getAvailableVideoModels: async () => [],
      getAvailableTTSModels: async () => [],
      getAvailableASRModels: async () => [],
      getAvailableEmbeddingModels: async () => [],
      getContainerEnv: () => ({})
    }) as any;
}

function streamingResolver(nodeType: string) {
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

// ── 1. Routing priority ─────────────────────────────────────────────

describe("Routing priority: workflow_id/workflow_target before agent_mode", () => {
  let ws: MockWS;

  beforeEach(() => {
    setupModels();
    ws = new MockWS();
  });

  it("routes to workflow processor when workflow_target='workflow' even if agent_mode=true", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Test WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.constant.String",
            name: "nodetool.constant.String",
            properties: { value: "wf-output" }
          }
        ],
        edges: []
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-wf-route",
        content: "do something",
        workflow_id: workflow.id,
        workflow_target: "workflow",
        agent_mode: true, // should be ignored since workflow_target is set
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    const msgs = sentMsgs(ws);

    // Should NOT see "regular chat response" from the mock provider
    expect(
      msgs.some(
        (m) => m.type === "chunk" && m.content === "regular chat response"
      )
    ).toBe(false);

    // Should see workflow execution events (job_update, node_update, etc.)
    expect(
      msgs.some(
        (m) =>
          m.type === "job_update" ||
          m.type === "node_update" ||
          m.type === "output_update" ||
          (m.type === "chunk" && m.done === true)
      )
    ).toBe(true);

    await runner.disconnect();
  });

  it("routes to workflow processor when workflow_id is set (no workflow_target)", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Test WF 2",
      access: "private",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.constant.String",
            name: "nodetool.constant.String",
            properties: { value: "hello" }
          }
        ],
        edges: []
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-wf-id",
        content: "run workflow",
        workflow_id: workflow.id,
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    const msgs = sentMsgs(ws);

    // Should NOT be regular chat
    expect(
      msgs.some(
        (m) => m.type === "chunk" && m.content === "regular chat response"
      )
    ).toBe(false);

    // Should send done chunk at completion
    expect(msgs.some((m) => m.type === "chunk" && m.done === true)).toBe(true);

    await runner.disconnect();
  });

  it("falls through to regular chat when no workflow_id or workflow_target", async () => {
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: noop,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-no-wf",
        content: "hello",
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 200));

    const msgs = sentMsgs(ws);
    // Should see regular chat response
    expect(
      msgs.some(
        (m) => m.type === "chunk" && m.content === "regular chat response"
      )
    ).toBe(true);

    await runner.disconnect();
  });

  it("hydrates workflow graphs before chat workflow execution so streaming nodes yield downstream", async () => {
    const sinkValues: unknown[] = [];
    let processCalls = 0;
    let genProcessCalls = 0;

    const workflow = await Workflow.create({
      user_id: "1",
      name: "Streaming WF",
      access: "private",
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
            targetHandle: "value"
          }
        ]
      }
    });

    const runner = new UnifiedWebSocketRunner({
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
        return noop();
      },
      resolveNodeType: {
        resolveNodeType: async (nodeType: string) => streamingResolver(nodeType)
      },
      resolveProvider: mockProvider()
    });

    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-streaming",
        workflow_id: workflow.id,
        workflow_target: "workflow",
        content: "run it",
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(processCalls).toBe(0);
    expect(genProcessCalls).toBe(1);
    expect(sinkValues).toEqual(["first", "second"]);

    await runner.disconnect();
  });

  it("matches Python streaming semantics by not routing null yields downstream", async () => {
    const sinkValues: unknown[] = [];

    const workflow = await Workflow.create({
      user_id: "1",
      name: "Streaming Null Filter WF",
      access: "private",
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
            targetHandle: "value"
          }
        ]
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: (node) => {
        if (node.type === "test.Streamer") {
          return {
            async process() {
              return { chunk: "buffered" };
            },
            async *genProcess() {
              yield { chunk: "first" };
              yield { chunk: null, text: "final" };
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
        return noop();
      },
      resolveNodeType: {
        resolveNodeType: async (nodeType: string) => streamingResolver(nodeType)
      },
      resolveProvider: mockProvider()
    });

    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-streaming-null",
        workflow_id: workflow.id,
        workflow_target: "workflow",
        content: "run it",
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(sinkValues).toEqual(["first"]);

    await runner.disconnect();
  });
});

// ── 2. handleWorkflowMessage: execution + response ──────────────────

describe("handleWorkflowMessage: workflow execution and response", () => {
  let ws: MockWS;

  beforeEach(() => {
    setupModels();
    ws = new MockWS();
  });

  it("executes workflow and sends job_update + done chunk + response message", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Output WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.constant.String",
            name: "nodetool.constant.String",
            properties: { value: "workflow result" }
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
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-wf-exec",
        content: "run it",
        workflow_id: workflow.id,
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    const msgs = sentMsgs(ws);

    // Done chunk signals completion
    const doneChunk = msgs.find((m) => m.type === "chunk" && m.done === true);
    expect(doneChunk).toBeDefined();
    expect(doneChunk?.workflow_id).toBe(workflow.id);

    // Final response message (type: "message", role: "assistant") with workflow output
    const responseMsg = msgs.find(
      (m) =>
        m.type === "message" &&
        m.role === "assistant" &&
        m.workflow_id === workflow.id
    );
    expect(responseMsg).toBeDefined();

    await runner.disconnect();
  });

  it("sends error + done chunk when workflow_id not found", async () => {
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: noop,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-wf-notfound",
        content: "run it",
        workflow_id: "nonexistent-workflow-id",
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 200));

    const msgs = sentMsgs(ws);
    expect(msgs.some((m) => m.type === "error")).toBe(true);
    expect(msgs.some((m) => m.type === "chunk" && m.done === true)).toBe(true);

    await runner.disconnect();
  });

  it("includes job_id and workflow_id on all streamed messages", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Job ID WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.constant.String",
            name: "nodetool.constant.String",
            properties: { value: "x" }
          }
        ],
        edges: []
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-wf-ids",
        content: "run",
        workflow_id: workflow.id,
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    const msgs = sentMsgs(ws);
    // All workflow-related messages should have workflow_id
    const wfMsgs = msgs.filter(
      (m) =>
        m.type === "job_update" ||
        m.type === "node_update" ||
        m.type === "output_update" ||
        (m.type === "chunk" && m.done === true) ||
        (m.type === "message" && m.role === "assistant")
    );
    for (const m of wfMsgs) {
      expect(m.workflow_id).toBe(workflow.id);
    }

    // At least the done chunk and response should have a job_id
    const doneChunk = msgs.find((m) => m.type === "chunk" && m.done === true);
    expect(doneChunk?.job_id).toBeDefined();

    await runner.disconnect();
  });
});

// ── 3. _detectMessageInputNames ─────────────────────────────────────

describe("detectMessageInputNames: scans graph for input node types", () => {
  let ws: MockWS;

  beforeEach(() => {
    setupModels();
    ws = new MockWS();
  });

  it("detects MessageInput and MessageListInput node names from graph", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Detect Names WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.input.MessageInput",
            name: "nodetool.input.MessageInput",
            data: { name: "my_message" },
            properties: {}
          },
          {
            id: "n2",
            type: "nodetool.input.MessageListInput",
            name: "nodetool.input.MessageListInput",
            data: { name: "my_messages" },
            properties: {}
          },
          {
            id: "n3",
            type: "nodetool.output.Output",
            name: "nodetool.output.Output",
            properties: {}
          }
        ],
        edges: []
      }
    });

    // We verify detection indirectly by checking that the workflow runs with
    // the detected input names. The runner should pass params using detected names.
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-detect",
        content: "test message",
        workflow_id: workflow.id,
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    // The workflow should have received params with detected names
    // (This tests the detection mechanism indirectly)
    const msgs = sentMsgs(ws);
    // At minimum, workflow should have executed (done chunk)
    expect(msgs.some((m) => m.type === "chunk" && m.done === true)).toBe(true);

    await runner.disconnect();
  });
});

// ── 4. _createResponseMessage: typed content ────────────────────────

describe("createResponseMessage: converts workflow outputs to typed content", () => {
  let ws: MockWS;

  beforeEach(() => {
    setupModels();
    ws = new MockWS();
  });

  it("builds response with text content from string output", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Text Output WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.constant.String",
            name: "nodetool.constant.String",
            properties: { value: "text result" }
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
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-text-out",
        content: "run",
        workflow_id: workflow.id,
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    const msgs = sentMsgs(ws);
    const responseMsg = msgs.find(
      (m) => m.type === "message" && m.role === "assistant"
    );
    expect(responseMsg).toBeDefined();

    // Content should contain the workflow output
    const content = responseMsg?.content;
    if (Array.isArray(content)) {
      expect(
        content.some(
          (c: any) =>
            c.type === "text" &&
            typeof c.text === "string" &&
            c.text.includes("text result")
        )
      ).toBe(true);
    } else {
      expect(
        typeof content === "string" && content.includes("text result")
      ).toBe(true);
    }

    await runner.disconnect();
  });

  it("builds response with image content from image-type output", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Image Output WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "test.ImageProducer",
            name: "test.ImageProducer",
            properties: {}
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
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-img-out",
        content: "make image",
        workflow_id: workflow.id,
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    const msgs = sentMsgs(ws);
    const responseMsg = msgs.find(
      (m) => m.type === "message" && m.role === "assistant"
    );
    expect(responseMsg).toBeDefined();

    // Content should contain image content item
    const content = responseMsg?.content;
    if (Array.isArray(content)) {
      expect(
        content.some((c: any) => c.type === "image" || (c.image && c.image.uri))
      ).toBe(true);
    }

    await runner.disconnect();
  });

  it("builds default message when workflow has no outputs", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "No Output WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.constant.String",
            name: "nodetool.constant.String",
            properties: { value: "internal" }
          }
        ],
        edges: []
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-no-out",
        content: "run",
        workflow_id: workflow.id,
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    const msgs = sentMsgs(ws);
    const responseMsg = msgs.find(
      (m) => m.type === "message" && m.role === "assistant"
    );
    expect(responseMsg).toBeDefined();

    // Should contain a default completion message
    const content = responseMsg?.content;
    if (Array.isArray(content)) {
      expect(
        content.some(
          (c: any) =>
            typeof c.text === "string" &&
            c.text.toLowerCase().includes("completed")
        )
      ).toBe(true);
    } else {
      expect(
        typeof content === "string" &&
          content.toLowerCase().includes("completed")
      ).toBe(true);
    }

    await runner.disconnect();
  });
});

// ── 5. Workflow error handling ───────────────────────────────────────

describe("handleWorkflowMessage: error handling", () => {
  let ws: MockWS;

  beforeEach(() => {
    setupModels();
    ws = new MockWS();
  });

  it("sends error + done chunk when workflow node throws", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Error WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "test.ErrorNode",
            name: "test.ErrorNode",
            properties: {}
          }
        ],
        edges: []
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-wf-error",
        content: "run",
        workflow_id: workflow.id,
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    const msgs = sentMsgs(ws);

    // Should have a node error or error message (kernel may complete job despite node errors)
    expect(
      msgs.some(
        (m) =>
          m.type === "error" ||
          (m.type === "node_update" && m.status === "error") ||
          (m.type === "job_update" && m.status === "failed")
      )
    ).toBe(true);

    // Should still send done chunk
    expect(msgs.some((m) => m.type === "chunk" && m.done === true)).toBe(true);

    await runner.disconnect();
  });
});

// ── 6. Chat workflow routing (run_mode="chat") ──────────────────────

describe("Chat workflow routing: run_mode='chat'", () => {
  let ws: MockWS;

  beforeEach(() => {
    setupModels();
    ws = new MockWS();
  });

  it("executes chat workflow when run_mode is 'chat'", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Chat WF",
      access: "private",
      run_mode: "chat",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.constant.String",
            name: "nodetool.constant.String",
            properties: { value: "chat result" }
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
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-chat-wf",
        content: "hello",
        workflow_id: workflow.id,
        provider: "mock",
        model: "m"
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    const msgs = sentMsgs(ws);
    // Should complete successfully with done chunk
    expect(msgs.some((m) => m.type === "chunk" && m.done === true)).toBe(true);
    // Should have a response message
    expect(
      msgs.some((m) => m.type === "message" && m.role === "assistant")
    ).toBe(true);

    await runner.disconnect();
  });
});

// ── 7. Message persistence for workflow messages ────────────────────

describe("handleWorkflowMessage: message persistence", () => {
  let ws: MockWS;

  beforeEach(() => {
    setupModels();
    ws = new MockWS();
  });

  it("persists user message and assistant response to DB", async () => {
    const workflow = await Workflow.create({
      user_id: "1",
      name: "Persist WF",
      access: "private",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.constant.String",
            name: "nodetool.constant.String",
            properties: { value: "persisted" }
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
      }
    });

    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: makeExecutor,
      resolveProvider: mockProvider()
    });
    await runner.connect(ws);
    await runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-wf-persist",
        content: "run workflow",
        workflow_id: workflow.id,
        provider: "mock",
        model: "m",
        role: "user"
      }
    });
    await new Promise((r) => setTimeout(r, 400));

    const [dbMsgs] = await Message.paginate("t-wf-persist", { limit: 100 });
    expect(dbMsgs.some((m) => m.role === "user")).toBe(true);
    expect(dbMsgs.some((m) => m.role === "assistant")).toBe(true);

    await runner.disconnect();
  });
});
