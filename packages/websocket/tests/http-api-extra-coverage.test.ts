import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi
} from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { initTestDb, Workflow, Job, Asset } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  handleApiRequest,
  handleAssetsRoot,
  handleExtractAudio,
  handleWorkflowRun,
  handleNodeHttpRequest,
  createHttpApiServer,
  toJobResponse,
  type HttpApiOptions
} from "../src/http-api.js";

// ── Test helpers ────────────────────────────────────────────────────────

function req(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost${url}`, init);
}

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function makeWorkflow(
  overrides: Record<string, unknown> = {}
): Promise<Workflow> {
  return (await Workflow.create({
    user_id: "user-1",
    name: "WF",
    access: "private",
    graph: { nodes: [], edges: [] },
    ...overrides
  })) as Workflow;
}

/**
 * A real fastify instance whose catch-all route bridges an inbound HTTP
 * request into the web-standard `Request` that `handleApiRequest` expects,
 * then writes the `Response` back onto the reply. Driving handlers through
 * `app.inject` exercises the full router in `handleApiRequest`, not just the
 * leaf functions.
 */
async function makeApp(options: HttpApiOptions = {}): Promise<FastifyInstance> {
  const app = Fastify();
  // Replace fastify's built-in JSON/text parsers with a single catch-all that
  // hands us the raw bytes — handleApiRequest does its own body parsing, and
  // the built-in JSON parser rejects empty bodies with a 400 before our route.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });
  app.all("/*", async (request, reply) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(request.headers)) {
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
      else if (v !== undefined) headers.set(k, String(v));
    }
    const method = request.method;
    const hasBody = method !== "GET" && method !== "HEAD";
    const bodyBuf = request.body as Buffer | undefined;
    const webReq = new Request(`http://localhost${request.url}`, {
      method,
      headers,
      body:
        hasBody && bodyBuf && bodyBuf.byteLength > 0
          ? new Uint8Array(bodyBuf)
          : undefined
    });
    const res = await handleApiRequest(webReq, options);
    reply.status(res.status);
    res.headers.forEach((val, key) => {
      if (key.toLowerCase() === "content-length") return;
      reply.header(key, val);
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return reply.send(buf);
  });
  await app.ready();
  return app;
}

const JSON_HEADERS = (userId = "user-1"): Record<string, string> => ({
  "content-type": "application/json",
  "x-user-id": userId
});

// ── handleWorkflowsRoot / handleWorkflowById via fastify ────────────────

