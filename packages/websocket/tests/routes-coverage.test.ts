import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

/**
 * Line-coverage for the thin Fastify route plugins under src/routes/ and the
 * extension tRPC router. Each plugin only wires a URL to a handler through the
 * `bridge` helper, so we mock the underlying handlers (returning Web API
 * `Response`s) and drive the plugin with `app.inject`, asserting that status
 * codes and JSON bodies flow through, including the null -> 404 branches.
 */

const mocks = vi.hoisted(() => ({
  // collection / file / workspace / oauth / openai / storage handlers
  handleCollectionRequest: vi.fn(),
  handleFileRequest: vi.fn(),
  handleWorkspaceRequest: vi.fn(),
  handleOAuthRequest: vi.fn(),
  handleOpenAIRequest: vi.fn(),
  createStorageHandler: vi.fn(),
  storageHandler: vi.fn(),
  // http-api exports used across jobs/oauth/openai/workflows plugins
  getUserId: vi.fn(),
  handleTriggersRunning: vi.fn(),
  handleTriggerStart: vi.fn(),
  handleTriggerStop: vi.fn(),
  handleWorkflowById: vi.fn(),
  handleWorkflowDslExport: vi.fn(),
  handleWorkflowExportBundle: vi.fn(),
  handleWorkflowsExportBundle: vi.fn(),
  handleWorkflowImportBundle: vi.fn(),
  handleWorkflowExamples: vi.fn(),
  handleWorkflowExamplesSearch: vi.fn(),
  handleWorkflowExamplesThumbnail: vi.fn(),
  handleWorkflowTools: vi.fn(),
  handleWorkflowsRoot: vi.fn(),
  handlePublicWorkflowById: vi.fn(),
  handlePublicWorkflows: vi.fn(),
  // @nodetool-ai/models Workflow.paginate for the /names route
  paginate: vi.fn(),
  // extension router deps
  extensionBridge: { connected: true } as { connected: boolean },
  resolveExtensionDist: vi.fn()
}));

vi.mock("../src/collection-api.js", () => ({
  handleCollectionRequest: mocks.handleCollectionRequest
}));
vi.mock("../src/file-api.js", () => ({
  handleFileRequest: mocks.handleFileRequest
}));
vi.mock("../src/workspace-api.js", () => ({
  handleWorkspaceRequest: mocks.handleWorkspaceRequest
}));
vi.mock("../src/oauth-api.js", () => ({
  handleOAuthRequest: mocks.handleOAuthRequest
}));
vi.mock("../src/openai-api.js", () => ({
  handleOpenAIRequest: mocks.handleOpenAIRequest
}));
vi.mock("../src/storage-api.js", () => ({
  createStorageHandler: mocks.createStorageHandler
}));
vi.mock("../src/http-api.js", () => ({
  getUserId: mocks.getUserId,
  handleTriggersRunning: mocks.handleTriggersRunning,
  handleTriggerStart: mocks.handleTriggerStart,
  handleTriggerStop: mocks.handleTriggerStop,
  handleWorkflowById: mocks.handleWorkflowById,
  handleWorkflowDslExport: mocks.handleWorkflowDslExport,
  handleWorkflowExportBundle: mocks.handleWorkflowExportBundle,
  handleWorkflowsExportBundle: mocks.handleWorkflowsExportBundle,
  handleWorkflowImportBundle: mocks.handleWorkflowImportBundle,
  handleWorkflowExamples: mocks.handleWorkflowExamples,
  handleWorkflowExamplesSearch: mocks.handleWorkflowExamplesSearch,
  handleWorkflowExamplesThumbnail: mocks.handleWorkflowExamplesThumbnail,
  handleWorkflowTools: mocks.handleWorkflowTools,
  handleWorkflowsRoot: mocks.handleWorkflowsRoot,
  handlePublicWorkflowById: mocks.handlePublicWorkflowById,
  handlePublicWorkflows: mocks.handlePublicWorkflows
}));
vi.mock("@nodetool-ai/models", () => ({
  Workflow: { paginate: mocks.paginate }
}));
vi.mock("../src/extension-cdp-bridge.js", () => ({
  extensionBridge: mocks.extensionBridge
}));
vi.mock("../src/lib/extension-dist.js", () => ({
  resolveExtensionDist: mocks.resolveExtensionDist
}));

