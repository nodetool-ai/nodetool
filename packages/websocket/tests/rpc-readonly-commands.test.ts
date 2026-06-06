/**
 * Integration tests for the read-only RPC commands exposed on the unified
 * WebSocket: list_workflows, get_workflow, list_assets, get_asset,
 * list_nodes, get_node.
 *
 * Drives the runner with a MockWebSocket and asserts that each request
 * produces a single `rpc_response` frame correlated by `request_id`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { unpack } from "msgpackr";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Workflow: {
      ...actual.Workflow,
      get: vi.fn(),
      find: vi.fn(),
      paginate: vi.fn()
    },
    Asset: {
      ...actual.Asset,
      find: vi.fn(),
      paginate: vi.fn()
    }
  };
});

vi.mock("@nodetool-ai/config", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    buildAssetUrl: vi.fn((filename: string) => `/api/storage/${filename}`)
  };
});

import { Workflow, Asset } from "@nodetool-ai/models";

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

const FOO_NODE = {
  node_type: "foo.Bar",
  title: "Bar",
  description: "A node",
  namespace: "foo",
  properties: [],
  outputs: [],
  layout: "default",
  recommended_models: [],
  required_settings: [],
  supports_dynamic_inputs: false,
  is_streaming_output: false,
  supports_dynamic_outputs: false
};

function makeRunner(ws: MockWebSocket) {
  const runner = new UnifiedWebSocketRunner({
    resolveExecutor: () => ({
      async process() {
        return {};
      }
    }),
    nodeRegistry: {
      listMetadata: () => [FOO_NODE],
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
  // Match the connect-time default in the production runner.
  void runner.connect(ws);
  return runner;
}

function decodeFrame(ws: MockWebSocket, idx: number): Record<string, unknown> {
  if (ws.sentBytes[idx]) {
    return unpack(ws.sentBytes[idx]) as Record<string, unknown>;
  }
  return JSON.parse(ws.sentText[idx]) as Record<string, unknown>;
}

function makeWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    user_id: "1",
    name: "Test",
    access: "private",
    run_mode: "workflow",
    tool_name: null,
    package_name: null,
    path: null,
    tags: [],
    description: "",
    thumbnail: null,
    thumbnail_url: null,
    graph: { nodes: [], edges: [] },
    settings: null,
    workspace_id: null,
    html_app: null,
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
    getEtag: () => "etag-1",
    getGraph: () => ({ nodes: [], edges: [] }),
    ...overrides
  };
}

function makeAssetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    user_id: "1",
    parent_id: "1",
    name: "x.png",
    content_type: "image/png",
    size: 1024,
    metadata: null,
    workflow_id: null,
    node_id: null,
    job_id: null,
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
    duration: null,
    ...overrides
  };
}

async function runOne(
  ws: MockWebSocket,
  runner: UnifiedWebSocketRunner,
  frame: Record<string, unknown>
): Promise<Record<string, unknown>> {
  ws.queue.push({
    type: "websocket.message",
    text: JSON.stringify(frame)
  });
  ws.queue.push({ type: "websocket.disconnect" });
  await runner.receiveMessages();
  return decodeFrame(ws, 0);
}

describe("RPC read-only commands", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    ws = new MockWebSocket();
    runner = makeRunner(ws);
  });

  afterEach(async () => {
    await runner.disconnect();
  });

  describe("list_workflows", () => {
    it("returns workflows envelope with echoed request_id", async () => {
      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [makeWorkflow({ id: "wf-1" })],
        ""
      ]);

      const out = await runOne(ws, runner, {
        command: "list_workflows",
        request_id: "r-1",
        data: { limit: 25 }
      });

      expect(out.type).toBe("rpc_response");
      expect(out.request_id).toBe("r-1");
      expect(out.command).toBe("list_workflows");
      const result = out.result as { workflows: Array<{ id: string }> };
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0]?.id).toBe("wf-1");
    });
  });

  describe("get_workflow", () => {
    it("returns the workflow when it exists", async () => {
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeWorkflow({ id: "wf-42", user_id: "1" })
      );

      const out = await runOne(ws, runner, {
        command: "get_workflow",
        request_id: "r-2",
        data: { id: "wf-42" }
      });

      expect(out.type).toBe("rpc_response");
      expect(out.request_id).toBe("r-2");
      const result = out.result as { id: string };
      expect(result.id).toBe("wf-42");
    });

    it("returns rpc_response.error for a missing workflow", async () => {
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const out = await runOne(ws, runner, {
        command: "get_workflow",
        request_id: "r-3",
        data: { id: "missing" }
      });

      expect(out.type).toBe("rpc_response");
      expect(out.result).toBeUndefined();
      const error = out.error as Record<string, unknown>;
      expect(error.trpcCode).toBe("NOT_FOUND");
    });
  });

  describe("list_assets", () => {
    it("returns assets envelope", async () => {
      (Asset.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [makeAssetRow({ id: "a1" })],
        ""
      ]);

      const out = await runOne(ws, runner, {
        command: "list_assets",
        request_id: "r-4",
        data: { page_size: 50 }
      });

      expect(out.type).toBe("rpc_response");
      expect(out.request_id).toBe("r-4");
      const result = out.result as { assets: Array<{ id: string }> };
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0]?.id).toBe("a1");
    });
  });

  describe("get_asset", () => {
    it("returns rpc_response.error when the asset does not exist", async () => {
      (Asset.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const out = await runOne(ws, runner, {
        command: "get_asset",
        request_id: "r-5",
        data: { id: "missing" }
      });

      expect(out.type).toBe("rpc_response");
      const error = out.error as Record<string, unknown>;
      expect(error.trpcCode).toBe("NOT_FOUND");
    });
  });

  describe("list_nodes", () => {
    it("returns the registry's node metadata as a summary", async () => {
      const out = await runOne(ws, runner, {
        command: "list_nodes",
        request_id: "r-6",
        data: { fields: "summary" }
      });

      expect(out.type).toBe("rpc_response");
      expect(out.request_id).toBe("r-6");
      const result = out.result as {
        nodes: Array<{ node_type: string; title: string }>;
      };
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0]?.node_type).toBe("foo.Bar");
    });
  });

  describe("get_node", () => {
    it("returns full metadata for a known node_type", async () => {
      const out = await runOne(ws, runner, {
        command: "get_node",
        request_id: "r-7",
        data: { node_type: "foo.Bar" }
      });

      const result = out.result as {
        node_type: string;
        properties: unknown[];
      };
      expect(result.node_type).toBe("foo.Bar");
      expect(Array.isArray(result.properties)).toBe(true);
    });

    it("returns rpc_response.error for an unknown node_type", async () => {
      const out = await runOne(ws, runner, {
        command: "get_node",
        request_id: "r-8",
        data: { node_type: "does.not.Exist" }
      });

      const error = out.error as Record<string, unknown>;
      expect(error.trpcCode).toBe("NOT_FOUND");
      expect(typeof error.message).toBe("string");
      expect(error.message as string).toContain("does.not.Exist");
    });
  });

  describe("envelope behavior", () => {
    it("returns a legacy single-shot error when request_id is missing", async () => {
      const out = await runOne(ws, runner, {
        command: "list_workflows",
        data: {}
      });

      // Note: legacy error shape (no `type: rpc_response`)
      expect(out.type).toBeUndefined();
      expect(out.error).toContain("request_id is required");
    });

    it("delivers rpc_response over text frames in text mode", async () => {
      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [],
        ""
      ]);

      // Switch to text mode first, then send the RPC. Both frames produce
      // responses, so we expect text frames in order.
      ws.queue.push({
        type: "websocket.message",
        text: JSON.stringify({
          command: "set_mode",
          data: { mode: "text" }
        })
      });
      ws.queue.push({
        type: "websocket.message",
        text: JSON.stringify({
          command: "list_workflows",
          request_id: "r-9",
          data: {}
        })
      });
      ws.queue.push({ type: "websocket.disconnect" });
      await runner.receiveMessages();

      // First frame is the set_mode ack (binary, queued before mode flipped).
      // The second frame is the rpc_response which should arrive as text.
      expect(ws.sentText.length).toBeGreaterThan(0);
      const last = JSON.parse(
        ws.sentText[ws.sentText.length - 1]
      ) as Record<string, unknown>;
      expect(last.type).toBe("rpc_response");
      expect(last.request_id).toBe("r-9");
    });
  });
});
