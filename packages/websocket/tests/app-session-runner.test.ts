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
  recordInvocation,
  setApplicationBudget
} from "@nodetool-ai/models";

import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";

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
  await setApplicationBudget(application.id, { maxInvocations: 100 });
  const release = await publishApplication(application);
  return { application, version: release.version };
};

const appRunner = (applicationId: string, version: number) =>
  new WebSocketClientSession({
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
    const runner = new WebSocketClientSession({
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

  it("refuses a run that does not name a published operation", async () => {
    const { application, version } = await seedPublishedApp();
    const runner = appRunner(application.id, version);
    const ws = new MockWS();
    await runner.connect(ws);

    await runner.runJob({ workflow_id: "wf-published" });

    await vi.waitFor(() => {
      expect(
        sentMsgs(ws).some(
          (m) =>
            m.type === "job_update" &&
            m.status === "failed" &&
            m.error === "This app run did not name an operation"
        )
      ).toBe(true);
    });
  });

  it("runs the release's pinned graph, whatever graph the client sent", async () => {
    const { application, version } = await seedPublishedApp();
    const runner = appRunner(application.id, version);
    const ws = new MockWS();
    await runner.connect(ws);

    const visitorJobId = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";
    await runner.runJob({
      job_id: visitorJobId,
      workflow_id: "wf-the-owners-private-one",
      job_name: "The visitor's label",
      operation_id: "main",
      // A visitor who edits the payload runs the published graph regardless.
      graph: {
        nodes: [{ id: "smuggled", type: "nodetool.code.Code" }],
        edges: []
      },
      application_id: "somebody-elses-app"
    });

    await vi.waitFor(() => {
      expect(
        sentMsgs(ws).some((m) => m.type === "job_update" && m.status !== "failed")
      ).toBe(true);
    });
    // Nothing was refused, and the ledger filed the run under this app.
    expect(
      sentMsgs(ws).some(
        (m) => m.type === "job_update" && m.status === "failed"
      )
    ).toBe(false);
    const update = sentMsgs(ws).find(
      (m) => m.type === "job_update" && m.status !== "failed"
    );
    // The visitor's own id survives, so its frames reach the page that asked
    // for the run, and the ledger files it under this app.
    expect(update?.job_id).toBe(visitorJobId);
    expect(
      await invocationBelongsToApplication(application.id, visitorJobId)
    ).toBe(true);
  });

  it("refuses a run id that is not a generated one", async () => {
    const { application, version } = await seedPublishedApp();
    const runner = appRunner(application.id, version);
    const ws = new MockWS();
    await runner.connect(ws);

    await runner.runJob({
      job_id: "job-ok",
      workflow_id: "wf-published",
      operation_id: "main"
    });

    expect(
      sentMsgs(ws).some(
        (m) =>
          m.type === "job_update" &&
          m.status === "failed" &&
          m.job_id === "job-ok" &&
          m.error === "This app run named an invalid run id"
      )
    ).toBe(true);
    expect(
      await invocationBelongsToApplication(application.id, "job-ok")
    ).toBe(false);
  });

  it("refuses a run id another run already took", async () => {
    const { application, version } = await seedPublishedApp();
    const taken = "6f9619ff-8b86-4d11-b42d-00c04fc96400";
    await recordInvocation({
      applicationId: application.id,
      invocationId: taken,
      userId: USER
    });
    const runner = appRunner(application.id, version);
    const ws = new MockWS();
    await runner.connect(ws);

    await runner.runJob({
      job_id: taken,
      workflow_id: "wf-published",
      operation_id: "main"
    });

    expect(
      sentMsgs(ws).some(
        (m) =>
          m.type === "job_update" &&
          m.status === "failed" &&
          m.job_id === taken &&
          m.error === "This app run named a run id that is already in use"
      )
    ).toBe(true);
  });

  it("refuses a session after a newer compatible release is published", async () => {
    const { application, version } = await seedPublishedApp();
    await publishApplication(application);
    const runner = appRunner(application.id, version);
    const ws = new MockWS();
    await runner.connect(ws);

    await runner.runJob({
      job_id: "6f9619ff-8b86-4d11-b42d-00c04fc96411",
      workflow_id: "wf-published",
      operation_id: "main"
    });

    expect(
      sentMsgs(ws).some(
        (m) =>
          m.type === "job_update" &&
          m.status === "failed" &&
          m.error === "This app has been updated. Reload the page before running it."
      )
    ).toBe(true);
    expect(
      await invocationBelongsToApplication(
        application.id,
        "6f9619ff-8b86-4d11-b42d-00c04fc96411"
      )
    ).toBe(false);
  });

  it("stops an existing session after an incompatible publish", async () => {
    const { application, version } = await seedPublishedApp();
    const incompatible = createEmptyDocument("Demo");
    incompatible.operations = [
      {
        id: "main",
        name: "Run",
        workflowId: "wf-published",
        inputs: {},
        outputs: {},
        policy: "replace"
      }
    ];
    incompatible.resources = [
      { id: "library", name: "Library", kind: "asset", operations: ["read"] }
    ];
    const changed = await Application.updateFieldsIfUnchanged(
      application.id,
      application.updated_at,
      { document: JSON.stringify(incompatible) }
    );
    if (!changed) throw new Error("Expected application update to succeed");
    await publishApplication(changed);

    const runner = appRunner(application.id, version);
    const ws = new MockWS();
    await runner.connect(ws);
    await runner.runJob({ workflow_id: "wf-published", operation_id: "main" });

    expect(
      sentMsgs(ws).some(
        (m) =>
          m.type === "job_update" &&
          m.status === "failed" &&
          m.error === "This app is not available"
      )
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