describe("http-api extra: workflows root + by-id branches", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    initTestDb();
    app = await makeApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("POST /api/workflows with a missing graph returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: JSON_HEADERS(),
      payload: JSON.stringify({ name: "No Graph", access: "private" })
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toContain("graph is required");
  });

  it("POST /api/workflows with a non-JSON body returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { "content-type": "text/plain", "x-user-id": "user-1" },
      payload: "not json"
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/workflows honours the run_mode filter", async () => {
    await makeWorkflow({ user_id: "user-1", name: "ToolWF", run_mode: "tool" });
    await makeWorkflow({ user_id: "user-1", name: "PlainWF" });
    const res = await app.inject({
      method: "GET",
      url: "/api/workflows?run_mode=tool&limit=50",
      headers: { "x-user-id": "user-1" }
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as { workflows: Array<{ name: string }> };
    expect(data.workflows.map((w) => w.name)).toContain("ToolWF");
    expect(data.workflows.map((w) => w.name)).not.toContain("PlainWF");
  });

  it("DELETE /api/workflows/:id returns 405 for an unsupported method", async () => {
    const wf = await makeWorkflow({ user_id: "user-1" });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/workflows/${wf.id}`,
      headers: JSON_HEADERS()
    });
    expect(res.statusCode).toBe(405);
  });

  it("GET a private workflow owned by someone else returns 404", async () => {
    const wf = await makeWorkflow({ user_id: "owner", access: "private" });
    const res = await app.inject({
      method: "GET",
      url: `/api/workflows/${wf.id}`,
      headers: { "x-user-id": "intruder" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT a workflow owned by someone else returns 404", async () => {
    const wf = await makeWorkflow({ user_id: "owner", access: "private" });
    const res = await app.inject({
      method: "PUT",
      url: `/api/workflows/${wf.id}`,
      headers: JSON_HEADERS("intruder"),
      payload: JSON.stringify({
        name: "Hijack",
        access: "private",
        graph: { nodes: [], edges: [] }
      })
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT with an invalid graph returns 400", async () => {
    const wf = await makeWorkflow({ user_id: "user-1" });
    const res = await app.inject({
      method: "PUT",
      url: `/api/workflows/${wf.id}`,
      headers: JSON_HEADERS(),
      payload: JSON.stringify({ name: "Bad", access: "private" })
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toContain("graph is required");
  });

  it("DELETE a workflow owned by someone else returns 404", async () => {
    const wf = await makeWorkflow({ user_id: "owner" });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/workflows/${wf.id}`,
      headers: { "x-user-id": "intruder" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT updates an existing workflow's fields", async () => {
    const wf = await makeWorkflow({ user_id: "user-1", name: "Before" });
    const res = await app.inject({
      method: "PUT",
      url: `/api/workflows/${wf.id}`,
      headers: JSON_HEADERS(),
      payload: JSON.stringify({
        name: "After",
        access: "public",
        tool_name: "tool_x",
        description: "changed",
        tags: ["t1"],
        run_mode: "tool",
        graph: { nodes: [{ id: "n", type: "nodetool.text.Concat" }], edges: [] }
      })
    });
    expect(res.statusCode).toBe(200);
    const data = res.json() as Record<string, unknown>;
    expect(data.name).toBe("After");
    expect(data.access).toBe("public");
    expect(data.run_mode).toBe("tool");
  });
});

// ── handleWorkflowRun early-return branches (no runtime spin-up) ─────────

describe("http-api extra: workflow run guard branches", () => {
  beforeEach(() => initTestDb());

  it("405 for a non-POST method", async () => {
    const res = await handleWorkflowRun(
      req("/x", { method: "GET" }),
      "w1",
      {}
    );
    expect(res.status).toBe(405);
  });

  it("404 when the workflow does not exist for the user", async () => {
    const res = await handleWorkflowRun(
      req("/x", { method: "POST", headers: { "x-user-id": "user-1" } }),
      "missing",
      {}
    );
    expect(res.status).toBe(404);
  });

  it("400 when the run_mode is not 'workflow'", async () => {
    const wf = await makeWorkflow({ user_id: "user-1", run_mode: "chat" });
    const res = await handleWorkflowRun(
      req("/x", { method: "POST", headers: { "x-user-id": "user-1" } }),
      wf.id,
      {}
    );
    expect(res.status).toBe(400);
    expect((await jsonBody(res)) as { detail: string }).toMatchObject({
      detail: expect.stringContaining("run mode")
    });
  });
});

// ── DSL export success + no-graph branch ────────────────────────────────

