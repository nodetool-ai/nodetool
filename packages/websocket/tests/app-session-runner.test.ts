/**
 * A deployed app's visitor reaches the runner as the app's owner. These tests
 * drive the real `handleCommand`/`runJob` path to pin what that connection can
 * and cannot do with that identity — the module tests next door cover the
 * decisions, this covers the wiring that applies them.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { unpack } from "msgpackr";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  Workflow,
  initTestDb,
  invocationBelongsToApplication,
  publishApplication,
  recordInvocation
} from "@nodetool-ai/models";

import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  async accept() {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array) {
    this.sentBytes.push(data);
  }
  async sendText() {}
  async close() {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const noopExecutor = () => ({
  async process() {
    return {};
  }
});

const sentMsgs = (ws: MockWS): Record<string, unknown>[] =>
  ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);

const USER = "owner-1";

const seedPublishedApp = async (): Promise<{
  application: Application;
  version: number;
}> => {
  await Workflow.create<Workflow>({
    id: "wf-published",
    user_id: USER,
    name: "Published",
    graph: {
      nodes: [{ id: "n1", type: "nodetool.text.Concat" }],
      edges: []
    }
  });
  const document = createEmptyDocument("Demo");
  document.operations = [
    {
      id: "main",
      name: "Run",
      workflowId: "wf-published",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  const application = await Application.create<Application>({
    user_id: USER,
    project_id: "default",
    name: "Demo app",
    document: JSON.stringify(document)
  });
  const release = await publishApplication(application);
  return { application, version: release.version };
};

const appRunner = (applicationId: string, version: number) =>
  new UnifiedWebSocketRunner({
    userId: USER,
    appSession: { applicationId, version },
    resolveExecutor: noopExecutor
  });

describe("a runner connected by a deployed app's visitor", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("refuses every command outside the run set", async () => {
    const { application, version } = await seedPublishedApp();
    const runner = appRunner(application.id, version);
    await runner.connect(new MockWS());

    for (const command of [
      "list_workflows",
      "get_workflow",
      "list_assets",
      "get_asset",
      "chat_message",
      "generate_text",
      "generate_media",
      "inference",
      "set_permission_mode"
    ]) {
      const result = await runner.handleCommand({ command, data: {} });
      expect(result).toEqual({
        error: "This command is not available for a published app"
      });
    }
  });

  it("answers those commands normally on an ordinary session", async () => {
    // The refusal above must come from the app scope, not from the commands
    // being broken.
    const runner = new UnifiedWebSocketRunner({
      userId: USER,
      resolveExecutor: noopExecutor
    });
    await runner.connect(new MockWS());
    // It reaches the RPC dispatcher and fails there for want of the wiring
    // this bare runner has none of — which is the point: nothing turned it
    // away at the scope gate.
    await expect(
      runner.handleCommand({
        command: "list_workflows",
        data: {},
        request_id: "req-1"
      })
    ).rejects.toThrow(/RPC commands require/);
  });

  it("refuses a run naming a workflow the release does not publish", async () => {
    const { application, version } = await seedPublishedApp();
    await Workflow.create<Workflow>({
      id: "wf-private",
      user_id: USER,
      name: "The owner's other workflow",
      graph: { nodes: [], edges: [] }
    });
    const runner = appRunner(application.id, version);
    const ws = new MockWS();
    await runner.connect(ws);

    await runner.runJob({ job_id: "job-1", workflow_id: "wf-private" });

    await vi.waitFor(() => {
      expect(
        sentMsgs(ws).some(
          (m) =>
            m.type === "job_update" &&
            m.status === "failed" &&
            m.job_id === "job-1" &&
            m.error === "This app does not publish that workflow"
        )
      ).toBe(true);
    });
  });

  it("runs the release's pinned graph, whatever graph the client sent", async () => {
    const { application, version } = await seedPublishedApp();
    const runner = appRunner(application.id, version);
    const ws = new MockWS();
    await runner.connect(ws);

    await runner.runJob({
      job_id: "job-ok",
      workflow_id: "wf-published",
      // A visitor who edits the payload runs the published graph regardless.
      graph: {
        nodes: [{ id: "smuggled", type: "nodetool.code.Code" }],
        edges: []
      },
      application_id: "somebody-elses-app"
    });

    await vi.waitFor(() => {
      expect(
        sentMsgs(ws).some(
          (m) => m.type === "job_update" && m.job_id === "job-ok"
        )
      ).toBe(true);
    });
    // Nothing was refused, and the ledger filed the run under this app.
    expect(
      sentMsgs(ws).some(
        (m) => m.type === "job_update" && m.status === "failed"
      )
    ).toBe(false);
    expect(
      await invocationBelongsToApplication(application.id, "job-ok")
    ).toBe(true);
  });

  it("refuses a job command for a run this app did not start", async () => {
    const { application, version } = await seedPublishedApp();
    const runner = appRunner(application.id, version);
    await runner.connect(new MockWS());

    for (const command of [
      "reconnect_job",
      "cancel_job",
      "stream_input",
      "end_input_stream"
    ]) {
      const result = await runner.handleCommand({
        command,
        data: { job_id: "the-owners-editor-run" }
      });
      expect(result).toEqual({
        error: "That run does not belong to this app"
      });
    }
  });

  it("allows a job command for a run the app's ledger records", async () => {
    const { application, version } = await seedPublishedApp();
    await recordInvocation({
      applicationId: application.id,
      version,
      invocationId: "job-of-this-app",
      operationId: "main",
      estimatedUsd: 0
    });
    const runner = appRunner(application.id, version);
    await runner.connect(new MockWS());

    const result = await runner.handleCommand({
      command: "cancel_job",
      data: { job_id: "job-of-this-app" }
    });
    expect(result).not.toEqual({
      error: "That run does not belong to this app"
    });
  });
});
