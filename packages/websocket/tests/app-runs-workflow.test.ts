import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { unpack } from "msgpackr";
import { randomUUID } from "node:crypto";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  ModelObserver,
  Workflow,
  createAppInstance,
  getAppInstance,
  getAppRun,
  initTestDb,
  listAppInstances,
  listAppRuns,
  publishApplication,
  reserveAppRun,
  setApplicationBudget
} from "@nodetool-ai/models";
import * as models from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { AppRunRecord } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";

const frameSchema = z
  .object({
    type: z.string(),
    status: z.string().optional(),
    error: z.string().nullable().optional()
  })
  .passthrough();
class RecordingSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  frames: Array<z.infer<typeof frameSchema>> = [];
  onTerminal?: () => Promise<void>;
  async accept(): Promise<void> {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
  }
  async sendBytes(bytes: Uint8Array): Promise<void> {
    const frame = frameSchema.parse(unpack(bytes));
    if (frame.type === "job_update" && frame.status === "completed") {
      await this.onTerminal?.();
    }
    this.frames.push(frame);
  }
  async sendText(text: string): Promise<void> {
    const frame = frameSchema.parse(JSON.parse(text));
    if (frame.type === "job_update" && frame.status === "completed") {
      await this.onTerminal?.();
    }
    this.frames.push(frame);
  }
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}
function graph(value = "frozen") {
  return {
    nodes: [
      {
        id: "source",
        type: "nodetool.constant.String",
        name: "Constant",
        properties: { value }
      },
      {
        id: "out",
        type: "nodetool.output.Output",
        name: "Output",
        properties: { name: "result" }
      }
    ],
    edges: [
      {
        id: "edge",
        source: "source",
        sourceHandle: "output",
        target: "out",
        targetHandle: "value",
        edge_type: "data"
      }
    ]
  };
}
function document() {
  const value = createEmptyDocument();
  value.operations = [
    {
      id: "op",
      name: "Run",
      workflowId: "wf",
      inputs: {},
      outputs: { out: { to: "variable", variableId: "result" } },
      policy: "parallel"
    }
  ];
  value.variables = [
    {
      id: "result",
      name: "Result",
      type: { type: "str" },
      default: "",
      scope: "user",
      persist: true
    }
  ];
  return value;
}
const sessions: WebSocketClientSession[] = [];
beforeEach(() => initTestDb());
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.disconnect()));
  ModelObserver.clear();
  vi.restoreAllMocks();
});
async function reservedRun() {
  const instance = await createAppInstance({
    userId: "u1",
    sourceId: "example:transport",
    snapshot: {
      document: document(),
      workflow_graphs: { wf: graph() },
      script_documents: {}
    },
    variables: { result: "initial", __app_outputs: { "older:slot": "keep" } }
  });
  const reserved = await reserveAppRun({
    userId: "u1",
    instanceId: instance.id,
    operationId: "op",
    invocationId: randomUUID(),
    origin: "ui"
  });
  if (!reserved.allowed) throw new Error(reserved.reason);
  return { instance, run: reserved.run };
}
function sessionFor(
  observed: Array<{
    value: unknown;
    context: ProcessingContext;
    persisted: AppRunRecord | null;
  }>,
  scope?: { applicationId: string; version: number }
) {
  const session = new WebSocketClientSession({
    appSession: scope,
    resolveExecutor: (node) => ({
      async process(
        inputs: Record<string, unknown>,
        context: ProcessingContext
      ) {
        if (node.type === "nodetool.constant.String") {
          const run = context.appRunContext;
          const persisted = run
            ? await getAppRun(run.userId, run.appRunId)
            : null;
          observed.push({ value: inputs.value, context, persisted });
        }
        return { output: inputs.value ?? null };
      }
    })
  });
  sessions.push(session);
  return session;
}
async function waitCompleted(id: string) {
  await vi.waitFor(async () => {
    expect((await getAppRun("u1", id))?.status).toBe("completed");
  });
}