describe("http-api extra: DSL export", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    initTestDb();
    app = await makeApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("exports a public workflow's graph as DSL source", async () => {
    const wf = await makeWorkflow({
      user_id: "owner",
      access: "public",
      name: "Concat Flow",
      graph: {
        nodes: [
          {
            id: "n1",
            type: "nodetool.text.Concat",
            data: { a: "hi", b: "there" }
          }
        ],
        edges: []
      }
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/workflows/${wf.id}/dsl-export`,
      headers: { "x-user-id": "someone-else" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.payload.length).toBeGreaterThan(0);
  });

  it("400 when the workflow has no graph", async () => {
    // The DB enforces a non-null graph column, so mock the model read to
    // return a graph-less workflow and hit the export guard directly.
    const spy = vi.spyOn(Workflow, "get").mockResolvedValue({
      id: "w-nograph",
      user_id: "user-1",
      access: "private",
      name: "No Graph",
      graph: null
    } as unknown as Workflow);
    try {
      const { handleWorkflowDslExport } = await import("../src/http-api.js");
      const res = await handleWorkflowDslExport(
        req("/x", { headers: { "x-user-id": "user-1" } }),
        "w-nograph",
        {}
      );
      expect(res.status).toBe(400);
      expect((await jsonBody(res)) as { detail: string }).toMatchObject({
        detail: expect.stringContaining("no graph")
      });
    } finally {
      spy.mockRestore();
    }
  });
});

// ── Bundle export/import round trip ─────────────────────────────────────

describe("http-api extra: workflow bundle export/import", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    initTestDb();
    app = await makeApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("exports a single workflow as a .nodetool bundle", async () => {
    const wf = await makeWorkflow({
      user_id: "user-1",
      name: "Bundle Me",
      graph: {
        nodes: [{ id: "n1", type: "nodetool.text.Concat" }],
        edges: []
      }
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/workflows/${wf.id}/export-bundle`,
      headers: { "x-user-id": "user-1" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toContain(".nodetool");
    expect(res.rawPayload.byteLength).toBeGreaterThan(0);
  });

  it("404 exporting a bundle for a private workflow of another user", async () => {
    const wf = await makeWorkflow({ user_id: "owner", access: "private" });
    const res = await app.inject({
      method: "GET",
      url: `/api/workflows/${wf.id}/export-bundle`,
      headers: { "x-user-id": "intruder" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST export-bundle 400s on an empty workflow_ids list", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows/export-bundle",
      headers: JSON_HEADERS(),
      payload: JSON.stringify({ workflow_ids: [] })
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST export-bundle 404s when one of the ids is unknown", async () => {
    const wf = await makeWorkflow({ user_id: "user-1" });
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows/export-bundle",
      headers: JSON_HEADERS(),
      payload: JSON.stringify({ workflow_ids: [wf.id, "does-not-exist"] })
    });
    expect(res.statusCode).toBe(404);
  });

  it("exports multiple workflows then re-imports them", async () => {
    const a = await makeWorkflow({
      user_id: "user-1",
      name: "Alpha",
      graph: { nodes: [{ id: "n1", type: "nodetool.text.Concat" }], edges: [] }
    });
    const b = await makeWorkflow({
      user_id: "user-1",
      name: "Beta",
      graph: { nodes: [{ id: "n2", type: "nodetool.text.Concat" }], edges: [] }
    });
    const exportRes = await app.inject({
      method: "POST",
      url: "/api/workflows/export-bundle",
      headers: JSON_HEADERS(),
      payload: JSON.stringify({ workflow_ids: [a.id, b.id] })
    });
    expect(exportRes.statusCode).toBe(200);
    const bundleBytes = exportRes.rawPayload;
    expect(bundleBytes.byteLength).toBeGreaterThan(0);

    const importRes = await app.inject({
      method: "POST",
      url: "/api/workflows/import-bundle",
      headers: { "content-type": "application/zip", "x-user-id": "user-2" },
      payload: bundleBytes
    });
    expect(importRes.statusCode).toBe(200);
    const imported = importRes.json() as {
      workflows: Array<{ name: string }>;
      imported: number;
    };
    expect(imported.workflows).toHaveLength(2);
    expect(imported.workflows.map((w) => w.name).sort()).toEqual([
      "Alpha",
      "Beta"
    ]);
  });

  it("import-bundle 400s on a non-bundle body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows/import-bundle",
      headers: { "content-type": "application/zip", "x-user-id": "user-1" },
      payload: Buffer.from("this is not a zip file")
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toContain("Invalid bundle");
  });

  it("import-bundle 400s when no file is provided", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows/import-bundle",
      headers: { "content-type": "application/zip", "x-user-id": "user-1" },
      payload: Buffer.alloc(0)
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toContain("bundle file is required");
  });
});

// ── Version restore routing via handleApiRequest ────────────────────────

describe("http-api extra: version routing", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    initTestDb();
    app = await makeApp();
  });
  afterEach(async () => {
    await app.close();
  });

  it("creates a version then restores it via the numbered route", async () => {
    const wf = await makeWorkflow({ user_id: "user-1" });
    const createRes = await app.inject({
      method: "POST",
      url: `/api/workflows/${wf.id}/versions`,
      headers: JSON_HEADERS(),
      payload: JSON.stringify({ name: "v1" })
    });
    expect(createRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/workflows/${wf.id}/versions/1`,
      headers: { "x-user-id": "user-1" }
    });
    expect(getRes.statusCode).toBe(200);

    const restoreRes = await app.inject({
      method: "POST",
      url: `/api/workflows/${wf.id}/versions/1/restore`,
      headers: JSON_HEADERS()
    });
    expect(restoreRes.statusCode).toBe(200);
  });

  it("routes a non-numeric version segment to delete-by-id (404 for unknown)", async () => {
    const wf = await makeWorkflow({ user_id: "user-1" });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/workflows/${wf.id}/versions/not-a-real-version-id`,
      headers: { "x-user-id": "user-1" }
    });
    expect(res.statusCode).toBe(404);
  });
});

