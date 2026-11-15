/**
 * Chat turns, editor workflow runs, headless jobs and JS script runs read and
 * write the folder of their own project (PRD D3, T2, US4, US11).
 *
 * Each run type is checked in a local folder and in object storage, with two
 * projects so a file landing in the wrong one shows. A missing local folder
 * refuses the run with a message naming the folder.
 */
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { unpack } from "msgpackr";
import {
  JsScript,
  ModelObserver,
  Thread,
  Workflow,
  initTestDb,
  type Workspace as WorkspaceRow
} from "@nodetool-ai/models";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import {
  resolveProjectWorkspace,
  setWorkspaceCloudStorage,
  workspaceFromRow
} from "@nodetool-ai/execution/service";
import { startHeadlessJob } from "../src/headless-job-runner.js";
import jsScriptsRoutes from "../src/routes/js-scripts.js";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import {
  fakeProvider,
  makeChatTurnHarness,
  type GenerateLoopArgs
} from "./chat-turn-test-harness.js";
import {
  personalWithFolder,
  projectWithFolder,
  useProjectFolders,
  type ProjectFolderFixture
} from "./project-folder-fixture.js";

const USER = "1";

let folders: ProjectFolderFixture;

async function fileIn(row: WorkspaceRow, path: string): Promise<string | null> {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return workspace.readText(path);
}

async function namesIn(row: WorkspaceRow): Promise<string[]> {
  const workspace = workspaceFromRow(row);
  if (!workspace) throw new Error("no workspace for row");
  return (await workspace.list("", { recursive: true })).map((e) => e.path);
}

/** Writes one file into the run's workspace. */
class WriteRunFile extends BaseNode {
  static readonly nodeType = "test.folders.WriteRunFile";
  static readonly title = "Write run file";
  static readonly description = "Writes a file into the run's workspace";
  static readonly metadataOutputTypes = { output: "str" };

  async process(context: ProcessingContext): Promise<Record<string, unknown>> {
    if (!context.workspace) throw new Error("The run has no workspace");
    await context.workspace.write("job.txt", "written by the job");
    return { output: "ok" };
  }
}

async function workflowIn(projectId: string): Promise<Workflow> {
  return (await Workflow.create({
    user_id: USER,
    name: "Writes a file",
    project_id: projectId,
    graph: {
      nodes: [{ id: "write", type: WriteRunFile.nodeType, data: {} }],
      edges: []
    }
  })) as Workflow;
}

/** A chat turn whose model writes two files, moving the thread in between. */
async function agentTurn(
  threadId: string,
  between: () => Promise<void> = async () => {}
): Promise<{ results: unknown[]; errors: string[]; providerCalled: boolean }> {
  const results: unknown[] = [];
  let providerCalled = false;
  const harness = makeChatTurnHarness({
    session: {
      workspaceResolver: resolveProjectWorkspace,
      resolveProvider: async () =>
        fakeProvider({
          generateLoop: async function* (args: GenerateLoopArgs) {
            providerCalled = true;
            results.push(
              await args.executeTool?.({
                id: "call_write_1",
                name: "write_file",
                args: { file_path: "agent.txt", content: "first" }
              })
            );
            await between();
            results.push(
              await args.executeTool?.({
                id: "call_write_2",
                name: "write_file",
                args: { file_path: "later.txt", content: "second" }
              })
            );
            results.push(
              await args.executeTool?.({
                id: "call_list",
                name: "list_directory",
                args: { path: "." }
              })
            );
            yield { type: "chunk", content: "done", done: true };
          }
        })
    }
  });
  await harness.handler.handleChatMessage({
    thread_id: threadId,
    content: "write some files",
    provider: "mock",
    model: "m",
    permission_mode: "auto"
  });
  const errors = harness.session
    .messagesOfType("error")
    .map((frame) => String(frame.message));
  return { results, errors, providerCalled };
}

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];

  async accept(): Promise<void> {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
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
  frames(): Record<string, unknown>[] {
    return [
      ...this.sentBytes.map((b) => unpack(b) as Record<string, unknown>),
      ...this.sentText.map((t) => JSON.parse(t) as Record<string, unknown>)
    ];
  }
}