import collectionsRoutes from "../src/routes/collections.js";
import filesRoutes from "../src/routes/files.js";
import jobsRoutes from "../src/routes/jobs.js";
import oauthRoutes from "../src/routes/oauth.js";
import openaiRoutes from "../src/routes/openai.js";
import storageRoutes from "../src/routes/storage.js";
import workflowsRoutes from "../src/routes/workflows.js";
import workspaceRoutes from "../src/routes/workspace.js";
import { extensionRouter } from "../src/trpc/routers/extension.js";
import { createCallerFactory } from "../src/trpc/index.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function makeApp(
  plugin: Parameters<FastifyInstance["register"]>[0]
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(plugin, { apiOptions: {} });
  await app.ready();
  return app;
}

let app: FastifyInstance | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.extensionBridge.connected = true;
  // Sensible defaults; individual tests override.
  mocks.getUserId.mockReturnValue("user-1");
  mocks.createStorageHandler.mockReturnValue(mocks.storageHandler);
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe("collections routes", () => {
  it("forwards a handled collection response", async () => {
    mocks.handleCollectionRequest.mockResolvedValue(
      jsonResponse({ ok: true })
    );
    app = await makeApp(collectionsRoutes);
    const res = await app.inject({ method: "GET", url: "/api/collections/index" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(mocks.handleCollectionRequest).toHaveBeenCalledWith(
      expect.any(Request),
      "/api/collections/index",
      expect.any(Object)
    );
  });

  it("returns 404 when the handler resolves null", async () => {
    mocks.handleCollectionRequest.mockResolvedValue(null);
    app = await makeApp(collectionsRoutes);
    const res = await app.inject({ method: "GET", url: "/api/collections/missing" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ detail: "Not found" });
  });

  it("returns 501 for the admin secrets import stub", async () => {
    app = await makeApp(collectionsRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/admin/secrets/import"
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().detail).toContain("standalone");
  });
});

describe("files routes", () => {
  it("forwards the download handler response", async () => {
    mocks.handleFileRequest.mockResolvedValue(jsonResponse({ file: "d" }));
    app = await makeApp(filesRoutes);
    const res = await app.inject({ method: "GET", url: "/api/files/download" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ file: "d" });
  });

  it("forwards the local-file handler response", async () => {
    mocks.handleFileRequest.mockResolvedValue(jsonResponse({ file: "l" }));
    app = await makeApp(filesRoutes);
    const res = await app.inject({ method: "GET", url: "/api/files/local" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ file: "l" });
  });
});

describe("jobs routes", () => {
  it("handles triggers running", async () => {
    mocks.handleTriggersRunning.mockResolvedValue(jsonResponse([]));
    app = await makeApp(jobsRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/api/jobs/triggers/running"
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("forwards the trigger id to start", async () => {
    mocks.handleTriggerStart.mockResolvedValue(jsonResponse({ started: true }));
    app = await makeApp(jobsRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/triggers/abc/start"
    });
    expect(res.statusCode).toBe(200);
    expect(mocks.handleTriggerStart).toHaveBeenCalledWith(
      expect.any(Request),
      "abc"
    );
  });

  it("forwards the trigger id to stop", async () => {
    mocks.handleTriggerStop.mockResolvedValue(jsonResponse({ stopped: true }));
    app = await makeApp(jobsRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/api/jobs/triggers/xyz/stop"
    });
    expect(res.statusCode).toBe(200);
    expect(mocks.handleTriggerStop).toHaveBeenCalledWith(
      expect.any(Request),
      "xyz"
    );
  });
});

describe("oauth routes", () => {
  it("forwards a handled oauth response", async () => {
    mocks.handleOAuthRequest.mockResolvedValue(jsonResponse({ url: "x" }));
    app = await makeApp(oauthRoutes);
    const res = await app.inject({ method: "GET", url: "/api/oauth/login" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ url: "x" });
  });

  it("returns 404 when the oauth handler resolves null", async () => {
    mocks.handleOAuthRequest.mockResolvedValue(null);
    app = await makeApp(oauthRoutes);
    const res = await app.inject({ method: "GET", url: "/api/oauth/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ detail: "Not found" });
  });
});

describe("openai routes", () => {
  it("forwards a handled openai response", async () => {
    mocks.handleOpenAIRequest.mockResolvedValue(jsonResponse({ id: "chat" }));
    app = await makeApp(openaiRoutes);
    const res = await app.inject({
      method: "POST",
      url: "/v1/chat/completions"
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "chat" });
    expect(mocks.getUserId).toHaveBeenCalled();
  });

  it("returns 404 when the openai handler resolves null", async () => {
    mocks.handleOpenAIRequest.mockResolvedValue(null);
    app = await makeApp(openaiRoutes);
    const res = await app.inject({ method: "GET", url: "/v1/unknown" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ detail: "Not found" });
  });
});

describe("storage routes", () => {
  it("forwards the storage handler response", async () => {
    mocks.storageHandler.mockResolvedValue(jsonResponse({ blob: true }));
    app = await makeApp(storageRoutes);
    const res = await app.inject({ method: "GET", url: "/api/storage/key.png" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ blob: true });
    expect(mocks.createStorageHandler).toHaveBeenCalled();
  });
});

describe("workspace routes", () => {
  it("forwards a handled workspace response", async () => {
    mocks.handleWorkspaceRequest.mockResolvedValue(jsonResponse({ f: 1 }));
    app = await makeApp(workspaceRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/api/workspaces/w1/download/file.txt"
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ f: 1 });
  });

  it("returns 404 when the workspace handler resolves null", async () => {
    mocks.handleWorkspaceRequest.mockResolvedValue(null);
    app = await makeApp(workspaceRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/api/workspaces/w1/nope"
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ detail: "Not found" });
  });
});

describe("workflows routes", () => {
  beforeEach(() => {
    for (const fn of [
      mocks.handleWorkflowById,
      mocks.handleWorkflowDslExport,
      mocks.handleWorkflowExportBundle,
      mocks.handleWorkflowsExportBundle,
      mocks.handleWorkflowImportBundle,
      mocks.handleWorkflowExamples,
      mocks.handleWorkflowExamplesSearch,
      mocks.handleWorkflowExamplesThumbnail,
      mocks.handleWorkflowTools,
      mocks.handleWorkflowsRoot,
      mocks.handlePublicWorkflowById,
      mocks.handlePublicWorkflows
    ]) {
      fn.mockResolvedValue(jsonResponse({ ok: true }));
    }
  });

  it("serves example thumbnails (decoding the filename)", async () => {
    app = await makeApp(workflowsRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/api/workflows/examples/thumbnails/my%20thumb.png"
    });
    expect(res.statusCode).toBe(200);
    expect(mocks.handleWorkflowExamplesThumbnail).toHaveBeenCalledWith(
      expect.any(Request),
      "my thumb.png",
      expect.any(Object)
    );
  });

  it("serves examples search and list", async () => {
    app = await makeApp(workflowsRoutes);
    const search = await app.inject({
      method: "GET",
      url: "/api/workflows/examples/search"
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/workflows/examples"
    });
    expect(search.statusCode).toBe(200);
    expect(list.statusCode).toBe(200);
    expect(mocks.handleWorkflowExamplesSearch).toHaveBeenCalled();
    expect(mocks.handleWorkflowExamples).toHaveBeenCalled();
  });

  it("returns the workflow name map for GET /names", async () => {
    mocks.paginate.mockResolvedValue([
      [
        { id: "w1", name: "First" },
        { id: "w2", name: "Second" }
      ]
    ]);
    app = await makeApp(workflowsRoutes);
    const res = await app.inject({
      method: "GET",
      url: "/api/workflows/names"
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ w1: "First", w2: "Second" });
    expect(mocks.paginate).toHaveBeenCalledWith("user-1", { limit: 1000 });
  });

  it("returns 405 from /names for a non-GET method", async () => {
    app = await makeApp(workflowsRoutes);
    const res = await app.inject({
      method: "HEAD",
      url: "/api/workflows/names"
    });
    expect(res.statusCode).toBe(405);
  });

  it("serves tools and bundle import/export", async () => {
    app = await makeApp(workflowsRoutes);
    const tools = await app.inject({
      method: "GET",
      url: "/api/workflows/tools"
    });
    const exportBundle = await app.inject({
      method: "POST",
      url: "/api/workflows/export-bundle"
    });
    const importBundle = await app.inject({
      method: "POST",
      url: "/api/workflows/import-bundle"
    });
    expect(tools.statusCode).toBe(200);
    expect(exportBundle.statusCode).toBe(200);
    expect(importBundle.statusCode).toBe(200);
    expect(mocks.handleWorkflowsExportBundle).toHaveBeenCalled();
    expect(mocks.handleWorkflowImportBundle).toHaveBeenCalled();
  });

  it("serves public workflow routes", async () => {
    app = await makeApp(workflowsRoutes);
    const byId = await app.inject({
      method: "GET",
      url: "/api/workflows/public/pub%20id"
    });
    const all = await app.inject({
      method: "GET",
      url: "/api/workflows/public"
    });
    expect(byId.statusCode).toBe(200);
    expect(all.statusCode).toBe(200);
    expect(mocks.handlePublicWorkflowById).toHaveBeenCalledWith(
      expect.any(Request),
      "pub id"
    );
    expect(mocks.handlePublicWorkflows).toHaveBeenCalled();
  });

  it("serves the workflows root list", async () => {
    app = await makeApp(workflowsRoutes);
    const res = await app.inject({ method: "GET", url: "/api/workflows" });
    expect(res.statusCode).toBe(200);
    expect(mocks.handleWorkflowsRoot).toHaveBeenCalled();
  });

  it("serves per-id dsl-export, export-bundle, and detail", async () => {
    app = await makeApp(workflowsRoutes);
    const dsl = await app.inject({
      method: "GET",
      url: "/api/workflows/abc/dsl-export"
    });
    const bundle = await app.inject({
      method: "GET",
      url: "/api/workflows/abc/export-bundle"
    });
    const detail = await app.inject({
      method: "GET",
      url: "/api/workflows/abc"
    });
    expect(dsl.statusCode).toBe(200);
    expect(bundle.statusCode).toBe(200);
    expect(detail.statusCode).toBe(200);
    expect(mocks.handleWorkflowDslExport).toHaveBeenCalledWith(
      expect.any(Request),
      "abc",
      expect.any(Object)
    );
    expect(mocks.handleWorkflowExportBundle).toHaveBeenCalledWith(
      expect.any(Request),
      "abc",
      expect.any(Object)
    );
    expect(mocks.handleWorkflowById).toHaveBeenCalledWith(
      expect.any(Request),
      "abc",
      expect.any(Object)
    );
  });
});

describe("extension tRPC router", () => {
  const createCaller = createCallerFactory(extensionRouter);

  it("reports connection status and dist info", async () => {
    mocks.extensionBridge.connected = true;
    mocks.resolveExtensionDist.mockReturnValue({
      path: "/build/ext",
      exists: true
    });
    const caller = createCaller({} as never);
    const res = await caller.status();
    expect(res).toEqual({
      connected: true,
      distPath: "/build/ext",
      distExists: true
    });
  });

  it("reflects a disconnected extension and missing build", async () => {
    mocks.extensionBridge.connected = false;
    mocks.resolveExtensionDist.mockReturnValue({ path: "", exists: false });
    const caller = createCaller({} as never);
    const res = await caller.status();
    expect(res).toEqual({
      connected: false,
      distPath: "",
      distExists: false
    });
  });
});