// ── Example workflows via Python package metadata ───────────────────────

describe("http-api extra: examples from python package metadata", () => {
  beforeEach(() => initTestDb());

  it("builds example workflows from package_metadata examples", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-ex-py-"));
    const metaDir = path.join(root, "nodetool", "package_metadata");
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(
      path.join(metaDir, "pkg.json"),
      JSON.stringify({
        name: "my-pkg",
        nodes: [],
        examples: [
          {
            id: "ex-1",
            name: "Example One",
            description: "an example",
            tags: ["demo"]
          },
          { id: "ex-2", name: "Example Two" }
        ]
      }),
      "utf8"
    );

    const listRes = await handleApiRequest(req("/api/workflows/examples"), {
      metadataRoots: [root]
    });
    expect(listRes.status).toBe(200);
    const list = (await jsonBody(listRes)) as {
      workflows: Array<{ name: string; package_name: string }>;
    };
    const names = list.workflows.map((w) => w.name).sort();
    expect(names).toEqual(["Example One", "Example Two"]);
    expect(list.workflows[0].package_name).toBe("my-pkg");

    const searchRes = await handleApiRequest(
      req("/api/workflows/examples/search?query=one"),
      { metadataRoots: [root] }
    );
    const search = (await jsonBody(searchRes)) as {
      workflows: Array<{ name: string }>;
    };
    expect(search.workflows).toHaveLength(1);
    expect(search.workflows[0].name).toBe("Example One");
  });
});

// ── Assets root handler ─────────────────────────────────────────────────

describe("http-api extra: assets root", () => {
  beforeEach(() => initTestDb());

  it("creates an asset from a JSON body and shapes the response", async () => {
    const res = await handleAssetsRoot(
      req("/api/assets", {
        method: "POST",
        headers: JSON_HEADERS("user-1"),
        body: JSON.stringify({
          name: "pic.png",
          content_type: "image/png",
          parent_id: "user-1"
        })
      }),
      {}
    );
    expect(res.status).toBe(200);
    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.name).toBe("pic.png");
    expect(data.content_type).toBe("image/png");
    expect(data.user_id).toBe("user-1");
    expect(data).toHaveProperty("get_url");
    expect(data).toHaveProperty("thumb_url");
  });

  it("creates a folder asset (no file name / get_url)", async () => {
    const res = await handleAssetsRoot(
      req("/api/assets", {
        method: "POST",
        headers: JSON_HEADERS("user-1"),
        body: JSON.stringify({
          name: "My Folder",
          content_type: "folder",
          parent_id: "user-1"
        })
      }),
      {}
    );
    expect(res.status).toBe(200);
    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.content_type).toBe("folder");
    expect(data.get_url).toBeNull();
  });

  it("400s when required fields are missing", async () => {
    const res = await handleAssetsRoot(
      req("/api/assets", {
        method: "POST",
        headers: JSON_HEADERS("user-1"),
        body: JSON.stringify({ name: "incomplete" })
      }),
      {}
    );
    expect(res.status).toBe(400);
  });

  it("405s for non-POST methods", async () => {
    const res = await handleAssetsRoot(req("/api/assets"), {});
    expect(res.status).toBe(405);
  });
});

