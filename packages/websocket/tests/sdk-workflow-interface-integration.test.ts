import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { unpack } from "msgpackr";

vi.mock("@nodetool-ai/node-sdk", async (orig) => ({
  ...(await orig<typeof import("@nodetool-ai/node-sdk")>()),
  deriveWorkflowInterfaceV1: (
    await import("../../node-sdk/src/workflow-interface.js")
  ).deriveWorkflowInterfaceV1
}));

import {
  initTestDb,
  Workflow,
  WorkflowCollaborator
} from "@nodetool-ai/models";
import {
  NodeRegistry,
  type NodeMetadata
} from "@nodetool-ai/node-sdk";
import workflowsRoutes from "../src/routes/workflows.js";
import sdkV1Routes from "../src/routes/sdk-v1.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";

const createCaller = createCallerFactory(appRouter);
const DISABLE_FLAG = "NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1";
const OWNER_ID = "sdk-owner";
const VIEWER_ID = "sdk-viewer";
const UNAUTHORIZED_ID = "sdk-unauthorized";

const STRING_INPUT_METADATA: NodeMetadata = {
  title: "String Input",
  description: "",
  namespace: "nodetool.input",
  node_type: "nodetool.input.StringInput",
  properties: [],
  outputs: [
    {
      name: "output",
      type: { type: "str", optional: false, type_args: [] }
    }
  ]
};

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  readonly sentBytes: Uint8Array[] = [];
  readonly sentText: string[] = [];
  readonly queue: WebSocketReceiveFrame[] = [];

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

interface RpcResponse {
  readonly type: string;
  readonly request_id: string;
  readonly command?: string;
  readonly result?: unknown;
  readonly error?: Record<string, unknown>;
}

function makeRegistry(): NodeRegistry {
  return new NodeRegistry({
    metadataByType: new Map([
      [STRING_INPUT_METADATA.node_type, STRING_INPUT_METADATA]
    ])
  });
}

function makeContext(userId: string, registry: NodeRegistry): Context {
  return {
    userId,
    registry,
    apiOptions: { registry },
    pythonBridge: {} as never,
    getPythonBridgeReady: () => true
  };
}

async function createWorkflow(args: {
  readonly ownerId?: string;
  readonly access?: "private" | "public";
  readonly name?: string;
  readonly largeDefault?: boolean;
} = {}): Promise<Workflow> {
  const defaultValue = args.largeDefault
    ? { type: "image", data: "x".repeat(100_000) }
    : "hello";
  return (await Workflow.create({
    user_id: args.ownerId ?? OWNER_ID,
    name: args.name ?? "SDK contract workflow",
    description: "Transport parity fixture",
    access: args.access ?? "private",
    graph: {
      nodes: [
        {
          id: "input-1",
          type: "nodetool.input.StringInput",
          properties: { name: "prompt", value: defaultValue }
        },
        {
          id: "output-1",
          type: "nodetool.output.Output",
          properties: { name: "text" }
        }
      ],
      edges: [
        {
          id: "edge-1",
          source: "input-1",
          sourceHandle: "output",
          target: "output-1",
          targetHandle: "value"
        }
      ]
    }
  })) as Workflow;
}

async function requestWebSocket(
  registry: NodeRegistry,
  userId: string,
  command: string,
  data: Record<string, unknown>
): Promise<RpcResponse> {
  const socket = new MockWebSocket();
  const runner = new UnifiedWebSocketRunner({
    userId,
    resolveExecutor: () =>
      ({
        async process() {
          return {};
        }
      }) as never,
    nodeRegistry: registry,
    apiOptions: { registry },
    pythonBridge: {} as never,
    getPythonBridgeReady: () => true
  });
  await runner.connect(socket, userId);
  socket.queue.push({
    type: "websocket.message",
    text: JSON.stringify({
      command,
      request_id: `integration-${command}`,
      data
    })
  });
  socket.queue.push({ type: "websocket.disconnect" });

  try {
    await runner.receiveMessages();
    const bytes = socket.sentBytes[0];
    if (bytes) {
      return unpack(bytes) as RpcResponse;
    }
    const text = socket.sentText[0];
    if (!text) {
      throw new Error("WebSocket RPC did not emit a response");
    }
    return JSON.parse(text) as RpcResponse;
  } finally {
    await runner.disconnect();
  }
}