/** Runs a saved workflow the way the editor's Run button does. */
async function editorRun(workflowId: string): Promise<Record<string, unknown>> {
  const ws = new MockWebSocket();
  const session = new WebSocketClientSession({
    workspaceResolver: resolveProjectWorkspace,
    resolveExecutor: () => ({
      async process(_inputs: Record<string, unknown>, context?: ProcessingContext) {
        if (!context?.workspace) throw new Error("The run has no workspace");
        await context.workspace.write("editor.txt", "written by the editor run");
        return { output: "ok" };
      }
    })
  });
  await session.connect(ws, USER);
  const jobId = `editor-${Date.now()}`;
  await session.jobs.runJob({ job_id: jobId, workflow_id: workflowId });
  const deadline = Date.now() + 5000;
  for (;;) {
    const terminal = ws
      .frames()
      .find(
        (f) =>
          f.type === "job_update" &&
          f.job_id === jobId &&
          ["completed", "failed", "cancelled"].includes(String(f.status))
      );
    if (terminal) {
      await session.disconnect();
      return terminal;
    }
    if (Date.now() > deadline) throw new Error("editor run did not settle");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function scriptServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = USER;
  });
  await app.register(jsScriptsRoutes, { apiOptions: {} });
  await app.ready();
  return app;
}

async function scriptIn(projectId: string, code: string): Promise<JsScript> {
  const script = new JsScript({
    user_id: USER,
    project_id: projectId,
    name: "Writes a file",
    document: JSON.stringify({
      ...emptyJsScriptDocument(),
      code,
      outputs: [{ name: "names", type: "any" }]
    })
  });
  await script.save();
  return script;
}

beforeEach(async () => {
  initTestDb();
  folders = await useProjectFolders([USER]);
});

afterEach(async () => {
  ModelObserver.clear();
  setWorkspaceCloudStorage(null);
  delete process.env["NODETOOL_WORKSPACE_STORAGE"];
  await folders.cleanup();
});