// ── Extract-audio guard branches ────────────────────────────────────────

describe("http-api extra: extract-audio guards", () => {
  beforeEach(() => initTestDb());

  it("404 when the asset does not exist", async () => {
    const res = await handleExtractAudio(
      req("/x", { method: "POST", headers: { "x-user-id": "user-1" } }),
      {},
      "missing-asset"
    );
    expect(res.status).toBe(404);
  });

  it("404 when the asset belongs to another user", async () => {
    const asset = (await Asset.create({
      user_id: "owner",
      name: "clip.mp4",
      content_type: "video/mp4",
      parent_id: "owner"
    })) as Asset;
    const res = await handleExtractAudio(
      req("/x", { method: "POST", headers: { "x-user-id": "intruder" } }),
      {},
      asset.id
    );
    expect(res.status).toBe(404);
  });

  it("400 when the asset is not a video", async () => {
    const asset = (await Asset.create({
      user_id: "user-1",
      name: "photo.png",
      content_type: "image/png",
      parent_id: "user-1"
    })) as Asset;
    const res = await handleExtractAudio(
      req("/x", { method: "POST", headers: { "x-user-id": "user-1" } }),
      {},
      asset.id
    );
    expect(res.status).toBe(400);
    expect((await jsonBody(res)) as { detail: string }).toMatchObject({
      detail: "Asset is not a video"
    });
  });
});

// ── toJobResponse ───────────────────────────────────────────────────────

describe("http-api extra: toJobResponse", () => {
  beforeEach(() => initTestDb());

  it("shapes a job into the API response", async () => {
    const job = (await Job.create({
      workflow_id: "wf-1",
      user_id: "user-1",
      status: "running",
      params: {},
      graph: { nodes: [], edges: [] }
    })) as Job;
    const shaped = toJobResponse(job);
    expect(shaped.id).toBe(job.id);
    expect(shaped.job_type).toBe("workflow");
    expect(shaped.status).toBe("running");
    expect(shaped.workflow_id).toBe("wf-1");
    expect(shaped.error).toBeNull();
    expect(shaped.cost).toBeNull();
  });
});

// ── Node HTTP request bridge (gzip / plain / no-body) ───────────────────

interface CapturedRes {
  statusCode: number;
  headers: Record<string, unknown>;
  body: Buffer | undefined;
  setHeader(key: string, value: unknown): void;
  end(chunk?: Buffer): void;
}

function makeMockRes(): { res: CapturedRes; done: Promise<CapturedRes> } {
  let resolve!: (r: CapturedRes) => void;
  const done = new Promise<CapturedRes>((r) => (resolve = r));
  const res: CapturedRes = {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(chunk) {
      this.body = chunk;
      resolve(this);
    }
  };
  return { res, done };
}

function bigRegistry(count: number): NodeRegistry {
  const nodes = Array.from({ length: count }, (_, i) => ({
    node_type: `pkg.namespace.Node${i}`,
    title: `Node number ${i}`,
    description:
      "A generously long description string repeated to inflate the payload past the gzip threshold ".repeat(
        6
      ),
    namespace: "pkg.namespace"
  }));
  return { listMetadata: () => nodes } as unknown as NodeRegistry;
}

