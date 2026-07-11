import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb, Workflow, WorkflowVersion } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  handleApiRequest,
  getUserId,
  parseLimit,
  toWorkflowResponse,
  handleNodeMetadata,
  handleWorkflowTools,
  handleWorkflowGenerateName,
  handleWorkflowApp,
  handleWorkflowAutosave,
  handleWorkflowVersions,
  handleWorkflowVersionByNumber,
  handleWorkflowVersionDeleteById,
  handleWorkflowExamples,
  handleWorkflowExamplesSearch,
  handleWorkflowExamplesThumbnail,
  handlePublicWorkflows,
  handleTriggersRunning,
  handleTriggerStart,
  handleTriggerStop,
  handleNodesDummy,
  handleWorkflowDslExport
} from "../src/http-api.js";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function req(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost${url}`, init);
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

describe("http-api coverage: helpers", () => {
  it("getUserId prefers the configured header, then x-user-id, then default", () => {
    expect(
      getUserId(req("/", { headers: { "x-custom-user": "u9" } }), "x-custom-user")
    ).toBe("u9");
    expect(getUserId(req("/", { headers: { "x-user-id": "u2" } }), "x-user-id")).toBe(
      "u2"
    );
    // Falls back to x-user-id even when a different header name is requested.
    expect(
      getUserId(req("/", { headers: { "x-user-id": "u3" } }), "x-missing")
    ).toBe("u3");
    // Ultimate default is "1".
    expect(getUserId(req("/"), "x-user-id")).toBe("1");
  });

  it("parseLimit applies default, rejects invalid, and caps at 500", () => {
    expect(parseLimit(new URL("http://x/?"), 100)).toBe(100);
    expect(parseLimit(new URL("http://x/?limit=25"), 100)).toBe(25);
    expect(parseLimit(new URL("http://x/?limit=abc"), 100)).toBe(100);
    expect(parseLimit(new URL("http://x/?limit=-5"), 100)).toBe(100);
    expect(parseLimit(new URL("http://x/?limit=0"), 100)).toBe(100);
    expect(parseLimit(new URL("http://x/?limit=9999"), 100)).toBe(500);
    expect(parseLimit(new URL("http://x/?limit=7"), 3)).toBe(7);
  });
});

describe("http-api coverage: node metadata", () => {
  beforeEach(() => initTestDb());

  const fakeRegistry = (
    nodes: Array<Record<string, unknown>>
  ): NodeRegistry =>
    ({ listMetadata: () => nodes } as unknown as NodeRegistry);

  const nodes = [
    {
      node_type: "nodetool.text.Generate",
      title: "Generate Text",
      description: "make some text",
      namespace: "nodetool.text"
    },
    {
      node_type: "nodetool.image.Blur",
      title: "Blur Image",
      description: "blur pixels",
      namespace: "nodetool.image"
    },
    {
      node_type: "nodetool.text.Concat",
      title: "Concat",
      description: "join strings",
      namespace: "nodetool.text"
    }
  ];

  it("rejects non-GET methods", async () => {
    const res = await handleNodeMetadata(
      req("/api/nodes/metadata", { method: "POST" }),
      { registry: fakeRegistry(nodes) }
    );
    expect(res.status).toBe(405);
  });

  it("returns a slim summary by default", async () => {
    const res = await handleNodeMetadata(req("/api/nodes/metadata"), {
      registry: fakeRegistry(nodes)
    });
    const data = (await jsonBody(res)) as Array<Record<string, unknown>>;
    expect(data).toHaveLength(3);
    expect(Object.keys(data[0]).sort()).toEqual([
      "description",
      "namespace",
      "node_type",
      "title"
    ]);
  });

  it("returns full metadata when fields=full", async () => {
    const res = await handleNodeMetadata(
      req("/api/nodes/metadata?fields=full"),
      { registry: fakeRegistry(nodes) }
    );
    const data = (await jsonBody(res)) as Array<Record<string, unknown>>;
    expect(data[0]).toHaveProperty("title");
    expect(data.length).toBe(3);
  });

  it("returns a single node for an exact node_type lookup", async () => {
    const res = await handleNodeMetadata(
      req("/api/nodes/metadata?node_type=nodetool.image.Blur"),
      { registry: fakeRegistry(nodes) }
    );
    const data = (await jsonBody(res)) as Record<string, unknown>;
    expect(data.node_type).toBe("nodetool.image.Blur");
  });

  it("404s for an unknown node_type", async () => {
    const res = await handleNodeMetadata(
      req("/api/nodes/metadata?node_type=does.not.Exist"),
      { registry: fakeRegistry(nodes) }
    );
    expect(res.status).toBe(404);
  });

  it("filters by namespace prefix", async () => {
    const res = await handleNodeMetadata(
      req("/api/nodes/metadata?namespace=nodetool.text"),
      { registry: fakeRegistry(nodes) }
    );
    const data = (await jsonBody(res)) as Array<Record<string, unknown>>;
    expect(data.map((n) => n.node_type).sort()).toEqual([
      "nodetool.text.Concat",
      "nodetool.text.Generate"
    ]);
  });

  it("scores and ranks by query terms, dropping zero-score nodes", async () => {
    const res = await handleNodeMetadata(
      req("/api/nodes/metadata?query=blur,image"),
      { registry: fakeRegistry(nodes) }
    );
    const data = (await jsonBody(res)) as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].node_type).toBe("nodetool.image.Blur");
  });

  it("applies a positive limit", async () => {
    const res = await handleNodeMetadata(req("/api/nodes/metadata?limit=1"), {
      registry: fakeRegistry(nodes)
    });
    const data = (await jsonBody(res)) as unknown[];
    expect(data).toHaveLength(1);
  });
});

describe("http-api coverage: simple stub routes", () => {
  beforeEach(() => initTestDb());

  it("handleNodesDummy returns an empty asset ref, 405 otherwise", async () => {
    const ok = (await jsonBody(
      await handleNodesDummy(req("/api/nodes/dummy"))
    )) as Record<string, unknown>;
    expect(ok.type).toBe("asset");
    expect((await handleNodesDummy(req("/x", { method: "POST" }))).status).toBe(
      405
    );
  });

  it("handleTriggersRunning returns empty workflows, 405 otherwise", async () => {
    const ok = (await jsonBody(
      await handleTriggersRunning(req("/api/triggers/running"))
    )) as { workflows: unknown[] };
    expect(ok.workflows).toEqual([]);
    expect(
      (await handleTriggersRunning(req("/x", { method: "POST" }))).status
    ).toBe(405);
  });

  it("handleTriggerStart/Stop are 501 (POST) and 405 (other)", async () => {
    expect(
      (await handleTriggerStart(req("/x", { method: "POST" }), "w1")).status
    ).toBe(501);
    expect((await handleTriggerStart(req("/x"), "w1")).status).toBe(405);
    expect(
      (await handleTriggerStop(req("/x", { method: "POST" }), "w1")).status
    ).toBe(501);
    expect((await handleTriggerStop(req("/x"), "w1")).status).toBe(405);
  });

  it("handleWorkflowApp serves an HTML page embedding the workflow id", async () => {
    const res = await handleWorkflowApp(req("/api/workflows/w1/app"), "w1", {
      baseUrl: "http://example.test"
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('window.WORKFLOW_ID="w1"');
    expect(html).toContain("http://example.test");
    expect(
      (await handleWorkflowApp(req("/x", { method: "POST" }), "w1", {})).status
    ).toBe(405);
  });
});

describe("http-api coverage: generate-name", () => {
  beforeEach(() => initTestDb());

  it("derives a name from unique node category segments", async () => {
    const wf = await makeWorkflow({
      graph: {
        nodes: [
          { id: "a", type: "nodetool.text.Generate" },
          { id: "b", type: "nodetool.image.Blur" },
          { id: "c", type: "nodetool.text.Concat" }
        ],
        edges: []
      }
    });
    const res = await handleWorkflowGenerateName(
      req(`/api/workflows/${wf.id}/generate-name`, {
        method: "POST",
        headers: { "x-user-id": "user-1" }
      }),
      wf.id,
      {}
    );
    const data = (await jsonBody(res)) as { name: string };
    expect(data.name).toBe("Text + Image Workflow");
  });

  it("falls back to the stored name for an empty graph", async () => {
    const wf = await makeWorkflow({
      name: "Kept Name",
      graph: { nodes: [], edges: [] }
    });
    const res = await handleWorkflowGenerateName(
      req("/x", { method: "POST", headers: { "x-user-id": "user-1" } }),
      wf.id,
      {}
    );
    const data = (await jsonBody(res)) as { name: string };
    expect(data.name).toBe("Kept Name");
  });

  it("404s for a missing workflow or a foreign owner, 405 for GET", async () => {
    const wf = await makeWorkflow({ user_id: "owner" });
    expect(
      (
        await handleWorkflowGenerateName(
          req("/x", { method: "POST" }),
          "nope",
          {}
        )
      ).status
    ).toBe(404);
    const foreign = await handleWorkflowGenerateName(
      req("/x", { method: "POST", headers: { "x-user-id": "intruder" } }),
      wf.id,
      {}
    );
    expect(foreign.status).toBe(404);
    expect(
      (await handleWorkflowGenerateName(req("/x"), wf.id, {})).status
    ).toBe(405);
  });
});

describe("http-api coverage: workflow tools", () => {
  beforeEach(() => initTestDb());

  it("lists tool-enabled workflows", async () => {
    await makeWorkflow({
      user_id: "user-1",
      name: "Tool WF",
      tool_name: "my_tool",
      description: "does things",
      run_mode: "tool"
    });
    const res = await handleWorkflowTools(
      req("/api/workflows/tools", { headers: { "x-user-id": "user-1" } }),
      {}
    );
    expect(res.status).toBe(200);
    const data = (await jsonBody(res)) as {
      workflows: Array<Record<string, unknown>>;
      next: null;
    };
    expect(data.next).toBeNull();
    expect(Array.isArray(data.workflows)).toBe(true);
  });

  it("405s for non-GET", async () => {
    expect(
      (await handleWorkflowTools(req("/x", { method: "POST" }), {})).status
    ).toBe(405);
  });
});

describe("http-api coverage: autosave", () => {
  beforeEach(() => initTestDb());

  it("saves the graph and creates a version", async () => {
    const wf = await makeWorkflow({ user_id: "user-1" });
    const res = await handleWorkflowAutosave(
      req(`/api/workflows/${wf.id}/autosave`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({
          graph: { nodes: [{ id: "n1", type: "t" }], edges: [] },
          name: "renamed",
          description: "d",
          access: "public"
        })
      }),
      wf.id,
      {}
    );
    expect(res.status).toBe(200);
    const data = (await jsonBody(res)) as { skipped: boolean; version: unknown };
    expect(data.skipped).toBe(false);
    expect(data.version).not.toBeNull();

    const reloaded = (await Workflow.get(wf.id)) as Workflow;
    expect(reloaded.name).toBe("renamed");
    expect(reloaded.access).toBe("public");
  });

  it("rate-limits a second autosave without force", async () => {
    const wf = await makeWorkflow({ user_id: "user-1" });
    const body = JSON.stringify({ graph: { nodes: [], edges: [] } });
    const headers = {
      "content-type": "application/json",
      "x-user-id": "user-1"
    };
    await handleWorkflowAutosave(
      req(`/api/workflows/${wf.id}/autosave`, { method: "POST", headers, body }),
      wf.id,
      {}
    );
    const second = await handleWorkflowAutosave(
      req(`/api/workflows/${wf.id}/autosave`, { method: "POST", headers, body }),
      wf.id,
      {}
    );
    const data = (await jsonBody(second)) as { skipped: boolean };
    expect(data.skipped).toBe(true);

    // force bypasses the rate limit
    const forced = await handleWorkflowAutosave(
      req(`/api/workflows/${wf.id}/autosave`, {
        method: "POST",
        headers,
        body: JSON.stringify({ graph: { nodes: [], edges: [] }, force: true })
      }),
      wf.id,
      {}
    );
    expect(((await jsonBody(forced)) as { skipped: boolean }).skipped).toBe(false);
  });

  it("returns 404 / 400 / 405 for the error branches", async () => {
    const wf = await makeWorkflow({ user_id: "owner" });
    // 405 wrong method
    expect(
      (
        await handleWorkflowAutosave(
          req("/x", { method: "GET" }),
          wf.id,
          {}
        )
      ).status
    ).toBe(405);
    // 404 missing workflow
    expect(
      (
        await handleWorkflowAutosave(
          req("/x", { method: "POST" }),
          "missing",
          {}
        )
      ).status
    ).toBe(404);
    // 404 foreign owner
    expect(
      (
        await handleWorkflowAutosave(
          req("/x", {
            method: "POST",
            headers: { "x-user-id": "intruder" }
          }),
          wf.id,
          {}
        )
      ).status
    ).toBe(404);
    // 400 missing graph
    const noGraph = await handleWorkflowAutosave(
      req("/x", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "owner" },
        body: JSON.stringify({ name: "no graph" })
      }),
      wf.id,
      {}
    );
    expect(noGraph.status).toBe(400);
  });
});

describe("http-api coverage: workflow versions", () => {
  beforeEach(() => initTestDb());

  it("creates, lists, fetches, restores, and deletes versions", async () => {
    const wf = await makeWorkflow({ user_id: "user-1" });
    const headers = {
      "content-type": "application/json",
      "x-user-id": "user-1"
    };

    // POST create a version
    const createRes = await handleWorkflowVersions(
      req(`/api/workflows/${wf.id}/versions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "v1", description: "first" })
      }),
      wf.id,
      {}
    );
    expect(createRes.status).toBe(200);
    const created = (await jsonBody(createRes)) as { version: number };
    expect(created.version).toBe(1);

    // GET list
    const listRes = await handleWorkflowVersions(
      req(`/api/workflows/${wf.id}/versions`, { headers: { "x-user-id": "user-1" } }),
      wf.id,
      {}
    );
    const list = (await jsonBody(listRes)) as { versions: unknown[] };
    expect(list.versions).toHaveLength(1);

    // GET a version by number
    const byNum = await handleWorkflowVersionByNumber(
      req("/x", { headers: { "x-user-id": "user-1" } }),
      wf.id,
      1,
      {}
    );
    expect(byNum.status).toBe(200);

    // POST restore copies the version graph back to the workflow
    const restore = await handleWorkflowVersionByNumber(
      req("/x", { method: "POST", headers: { "x-user-id": "user-1" } }),
      wf.id,
      1,
      {}
    );
    expect(restore.status).toBe(200);

    // DELETE by version id
    const version = await WorkflowVersion.findByVersion(wf.id, 1);
    const del = await handleWorkflowVersionDeleteById(
      req("/x", { method: "DELETE", headers: { "x-user-id": "user-1" } }),
      wf.id,
      version!.id,
      {}
    );
    expect(del.status).toBe(204);
  });

  it("covers the not-found and method-not-allowed branches", async () => {
    // versions root: 405 for PUT
    expect(
      (
        await handleWorkflowVersions(req("/x", { method: "PUT" }), "w", {})
      ).status
    ).toBe(405);
    // POST version onto a missing workflow -> 404
    expect(
      (
        await handleWorkflowVersions(req("/x", { method: "POST" }), "missing", {})
      ).status
    ).toBe(404);
    // by-number: missing version -> 404
    expect(
      (
        await handleWorkflowVersionByNumber(req("/x"), "missing", 5, {})
      ).status
    ).toBe(404);
    // by-number: unsupported method -> 405
    expect(
      (
        await handleWorkflowVersionByNumber(
          req("/x", { method: "DELETE" }),
          "w",
          1,
          {}
        )
      ).status
    ).toBe(405);
    // delete-by-id: wrong method -> 405
    expect(
      (
        await handleWorkflowVersionDeleteById(req("/x"), "w", "vid", {})
      ).status
    ).toBe(405);
    // delete-by-id: missing version -> 404
    expect(
      (
        await handleWorkflowVersionDeleteById(
          req("/x", { method: "DELETE" }),
          "w",
          "missing",
          {}
        )
      ).status
    ).toBe(404);
  });
});