describe("SDK workflow-interface transport integration", () => {
  let app: FastifyInstance;
  let registry: NodeRegistry;

  beforeEach(async () => {
    initTestDb();
    registry = makeRegistry();
    app = Fastify({ logger: false });
    app.addHook("onRequest", async (request) => {
      const userId = request.headers["x-user-id"];
      request.userId = typeof userId === "string" ? userId : null;
    });
    const routeOptions = { apiOptions: { registry } };
    await app.register(sdkV1Routes, routeOptions);
    await app.register(workflowsRoutes, routeOptions);
    await app.ready();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  it("returns identical single and bulk contracts over REST, tRPC, and WebSocket", async () => {
    vi.stubEnv(DISABLE_FLAG, "0");
    const first = await createWorkflow({ name: "First" });
    const second = await createWorkflow({ name: "Second" });
    const caller = createCaller(makeContext(OWNER_ID, registry));

    const restSingleResponse = await app.inject({
      method: "GET",
      url: `/api/workflows/${first.id}/interface?version=1`,
      headers: { "x-user-id": OWNER_ID }
    });
    const trpcSingle = await caller.workflows.interface({
      id: first.id,
      version: 1
    });
    const wsSingle = await requestWebSocket(
      registry,
      OWNER_ID,
      "get_workflow_interface",
      { id: first.id, version: 1 }
    );

    expect(restSingleResponse.statusCode, restSingleResponse.body).toBe(200);
    expect(restSingleResponse.json()).toEqual(trpcSingle);
    expect(wsSingle.result).toEqual(trpcSingle);

    const ids = [second.id, "missing-workflow", first.id];
    const restBulkResponse = await app.inject({
      method: "POST",
      url: "/api/sdk/v1/workflow-interfaces",
      headers: {
        "content-type": "application/json",
        "x-user-id": OWNER_ID
      },
      payload: { ids, version: 1 }
    });
    const trpcBulk = await caller.workflows.interfaces({ ids, version: 1 });
    const wsBulk = await requestWebSocket(
      registry,
      OWNER_ID,
      "get_workflow_interfaces",
      { ids, version: 1 }
    );

    expect(restBulkResponse.statusCode).toBe(200);
    expect(restBulkResponse.json()).toEqual(trpcBulk);
    expect(wsBulk.result).toEqual(trpcBulk);
  });

  it("returns identical compact summaries without graph data", async () => {
    vi.stubEnv(DISABLE_FLAG, "0");
    await createWorkflow({ name: "Small", largeDefault: true });
    const caller = createCaller(makeContext(OWNER_ID, registry));

    const restResponse = await app.inject({
      method: "GET",
      url: "/api/sdk/v1/workflows?limit=100",
      headers: { "x-user-id": OWNER_ID }
    });
    const trpc = await caller.workflows.sdkSummaries({ limit: 100 });
    const ws = await requestWebSocket(
      registry,
      OWNER_ID,
      "list_workflow_summaries",
      { limit: 100 }
    );

    expect(restResponse.statusCode).toBe(200);
    expect(restResponse.json()).toEqual(trpc);
    expect(ws.result).toEqual(trpc);
    expect(restResponse.body).not.toContain("graph");
    expect(restResponse.body).not.toContain("x".repeat(100));
    expect(Buffer.byteLength(restResponse.body, "utf8")).toBeLessThan(4 * 1024);
  });

  it("enforces the same viewer authorization for all transports", async () => {
    vi.stubEnv(DISABLE_FLAG, "0");
    const privateWorkflow = await createWorkflow();
    const publicWorkflow = await createWorkflow({
      ownerId: "other-owner",
      access: "public",
      name: "Public"
    });
    await WorkflowCollaborator.upsert({
      workflowId: privateWorkflow.id,
      userId: VIEWER_ID,
      role: "viewer",
      invitedBy: OWNER_ID
    });

    const allowed = [
      { userId: OWNER_ID, workflowId: privateWorkflow.id },
      { userId: VIEWER_ID, workflowId: privateWorkflow.id },
      { userId: UNAUTHORIZED_ID, workflowId: publicWorkflow.id }
    ];
    for (const scenario of allowed) {
      const caller = createCaller(makeContext(scenario.userId, registry));
      const rest = await app.inject({
        method: "GET",
        url: `/api/workflows/${scenario.workflowId}/interface?version=1`,
        headers: { "x-user-id": scenario.userId }
      });
      const trpc = await caller.workflows.interface({
        id: scenario.workflowId,
        version: 1
      });
      const ws = await requestWebSocket(
        registry,
        scenario.userId,
        "get_workflow_interface",
        { id: scenario.workflowId, version: 1 }
      );

      expect(rest.statusCode).toBe(200);
      expect(rest.json()).toEqual(trpc);
      expect(ws.result).toEqual(trpc);
    }

    const denied = [
      { userId: UNAUTHORIZED_ID, workflowId: privateWorkflow.id },
      { userId: OWNER_ID, workflowId: "missing-workflow" }
    ];
    for (const scenario of denied) {
      const caller = createCaller(makeContext(scenario.userId, registry));
      const rest = await app.inject({
        method: "GET",
        url: `/api/workflows/${scenario.workflowId}/interface?version=1`,
        headers: { "x-user-id": scenario.userId }
      });
      const trpc = caller.workflows.interface({
        id: scenario.workflowId,
        version: 1
      });
      const ws = await requestWebSocket(
        registry,
        scenario.userId,
        "get_workflow_interface",
        { id: scenario.workflowId, version: 1 }
      );

      expect(rest.statusCode).toBe(404);
      expect(rest.json()).toEqual({
        code: "WORKFLOW_NOT_FOUND",
        message: "Workflow not found",
        retryable: false,
        detail: "Workflow not found"
      });
      await expect(trpc).rejects.toMatchObject({
        code: "NOT_FOUND",
        cause: { apiCode: "WORKFLOW_NOT_FOUND" }
      });
      expect(ws.error).toMatchObject({
        trpcCode: "NOT_FOUND",
        apiCode: "WORKFLOW_NOT_FOUND"
      });
    }
  });

  it("keeps legacy workflow JSON unchanged when the SDK kill switch is active", async () => {
    const workflow = await createWorkflow();

    vi.stubEnv(DISABLE_FLAG, "1");
    const legacyFlagOff = await app.inject({
      method: "GET",
      url: `/api/workflows/${workflow.id}`,
      headers: { "x-user-id": OWNER_ID }
    });
    const restDisabled = await app.inject({
      method: "GET",
      url: `/api/workflows/${workflow.id}/interface?version=1`,
      headers: { "x-user-id": OWNER_ID }
    });
    const disabledCaller = createCaller(makeContext(OWNER_ID, registry));
    const trpcDisabled = disabledCaller.workflows.interface({
      id: workflow.id,
      version: 1
    });
    const wsDisabled = await requestWebSocket(
      registry,
      OWNER_ID,
      "get_workflow_interface",
      { id: workflow.id, version: 1 }
    );

    expect(restDisabled.statusCode).toBe(503);
    expect(restDisabled.json()).toEqual({
      code: "SDK_WORKFLOW_INTERFACE_DISABLED",
      message: "SDK workflow interface v1 is disabled",
      retryable: false,
      detail: "SDK workflow interface v1 is disabled"
    });
    await expect(trpcDisabled).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      cause: { apiCode: "SERVICE_UNAVAILABLE" }
    });
    expect(wsDisabled.error).toMatchObject({
      apiCode: "SERVICE_UNAVAILABLE"
    });

    vi.stubEnv(DISABLE_FLAG, "0");
    const legacyFlagOn = await app.inject({
      method: "GET",
      url: `/api/workflows/${workflow.id}`,
      headers: { "x-user-id": OWNER_ID }
    });

    expect(legacyFlagOff.statusCode).toBe(200);
    expect(legacyFlagOn.statusCode).toBe(200);
    expect(legacyFlagOn.body).toBe(legacyFlagOff.body);
  });

  it("keeps image-heavy graph data out of discovery responses", async () => {
    vi.stubEnv(DISABLE_FLAG, "0");
    const workflow = await createWorkflow({ largeDefault: true });
    const caller = createCaller(makeContext(OWNER_ID, registry));

    const result = await caller.workflows.interface({
      id: workflow.id,
      version: 1
    });
    const json = JSON.stringify(result);

    expect(json).not.toContain("x".repeat(100));
    expect(Buffer.byteLength(json, "utf8")).toBeLessThan(32 * 1024);
    expect(result.inputs[0]?.default).toBeNull();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "default_too_large" })
    );
  });
});