describe("http-api extra: node http bridge", () => {
  beforeEach(() => initTestDb());

  it("gzip-compresses a large response when the client accepts gzip", async () => {
    const { res, done } = makeMockRes();
    const reqMock = {
      method: "GET",
      url: "/api/nodes/metadata?fields=full",
      headers: { "accept-encoding": "gzip" }
    } as unknown as import("node:http").IncomingMessage;
    await handleNodeHttpRequest(
      reqMock,
      res as unknown as import("node:http").ServerResponse,
      { registry: bigRegistry(4000) }
    );
    const captured = await done;
    expect(captured.statusCode).toBe(200);
    expect(captured.headers["content-encoding"]).toBe("gzip");
    expect(captured.body).toBeInstanceOf(Buffer);
  });

  it("sends a small response uncompressed", async () => {
    const { res, done } = makeMockRes();
    const reqMock = {
      method: "GET",
      url: "/api/nodes/dummy",
      headers: {}
    } as unknown as import("node:http").IncomingMessage;
    await handleNodeHttpRequest(
      reqMock,
      res as unknown as import("node:http").ServerResponse,
      {}
    );
    const captured = await done;
    expect(captured.statusCode).toBe(200);
    expect(captured.headers["content-encoding"]).toBeUndefined();
    const parsed = JSON.parse(String(captured.body)) as { type: string };
    expect(parsed.type).toBe("asset");
  });

  it("handles a body-less 204 response", async () => {
    const wf = await makeWorkflow({ user_id: "user-1" });
    const { res, done } = makeMockRes();
    // DELETE is treated as having a body, so provide an empty async iterator.
    async function* emptyBody() {
      // no chunks
    }
    const reqMock = Object.assign(emptyBody(), {
      method: "DELETE",
      url: `/api/workflows/${wf.id}`,
      headers: { "x-user-id": "user-1" }
    }) as unknown as import("node:http").IncomingMessage;
    await handleNodeHttpRequest(
      reqMock,
      res as unknown as import("node:http").ServerResponse,
      {}
    );
    const captured = await done;
    expect(captured.statusCode).toBe(204);
    expect(captured.body).toBeUndefined();
  });

  it("reads a request body on POST and routes it", async () => {
    const payload = Buffer.from(
      JSON.stringify({
        name: "Via Node",
        access: "private",
        graph: { nodes: [], edges: [] }
      })
    );
    async function* bodyIterator() {
      yield new Uint8Array(payload);
    }
    const { res, done } = makeMockRes();
    const reqMock = Object.assign(bodyIterator(), {
      method: "POST",
      url: "/api/workflows",
      headers: { "content-type": "application/json", "x-user-id": "user-1" }
    }) as unknown as import("node:http").IncomingMessage;
    await handleNodeHttpRequest(
      reqMock,
      res as unknown as import("node:http").ServerResponse,
      {}
    );
    const captured = await done;
    expect(captured.statusCode).toBe(200);
    const parsed = JSON.parse(String(captured.body)) as { name: string };
    expect(parsed.name).toBe("Via Node");
  });
});

// ── createHttpApiServer end-to-end ──────────────────────────────────────

describe("http-api extra: createHttpApiServer", () => {
  beforeEach(() => initTestDb());

  it("serves a request over a real listening socket", async () => {
    const server = createHttpApiServer({});
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP address");
    }
    try {
      const res = await fetch(
        `http://127.0.0.1:${address.port}/api/nodes/dummy`
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as { type: string };
      expect(data.type).toBe("asset");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns a 500 with a detail when a handler throws", async () => {
    // /api/workflows/names calls Workflow.paginate without a try/catch, so a
    // rejection propagates out of handleApiRequest into the server's catch.
    const spy = vi
      .spyOn(Workflow, "paginate")
      .mockRejectedValue(new Error("boom from paginate"));
    const server = createHttpApiServer({});
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a TCP address");
    }
    try {
      const res = await fetch(
        `http://127.0.0.1:${address.port}/api/workflows/names`,
        { headers: { "x-user-id": "user-1" } }
      );
      expect(res.status).toBe(500);
      const data = (await res.json()) as { detail: string };
      expect(data.detail).toContain("boom from paginate");
    } finally {
      spy.mockRestore();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