describe("http-api coverage: dsl export edge cases", () => {
  beforeEach(() => initTestDb());

  it("405s for non-GET and 404s for a missing workflow", async () => {
    expect(
      (
        await handleWorkflowDslExport(req("/x", { method: "POST" }), "w", {})
      ).status
    ).toBe(405);
    expect(
      (await handleWorkflowDslExport(req("/x"), "missing", {})).status
    ).toBe(404);
  });

  it("404s when the workflow is private and owned by someone else", async () => {
    const wf = await makeWorkflow({ user_id: "owner", access: "private" });
    const res = await handleWorkflowDslExport(
      req("/x", { headers: { "x-user-id": "intruder" } }),
      wf.id,
      {}
    );
    expect(res.status).toBe(404);
  });
});

describe("http-api coverage: examples", () => {
  beforeEach(() => initTestDb());

  function setupExamples(): { examplesDir: string; assetsDir: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-ex-cov-"));
    const examplesDir = path.join(root, "examples", "nodetool-base");
    const assetsDir = path.join(root, "assets", "nodetool-base");
    fs.mkdirSync(examplesDir, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(
      path.join(examplesDir, "alpha.json"),
      JSON.stringify({
        name: "Alpha",
        description: "first example",
        tags: ["tag-a"],
        package_name: "nodetool-base"
      }),
      "utf8"
    );
    fs.writeFileSync(
      path.join(examplesDir, "beta.json"),
      JSON.stringify({ name: "Beta", description: "second", tags: ["tag-b"] }),
      "utf8"
    );
    // Thumbnail only for Alpha.
    fs.writeFileSync(path.join(assetsDir, "Alpha.jpg"), Buffer.from([1, 2, 3]));
    // A file that is not valid JSON is skipped.
    fs.writeFileSync(path.join(examplesDir, "broken.json"), "{not json");
    return { examplesDir, assetsDir };
  }

  it("lists examples from a directory, wiring a thumbnail_url when the JPG exists", async () => {
    const { examplesDir } = setupExamples();
    const res = await handleWorkflowExamples(req("/api/workflows/examples"), {
      examplesDir
    });
    const data = (await jsonBody(res)) as { workflows: Array<Record<string, unknown>> };
    const names = data.workflows.map((w) => w.name).sort();
    expect(names).toEqual(["Alpha", "Beta"]);
    const alpha = data.workflows.find((w) => w.name === "Alpha")!;
    expect(alpha.thumbnail_url).toContain("/api/workflows/examples/thumbnails/");
    const beta = data.workflows.find((w) => w.name === "Beta")!;
    expect(beta.thumbnail_url).toBeNull();
  });

  it("filters examples by search query", async () => {
    const { examplesDir } = setupExamples();
    const res = await handleWorkflowExamplesSearch(
      req("/api/workflows/examples/search?query=first"),
      { examplesDir }
    );
    const data = (await jsonBody(res)) as { workflows: Array<Record<string, unknown>> };
    expect(data.workflows).toHaveLength(1);
    expect(data.workflows[0].name).toBe("Alpha");
  });

  it("returns everything when the search query is empty", async () => {
    const { examplesDir } = setupExamples();
    const res = await handleWorkflowExamplesSearch(
      req("/api/workflows/examples/search"),
      { examplesDir }
    );
    const data = (await jsonBody(res)) as { workflows: unknown[] };
    expect(data.workflows).toHaveLength(2);
  });

  it("serves a thumbnail file, guarding traversal and unknown extensions", async () => {
    const { examplesDir } = setupExamples();
    const ok = await handleWorkflowExamplesThumbnail(
      req("/x"),
      "Alpha.jpg",
      { examplesDir }
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/jpeg");
    expect(await ok.arrayBuffer()).toBeTruthy();

    // Not configured
    expect(
      (await handleWorkflowExamplesThumbnail(req("/x"), "Alpha.jpg", {})).status
    ).toBe(404);
    // Non-image extension rejected
    expect(
      (
        await handleWorkflowExamplesThumbnail(req("/x"), "Alpha.txt", {
          examplesDir
        })
      ).status
    ).toBe(400);
    // Missing file
    expect(
      (
        await handleWorkflowExamplesThumbnail(req("/x"), "Missing.jpg", {
          examplesDir
        })
      ).status
    ).toBe(404);
    // Wrong method
    expect(
      (
        await handleWorkflowExamplesThumbnail(
          req("/x", { method: "POST" }),
          "Alpha.jpg",
          { examplesDir }
        )
      ).status
    ).toBe(405);
  });

  it("returns an empty list when the examples dir does not exist", async () => {
    const res = await handleWorkflowExamples(req("/api/workflows/examples"), {
      examplesDir: "/nonexistent/dir/does/not/exist"
    });
    const data = (await jsonBody(res)) as { workflows: unknown[] };
    expect(data.workflows).toEqual([]);
  });

  it("405s examples endpoints for non-GET", async () => {
    expect(
      (await handleWorkflowExamples(req("/x", { method: "POST" }), {})).status
    ).toBe(405);
    expect(
      (
        await handleWorkflowExamplesSearch(req("/x", { method: "POST" }), {})
      ).status
    ).toBe(405);
  });
});

describe("http-api coverage: public workflows + toWorkflowResponse", () => {
  beforeEach(() => initTestDb());

  it("lists public workflows only, 405 otherwise", async () => {
    await makeWorkflow({ user_id: "u1", name: "Pub", access: "public" });
    await makeWorkflow({ user_id: "u1", name: "Priv", access: "private" });
    const res = await handlePublicWorkflows(req("/api/workflows/public"));
    const data = (await jsonBody(res)) as { workflows: Array<Record<string, unknown>> };
    expect(data.workflows.every((w) => w.access === "public")).toBe(true);
    expect(data.workflows.map((w) => w.name)).toContain("Pub");
    expect(data.workflows.map((w) => w.name)).not.toContain("Priv");
    expect(
      (await handlePublicWorkflows(req("/x", { method: "POST" }))).status
    ).toBe(405);
  });

  it("toWorkflowResponse maps model fields to the API shape", async () => {
    const wf = await makeWorkflow({
      user_id: "u1",
      name: "Shaped",
      tool_name: "t",
      description: "d",
      tags: ["x"]
    });
    const shaped = toWorkflowResponse(wf);
    expect(shaped.id).toBe(wf.id);
    expect(shaped.name).toBe("Shaped");
    expect(shaped.tool_name).toBe("t");
    expect(shaped.input_schema).toBeNull();
    expect(shaped.app_doc).toBeNull();
    expect(shaped).toHaveProperty("etag");
  });
});

describe("http-api coverage: handleApiRequest routing", () => {
  beforeEach(() => initTestDb());

  it("normalizes trailing slashes and returns 404 for unknown paths", async () => {
    const res = await handleApiRequest(req("/api/does/not/exist/"));
    expect(res.status).toBe(404);
  });

  it("validates usernames with all guard branches", async () => {
    // valid
    const ok = (await jsonBody(
      await handleApiRequest(req("/api/users/validate_username?username=alice_1"))
    )) as { valid: boolean; available: boolean };
    expect(ok.valid).toBe(true);
    expect(ok.available).toBe(true);
    // invalid characters
    const bad = (await jsonBody(
      await handleApiRequest(
        req("/api/users/validate_username?username=no%20spaces!")
      )
    )) as { valid: boolean };
    expect(bad.valid).toBe(false);
    // missing param
    expect(
      (await handleApiRequest(req("/api/users/validate_username"))).status
    ).toBe(400);
    // empty param
    expect(
      (
        await handleApiRequest(req("/api/users/validate_username?username=%20"))
      ).status
    ).toBe(400);
    // wrong method
    expect(
      (
        await handleApiRequest(
          req("/api/users/validate_username?username=alice", { method: "POST" })
        )
      ).status
    ).toBe(405);
  });

  it("routes /api/nodes/dummy and /api/workflows/names", async () => {
    const dummy = await handleApiRequest(req("/api/nodes/dummy"));
    expect(((await jsonBody(dummy)) as Record<string, unknown>).type).toBe(
      "asset"
    );

    await makeWorkflow({ user_id: "user-1", name: "Named" });
    const names = (await jsonBody(
      await handleApiRequest(
        req("/api/workflows/names", { headers: { "x-user-id": "user-1" } })
      )
    )) as Record<string, string>;
    expect(Object.values(names)).toContain("Named");
    expect(
      (
        await handleApiRequest(
          req("/api/workflows/names", { method: "POST" })
        )
      ).status
    ).toBe(405);
  });

  it("handles the standalone-mode stubs", async () => {
    expect(
      (await handleApiRequest(req("/api/workflows/examples/anything"))).status
    ).toBe(404);
    const secretsImport = await handleApiRequest(
      req("/admin/secrets/import", { method: "POST" })
    );
    expect(secretsImport.status).toBe(501);
    expect(
      (await handleApiRequest(req("/admin/secrets/import"))).status
    ).toBe(405);
  });

  it("routes the public-by-id path and rejects an empty id", async () => {
    const wf = await makeWorkflow({ user_id: "u1", access: "public" });
    const res = await handleApiRequest(
      req(`/api/workflows/public/${wf.id}`)
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 on a PUT with a non-JSON body", async () => {
    const wf = await makeWorkflow({ user_id: "user-1" });
    const res = await handleApiRequest(
      req(`/api/workflows/${wf.id}`, {
        method: "PUT",
        headers: { "x-user-id": "user-1" },
        body: "not json"
      })
    );
    expect(res.status).toBe(400);
  });
});