describe("durable app workflow transport", () => {
  it("executes the frozen graph under reserved identity and commits outputs before its terminal frame", async () => {
    const { instance, run } = await reservedRun();
    const observations: Array<{
      value: unknown;
      context: ProcessingContext;
      persisted: AppRunRecord | null;
    }> = [];
    const socket = new RecordingSocket();
    const session = sessionFor(observations);
    const terminalRecords: Array<{
      status: string | undefined;
      variables: Record<string, unknown> | undefined;
    }> = [];
    socket.onTerminal = async () => {
      terminalRecords.push({
        status: (await getAppRun("u1", run.id))?.status,
        variables: (await getAppInstance("u1", instance.id))?.variables
      });
    };
    await session.connect(socket, "u1");
    const request = {
      job_id: run.invocation_id,
      app_run_id: run.id,
      instance_id: instance.id,
      operation_id: "op",
      graph: graph("tampered"),
      params: {},
      require_terminal_result: true
    };
    await session.handleCommand({ command: "run_job", data: request });
    await waitCompleted(run.id);
    await vi.waitFor(() => expect(terminalRecords).toHaveLength(1));
    expect(observations).toHaveLength(1);
    expect(observations[0]?.value).toBe("frozen");
    expect(observations[0]?.persisted?.status).toBe("running");
    expect(observations[0]?.context.appRunContext).toMatchObject({
      appRunId: run.id,
      instanceId: instance.id,
      traceId: run.trace_id,
      userId: "u1",
      origin: "ui"
    });
    expect(terminalRecords[0]).toEqual({
      status: "completed",
      variables: {
        result: "frozen",
        __app_outputs: { "older:slot": "keep", "op:out": "frozen" }
      }
    });
    await session.handleCommand({ command: "run_job", data: request });
    expect(observations).toHaveLength(1);
    expect((await getAppRun("u1", run.id))?.status).toBe("completed");
  });
  it.each(["deleted", "database unavailable"])(
    "preserves a completed kernel outcome when app run settlement is %s",
    async (failure) => {
      const { instance, run } = await reservedRun();
      const original = models.settleAppRun;
      vi.spyOn(models, "settleAppRun").mockImplementation(async (...args) => {
        if (failure === "deleted") {
          await models.deleteAppRun(args[0], args[1]);
          return original(...args);
        }
        throw new Error("Settlement database unavailable");
      });
      const observations: Parameters<typeof sessionFor>[0] = [];
      const socket = new RecordingSocket();
      const session = sessionFor(observations);
      await session.connect(socket, "u1");
      await session.handleCommand({
        command: "run_job",
        data: {
          job_id: run.invocation_id,
          app_run_id: run.id,
          instance_id: instance.id,
          operation_id: "op",
          params: {},
          require_terminal_result: true
        }
      });
      await vi.waitFor(() => {
        expect(
          socket.frames.some(
            (frame) =>
              frame.type === "job_update" && frame.status === "completed"
          )
        ).toBe(true);
      });
      expect(
        socket.frames.filter(
          (frame) => frame.type === "job_update" && frame.status === "failed"
        )
      ).toEqual([]);
      expect((await models.Job.find("u1", run.invocation_id))?.status).toBe(
        "completed"
      );
      if (failure === "deleted") {
        expect(await getAppRun("u1", run.id)).toBeNull();
      }
    }
  );

  it("closes a claimed run when oversized resolved inputs reject admission", async () => {
    const { instance, run } = await reservedRun();
    const observations: Parameters<typeof sessionFor>[0] = [];
    const socket = new RecordingSocket();
    const session = sessionFor(observations);
    await session.connect(socket, "u1");
    await session.handleCommand({
      command: "run_job",
      data: {
        job_id: run.invocation_id,
        app_run_id: run.id,
        instance_id: instance.id,
        operation_id: "op",
        params: Object.fromEntries(
          Array.from({ length: 100 }, (_, index) => [
            `input-${index}`,
            "x ".repeat(10000)
          ])
        ),
        require_terminal_result: true
      }
    });
    const failed = await getAppRun("u1", run.id);
    expect(failed?.execution_started_at).not.toBeNull();
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toContain("storage limit");
    expect(failed?.actual_usd).toBe(0);
    expect(observations).toEqual([]);
  });

  it("accepts compact run and instance ids and refuses a foreign owner before executing", async () => {
    const { instance, run } = await reservedRun();
    const observations: Array<{
      value: unknown;
      context: ProcessingContext;
      persisted: AppRunRecord | null;
    }> = [];
    const request = {
      job_id: run.invocation_id,
      app_run_id: run.id.slice(0, 12),
      instance_id: instance.id.slice(0, 12),
      operation_id: "op",
      graph: graph("tampered"),
      params: {},
      require_terminal_result: true
    };
    const foreignSocket = new RecordingSocket();
    const foreign = sessionFor(observations);
    await foreign.connect(foreignSocket, "u2");
    await foreign.handleCommand({
      command: "run_job",
      data: { ...request, user_id: "u1" }
    });
    expect(observations).toHaveLength(0);
    expect((await getAppRun("u1", run.id))?.status).toBe("running");
    expect(
      foreignSocket.frames.some((frame) => frame.error === "App run not found")
    ).toBe(true);
    const ownerSocket = new RecordingSocket();
    const owner = sessionFor(observations);
    await owner.connect(ownerSocket, "u1");
    await owner.handleCommand({ command: "run_job", data: request });
    await waitCompleted(run.id);
    expect(observations).toHaveLength(1);
  });
  it("constrains visitor work to the published graph and stores only public run metadata", async () => {
    await Workflow.create<Workflow>({
      id: "wf",
      user_id: "u1",
      graph: graph("published")
    });
    const app = await Application.create<Application>({
      user_id: "u1",
      document: JSON.stringify(document())
    });
    const release = await publishApplication(app);
    await setApplicationBudget(app.id, { maxInvocations: 10 });
    const observations: Array<{
      value: unknown;
      context: ProcessingContext;
      persisted: AppRunRecord | null;
    }> = [];
    const socket = new RecordingSocket();
    const visitor = sessionFor(observations, {
      applicationId: app.id,
      version: release.version
    });
    await visitor.connect(socket, "u1");
    await visitor.handleCommand({
      command: "run_job",
      data: {
        job_id: randomUUID(),
        operation_id: "op",
        graph: graph("visitor-tampered"),
        params: { private_input: "visitor-private" },
        user_id: "foreign",
        application_id: "foreign-app",
        require_terminal_result: true
      }
    });
    await vi.waitFor(() => expect(observations).toHaveLength(1));
    const identity = observations[0]?.context.appRunContext;
    if (!identity) throw new Error("Missing public run context");
    await waitCompleted(identity.appRunId);
    expect(observations[0]?.value).toBe("published");
    expect(identity.origin).toBe("public");
    expect(identity.userId).toBe("u1");
    const run = await getAppRun("u1", identity.appRunId);
    expect(run?.snapshot).toBeNull();
    expect(run?.inputs).toBeNull();
    expect(run?.outputs).toBeNull();
    expect(JSON.stringify(run)).not.toContain("visitor-private");
    expect(
      (await getAppInstance("u1", identity.instanceId))?.variables
    ).toEqual({});
    expect(
      (await listAppRuns("u1", identity.instanceId)).map((item) => item.id)
    ).toContain(identity.appRunId);
    await expect(listAppInstances("foreign", app.id)).rejects.toMatchObject({
      code: "not_found"
    });
  });
});
