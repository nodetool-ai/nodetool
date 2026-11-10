import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createEmptyDocument, parseApplicationBundle } from "@nodetool-ai/app-runtime";
import type { AppServerRunInput, AppServerRunOutcome } from "@nodetool-ai/execution";
import {
  Application,
  Workflow,
  initTestDb,
  listAppRuns,
  publishApplication
} from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { createMcpServer } from "../src/mcp-server.js";
import {
  MCP_APP_MIME_TYPE,
  MINI_APP_RESOURCE_URI,
  __resetMiniAppRunsForTests,
  foldableMessage,
  registerMiniAppMcpTools,
  type MiniAppToolDeps
} from "../src/mcp-apps.js";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const connections: Array<{ client: Client; server: McpServer }> = [];

beforeEach(() => {
  initTestDb();
  __resetMiniAppRunsForTests();
});

afterEach(async () => {
  for (const { client, server } of connections.splice(0)) {
    await client.close();
    await server.close();
  }
});

async function connect(server: McpServer): Promise<Client> {
  const client = new Client({ name: "mini-app-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  connections.push({ client, server });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

/** A session with only the mini app tools and a scripted workflow runner. */
async function connectMiniApps(
  userId: string,
  runWorkflow: NonNullable<MiniAppToolDeps["runWorkflow"]>,
  waits: MiniAppToolDeps["waits"] = {}
): Promise<Client> {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  const deps: MiniAppToolDeps = {
    userId,
    context: new ProcessingContext({ jobId: "mcp", userId }),
    registry: async () => ({}) as NodeRegistry,
    runWorkflow,
    waits
  };
  registerMiniAppMcpTools(server, deps);
  return connect(server);
}

async function fixture(options: { publish?: boolean } = {}) {
  await Workflow.create<Workflow>({
    id: "wf",
    user_id: "owner",
    name: "Caption",
    graph: {
      nodes: [
        { id: "prompt", type: "nodetool.input.StringInput", data: { name: "prompt", value: "" } },
        { id: "model", type: "nodetool.text.Caption", data: { style: "plain" } },
        { id: "result", type: "nodetool.output.Output", data: { name: "result" } }
      ],
      edges: []
    }
  });
  const document = createEmptyDocument();
  document.operations = [
    { id: "main", name: "Run", workflowId: "wf", inputs: {}, outputs: {}, policy: "parallel" }
  ];
  document.ui.content = [
    { type: "WorkflowInput", props: { id: "in", binding: "op:main/in:prompt" } },
    { type: "Select", props: { id: "style", binding: "op:main/prop:model#style" } },
    { type: "WorkflowOutput", props: { id: "out", binding: "op:main/out:result" } }
  ];
  const application = await Application.create<Application>({
    user_id: "owner",
    name: "Captioner",
    description: "Writes captions",
    document: JSON.stringify(document)
  });
  if (options.publish) await publishApplication(application);
  return application;
}

function payload(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  if (result.structuredContent) return result.structuredContent as Record<string, unknown>;
  const block = (result.content as Array<{ type: string; text?: string }>)[0];
  return JSON.parse(block?.text ?? "{}") as Record<string, unknown>;
}

async function openApp(client: Client, applicationId: string) {
  const opened = await client.callTool({ name: "open_app", arguments: { application_id: applicationId } });
  expect(opened.isError).not.toBe(true);
  return payload(opened);
}

describe("mini apps as MCP Apps", () => {
  it("links open_app to the renderer resource and hides the run tools from the model", async () => {
    const client = await connect(createMcpServer({ agentToolsScope: { userId: "owner", source: "stdio-local" } }));
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect(byName.get("open_app")?._meta).toEqual({ ui: { resourceUri: MINI_APP_RESOURCE_URI } });
    for (const name of ["run_app_operation", "poll_app_run"]) {
      expect(byName.get(name)?._meta).toEqual({
        ui: { resourceUri: MINI_APP_RESOURCE_URI, visibility: ["app"] }
      });
    }

    const { resources } = await client.listResources();
    expect(resources).toContainEqual(
      expect.objectContaining({ uri: MINI_APP_RESOURCE_URI, mimeType: MCP_APP_MIME_TYPE })
    );
    const read = await client.readResource({ uri: MINI_APP_RESOURCE_URI });
    const content = read.contents[0] as { mimeType: string; text: string; _meta?: Record<string, unknown> };
    expect(content.mimeType).toBe(MCP_APP_MIME_TYPE);
    expect(content.text.startsWith("<!doctype html>")).toBe(true);
    // The page is self-contained: the MCP Apps handshake and the run tools are inline.
    expect(content.text).toContain("ui/initialize");
    expect(content.text).toContain("run_app_operation");
    expect(content.text).not.toMatch(/<script[^>]+src=/);
    expect(content._meta).toEqual({
      ui: {
        csp: { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] },
        prefersBorder: true
      }
    });
  });

  it("opens the released app by its short id as the web's default working instance", async () => {
    const application = await fixture({ publish: true });
    const client = await connectMiniApps("owner", vi.fn());
    const opened = await openApp(client, application.id.slice(0, 12));
    expect(opened).toMatchObject({ application_id: application.id, name: "Captioner", version: 1, operations: ["main"] });
    const bundle = parseApplicationBundle(opened.bundle);
    expect(bundle?.workflows.map((workflow) => workflow.key)).toEqual(["wf"]);
    expect(bundle?.app.ui.content).toHaveLength(3);

    const again = await openApp(client, application.id);
    expect(again.instance_id).toBe(opened.instance_id);
  });

  it("refuses an app the caller does not own", async () => {
    const application = await fixture();
    const client = await connectMiniApps("stranger", vi.fn());
    const opened = await client.callTool({ name: "open_app", arguments: { application_id: application.id } });
    expect(opened.isError).toBe(true);
  });

  it("runs an operation as a durable app run and streams foldable, sandbox-safe messages", async () => {
    const application = await fixture();
    const runWorkflow = vi.fn(async (context: ProcessingContext, input: AppServerRunInput): Promise<AppServerRunOutcome> => {
      context.emit({ type: "node_update", node_id: "model", status: "completed", result: { huge: "x".repeat(1000) } } as never);
      context.emit({ type: "output_update", node_id: "result", value: { type: "image", data: PNG_1PX }, done: true } as never);
      context.emit({ type: "edge_update", edge_id: "e" } as never);
      const style = input.graph.nodes.find((node) => node.id === "model")?.properties;
      context.emit({ type: "output_update", node_id: "result", value: `style=${String((style as Record<string, unknown>)?.style)}`, done: true } as never);
      return {
        rawMessages: [],
        report: {
          surface: "server",
          ok: true,
          status: "completed",
          error: null,
          durationMs: 1,
          summary: {} as AppServerRunOutcome["report"]["summary"],
          trace: null
        }
      };
    });
    const client = await connectMiniApps("owner", runWorkflow);
    const opened = await openApp(client, application.id);
    const result = await client.callTool({
      name: "run_app_operation",
      arguments: {
        instance_id: opened.instance_id,
        operation_id: "main",
        params: { prompt: "a fox" },
        property_overrides: { "model#style": { value: "poetic" } }
      }
    });
    expect(result.isError).not.toBe(true);
    const slice = payload(result);
    expect(slice.done).toBe(true);
    const messages = slice.messages as Array<Record<string, unknown>>;
    expect(messages.map((message) => message.type)).toEqual([
      "node_update",
      "output_update",
      "output_update",
      "job_update"
    ]);
    expect(messages[0]).toEqual({ type: "node_update", node_id: "model", status: "completed" });
    expect(messages[1]?.value).toEqual({
      type: "image",
      content_type: "image/png",
      uri: `data:image/png;base64,${PNG_1PX.toString("base64")}`
    });
    expect(messages[2]?.value).toBe("style=poetic");
    expect(messages[3]).toEqual({ type: "job_update", status: "completed" });
    expect(runWorkflow.mock.calls[0]?.[1].params).toEqual({ prompt: "a fox" });

    const history = await listAppRuns("owner", String(opened.instance_id));
    expect(history.map((run) => [run.origin, run.status])).toEqual([["agent", "completed"]]);

    const repeat = await client.callTool({
      name: "poll_app_run",
      arguments: { run_id: slice.run_id, cursor: slice.cursor }
    });
    expect(payload(repeat)).toMatchObject({ messages: [], done: true });
  });

  it("refuses a node property no widget exposes before reserving a run", async () => {
    const application = await fixture();
    const runWorkflow = vi.fn();
    const client = await connectMiniApps("owner", runWorkflow);
    const opened = await openApp(client, application.id);
    const result = await client.callTool({
      name: "run_app_operation",
      arguments: {
        instance_id: opened.instance_id,
        operation_id: "main",
        property_overrides: { "prompt#value": { value: "injected" } }
      }
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("not exposed");
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(await listAppRuns("owner", String(opened.instance_id))).toEqual([]);
  });

  it("hands a slow run back with a cursor, polls it to the end, and keeps runs per user", async () => {
    const application = await fixture();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runWorkflow = vi.fn(async (context: ProcessingContext): Promise<AppServerRunOutcome> => {
      context.emit({ type: "node_progress", node_id: "model", progress: 1, total: 2 } as never);
      await gate;
      context.emit({ type: "output_update", node_id: "result", value: "done", done: true } as never);
      return {
        rawMessages: [],
        report: { surface: "server", ok: true, status: "completed", error: null, durationMs: 1, summary: {} as AppServerRunOutcome["report"]["summary"], trace: null }
      };
    });
    const client = await connectMiniApps("owner", runWorkflow, { firstCallMs: 50, pollMs: 5_000 });
    const opened = await openApp(client, application.id);
    const first = payload(
      await client.callTool({
        name: "run_app_operation",
        arguments: { instance_id: opened.instance_id, operation_id: "main", params: {} }
      })
    );
    expect(first.done).toBe(false);
    expect((first.messages as Array<Record<string, unknown>>).map((m) => m.type)).toEqual(["node_progress"]);

    const stranger = await connectMiniApps("stranger", vi.fn());
    const foreign = await stranger.callTool({ name: "poll_app_run", arguments: { run_id: first.run_id, cursor: 0 } });
    expect(foreign.isError).toBe(true);

    const polled = client.callTool({ name: "poll_app_run", arguments: { run_id: first.run_id, cursor: first.cursor } });
    release();
    let rest = payload(await polled);
    const types = (rest.messages as Array<Record<string, unknown>>).map((m) => m.type);
    // The run may settle after the batch window closed: read once more if so.
    if (rest.done !== true) {
      rest = payload(await client.callTool({ name: "poll_app_run", arguments: { run_id: first.run_id, cursor: rest.cursor } }));
      types.push(...(rest.messages as Array<Record<string, unknown>>).map((m) => m.type));
    }
    expect(rest.done).toBe(true);
    expect(types).toEqual(["output_update", "job_update"]);
  });

  it("tells the page a run it cannot find is gone", async () => {
    const client = await connectMiniApps("owner", vi.fn());
    const result = await client.callTool({ name: "poll_app_run", arguments: { run_id: "missing", cursor: 0 } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("no longer on this server");
  });
});

describe("foldableMessage", () => {
  it("keeps only what the app runtime folds", () => {
    expect(foldableMessage({ type: "edge_update" })).toBeNull();
    expect(foldableMessage({ type: "chunk", content_type: "audio", content: "x" })).toBeNull();
    expect(foldableMessage({ type: "chunk", content: "hi" })).toEqual({ type: "chunk", content: "hi" });
    expect(foldableMessage({ type: "job_update", status: "running", job_id: "j", result: { big: true } })).toEqual({
      type: "job_update",
      status: "running"
    });
  });
});