describe.each(["local", "cloud"] as const)("runs in the project folder (%s)", (mode) => {
  beforeEach(() => {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = mode;
    setWorkspaceCloudStorage(mode === "cloud" ? new InMemoryStorageAdapter() : null);
  });

  it("an agent turn in a thread of project A lists and writes A's folder", async () => {
    const a = await projectWithFolder(USER, "Film A");
    const b = await projectWithFolder(USER, "Film B");
    const thread = await Thread.create({ user_id: USER, project_id: a.project.id, title: "" });

    const { results, errors } = await agentTurn(thread.id);

    expect(errors).toEqual([]);
    expect(await fileIn(a.folder, "agent.txt")).toBe("first");
    expect(JSON.stringify(results[2])).toContain("agent.txt");
    expect(await namesIn(b.folder)).toEqual([]);
  });

  it("an agent turn keeps writing to A after its thread moves to B", async () => {
    const a = await projectWithFolder(USER, "Film A");
    const b = await projectWithFolder(USER, "Film B");
    const thread = await Thread.create({ user_id: USER, project_id: a.project.id, title: "" });

    const { errors } = await agentTurn(thread.id, async () => {
      const moved = await Thread.find(USER, thread.id);
      if (!moved) throw new Error("thread gone");
      moved.project_id = b.project.id;
      await moved.save();
    });

    expect(errors).toEqual([]);
    expect((await Thread.find(USER, thread.id))?.project_id).toBe(b.project.id);
    expect(await fileIn(a.folder, "agent.txt")).toBe("first");
    expect(await fileIn(a.folder, "later.txt")).toBe("second");
    expect(await namesIn(b.folder)).toEqual([]);
  });

  it("an agent turn in a loose thread works in Personal's folder", async () => {
    const personal = await personalWithFolder(USER);
    const a = await projectWithFolder(USER, "Film A");
    const thread = await Thread.create({ user_id: USER, project_id: "default", title: "" });

    const { errors } = await agentTurn(thread.id);

    expect(errors).toEqual([]);
    expect(await fileIn(personal.folder, "agent.txt")).toBe("first");
    expect(await namesIn(a.folder)).toEqual([]);
  });

  it("an agent turn creates Personal with its folder when nothing else has", async () => {
    const thread = await Thread.create({ user_id: USER, project_id: "default", title: "" });

    const { errors } = await agentTurn(thread.id);

    expect(errors).toEqual([]);
    const personal = await personalWithFolder(USER);
    expect(await fileIn(personal.folder, "agent.txt")).toBe("first");
  });

  it("an editor run of a workflow in project A writes A's folder", async () => {
    const a = await projectWithFolder(USER, "Film A");
    const b = await projectWithFolder(USER, "Film B");
    const workflow = await workflowIn(a.project.id);

    const terminal = await editorRun(workflow.id);

    expect(terminal.status).toBe("completed");
    expect(await fileIn(a.folder, "editor.txt")).toBe("written by the editor run");
    expect(await namesIn(b.folder)).toEqual([]);
  });

  it("a headless job of a workflow in project A writes A's folder", async () => {
    const a = await projectWithFolder(USER, "Film A");
    const b = await projectWithFolder(USER, "Film B");
    const workflow = await workflowIn(a.project.id);
    const registry = new NodeRegistry();
    registry.register(WriteRunFile);

    const result = await startHeadlessJob({ workflowId: workflow.id, userId: USER, registry });

    expect(result.status).toBe("completed");
    expect(await fileIn(a.folder, "job.txt")).toBe("written by the job");
    expect(await namesIn(b.folder)).toEqual([]);
  });

  it("a JS script of project A lists and writes A's folder, and cannot reach .nodetool/", async () => {
    const a = await projectWithFolder(USER, "Film A");
    const b = await projectWithFolder(USER, "Film B");
    const script = await scriptIn(
      a.project.id,
      [
        'await workspace.write("script.txt", "written by the script");',
        "let refused = false;",
        'try { await workspace.write(".nodetool/project.json", "{}"); } catch { refused = true; }',
        'await output("names", { names: await workspace.list(""), refused });'
      ].join("\n")
    );
    const app = await scriptServer();
    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/js-scripts/${script.id}/run`,
        payload: {}
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().outputs.names).toEqual({
        names: ["script.txt"],
        refused: true
      });
    } finally {
      await app.close();
    }
    expect(await fileIn(a.folder, "script.txt")).toBe("written by the script");
    expect(await namesIn(b.folder)).toEqual([]);
  });
});

describe("runs whose local project folder is missing", () => {
  beforeEach(() => {
    process.env["NODETOOL_WORKSPACE_STORAGE"] = "local";
  });

  /** Project A with its folder deleted, B and Personal intact. */
  async function unpluggedProject() {
    const a = await projectWithFolder(USER, "Unplugged");
    const b = await projectWithFolder(USER, "Other");
    const personal = await personalWithFolder(USER);
    await rm(a.folder.path, { recursive: true, force: true });
    const reason = `Project folder not found: ${a.folder.path}`;
    const nothingWritten = async (): Promise<void> => {
      expect(existsSync(a.folder.path)).toBe(false);
      expect(await namesIn(b.folder)).toEqual([]);
      expect(await namesIn(personal.folder)).toEqual([]);
    };
    return { a, reason, nothingWritten };
  }

  it("refuses the agent turn before the model is called", async () => {
    const { a, reason, nothingWritten } = await unpluggedProject();
    const thread = await Thread.create({ user_id: USER, project_id: a.project.id, title: "" });

    const { errors, providerCalled } = await agentTurn(thread.id);

    expect(errors).toEqual([reason]);
    expect(providerCalled).toBe(false);
    await nothingWritten();
  });

  it("refuses the editor run", async () => {
    const { a, reason, nothingWritten } = await unpluggedProject();
    const workflow = await workflowIn(a.project.id);

    const terminal = await editorRun(workflow.id);

    expect(terminal).toMatchObject({ status: "failed", error: reason });
    await nothingWritten();
  });

  it("fails the headless job before it runs", async () => {
    const { a, reason, nothingWritten } = await unpluggedProject();
    const workflow = await workflowIn(a.project.id);
    const registry = new NodeRegistry();
    registry.register(WriteRunFile);

    const result = await startHeadlessJob({ workflowId: workflow.id, userId: USER, registry });

    expect(result).toMatchObject({ status: "failed", error: reason });
    await nothingWritten();
  });

  it("refuses the JS script run", async () => {
    const { a, reason, nothingWritten } = await unpluggedProject();
    const script = await scriptIn(a.project.id, 'await workspace.write("script.txt", "x");');
    const app = await scriptServer();
    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/js-scripts/${script.id}/run`,
        payload: {}
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ detail: reason });
    } finally {
      await app.close();
    }
    await nothingWritten();
  });
});
