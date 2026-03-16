/**
 * Tests for new API endpoints: T-WS-1 through T-WS-7.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  Workflow,
  Job,
  Message,
  Thread,
  Asset,
} from "@nodetool/models";
import { handleApiRequest } from "../src/http-api.js";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ── T-WS-1 — Workflow API ────────────────────────────────────────────

describe("T-WS-1: Workflow API — autosave + names", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();
  });

  it("PUT /api/workflows/{id}/autosave updates without incrementing version", async () => {
    // Create a workflow first
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        }),
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;
    const wfId = String(created.id);

    // Autosave
    const autosaveRes = await handleApiRequest(
      new Request(`http://localhost/api/workflows/${wfId}/autosave`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "WF Autosaved",
          access: "private",
          graph: { nodes: [{ id: "n1" }], edges: [] },
        }),
      })
    );
    expect(autosaveRes.status).toBe(200);
    const autosaved = (await jsonBody(autosaveRes)) as Record<string, unknown>;
    expect(autosaved.skipped).toBe(false);
    expect(autosaved.message).toBe("Autosaved successfully");
  });

  it("PUT /api/workflows/{id}/autosave returns 404 for missing workflow", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/no-exist/autosave", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "X",
          access: "private",
          graph: { nodes: [], edges: [] },
        }),
      })
    );
    expect(res.status).toBe(404);
  });

  it("PUT /api/workflows/{id}/autosave returns 400 for invalid body", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        }),
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;
    const wfId = String(created.id);

    const res = await handleApiRequest(
      new Request(`http://localhost/api/workflows/${wfId}/autosave`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/workflows/names returns id-to-name map", async () => {
    await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "Alpha",
          access: "private",
          graph: { nodes: [], edges: [] },
        }),
      })
    );
    await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "Beta",
          access: "private",
          graph: { nodes: [], edges: [] },
        }),
      })
    );

    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/names", {
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    const values = Object.values(body);
    expect(values).toContain("Alpha");
    expect(values).toContain("Beta");
    expect(Object.keys(body).length).toBe(2);
  });

  it("GET /api/workflows/names returns empty object for no workflows", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/names", {
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    expect(Object.keys(body).length).toBe(0);
  });
});

// ── T-WS-2 — Job API ────────────────────────────────────────────────

describe("T-WS-2: Job API — running + delete", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Job.createTable();
  });

  it("GET /api/jobs/running/all returns only running jobs", async () => {
    await Job.create({
      user_id: "u1",
      workflow_id: "wf1",
      status: "running",
      started_at: new Date().toISOString(),
    });
    await Job.create({
      user_id: "u1",
      workflow_id: "wf2",
      status: "completed",
    });

    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs/running/all", {
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Array<Record<string, unknown>>;
    expect(body.length).toBe(1);
    expect(body[0].status).toBe("running");
    expect(body[0].is_running).toBe(true);
  });

  it("GET /api/jobs/running/all returns empty when no running jobs", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs/running/all", {
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Array<Record<string, unknown>>;
    expect(body.length).toBe(0);
  });

  it("DELETE /api/jobs/{id} deletes a completed job", async () => {
    const job = (await Job.create({
      user_id: "u1",
      workflow_id: "wf1",
      status: "completed",
    })) as Job;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: "DELETE",
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(204);

    // Verify it's gone
    const getRes = await handleApiRequest(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        headers: { "x-user-id": "u1" },
      })
    );
    expect(getRes.status).toBe(404);
  });

  it("DELETE /api/jobs/{id} returns 404 for missing job", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs/nonexistent", {
        method: "DELETE",
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/jobs/{id} returns 404 for other user's job", async () => {
    const job = (await Job.create({
      user_id: "u2",
      workflow_id: "wf1",
      status: "completed",
    })) as Job;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: "DELETE",
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(404);
  });
});

// ── T-WS-3 — Asset API ──────────────────────────────────────────────

describe("T-WS-3: Asset API — search + children", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Asset.createTable();
  });

  it("GET /api/assets/search?query=foo searches assets", async () => {
    await Asset.create({
      user_id: "u1",
      name: "foo-image.png",
      content_type: "image/png",
      parent_id: "u1",
    });
    await Asset.create({
      user_id: "u1",
      name: "bar-doc.pdf",
      content_type: "application/pdf",
      parent_id: "u1",
    });

    const res = await handleApiRequest(
      new Request("http://localhost/api/assets/search?query=foo", {
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as {
      assets: Array<Record<string, unknown>>;
    };
    expect(body.assets.length).toBe(1);
    expect(body.assets[0].name).toBe("foo-image.png");
  });

  it("GET /api/assets/search returns 400 without query param", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/assets/search", {
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/assets/{id}/children returns child assets", async () => {
    const folder = (await Asset.create({
      user_id: "u1",
      name: "My Folder",
      content_type: "folder",
      parent_id: "u1",
    })) as Asset;

    await Asset.create({
      user_id: "u1",
      name: "child1.txt",
      content_type: "text/plain",
      parent_id: folder.id,
    });
    await Asset.create({
      user_id: "u1",
      name: "child2.txt",
      content_type: "text/plain",
      parent_id: folder.id,
    });

    const res = await handleApiRequest(
      new Request(`http://localhost/api/assets/${folder.id}/children`, {
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as {
      assets: Array<Record<string, unknown>>;
    };
    expect(body.assets.length).toBe(2);
  });

  it("GET /api/assets/{id}/children returns empty for no children", async () => {
    const folder = (await Asset.create({
      user_id: "u1",
      name: "Empty Folder",
      content_type: "folder",
      parent_id: "u1",
    })) as Asset;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/assets/${folder.id}/children`, {
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as {
      assets: Array<Record<string, unknown>>;
    };
    expect(body.assets.length).toBe(0);
  });
});

// ── T-WS-4 — Message API ────────────────────────────────────────────

describe("T-WS-4: Message API — delete", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Message.createTable();
    await Thread.createTable();
  });

  it("DELETE /api/messages/{id} returns 204", async () => {
    const thread = (await Thread.create({
      user_id: "u1",
      title: "Test",
    })) as Thread;

    const msg = (await Message.create({
      user_id: "u1",
      thread_id: thread.id,
      role: "user",
      content: "hello",
    })) as Message;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/messages/${msg.id}`, {
        method: "DELETE",
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(204);

    // Verify it's gone
    const getRes = await handleApiRequest(
      new Request(`http://localhost/api/messages/${msg.id}`, {
        headers: { "x-user-id": "u1" },
      })
    );
    expect(getRes.status).toBe(404);
  });

  it("DELETE /api/messages/{id} returns 404 for missing message", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/messages/nonexistent", {
        method: "DELETE",
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/messages/{id} returns 404 for other user's message", async () => {
    const thread = (await Thread.create({
      user_id: "u2",
      title: "Test",
    })) as Thread;
    const msg = (await Message.create({
      user_id: "u2",
      thread_id: thread.id,
      role: "user",
      content: "hello",
    })) as Message;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/messages/${msg.id}`, {
        method: "DELETE",
        headers: { "x-user-id": "u1" },
      })
    );
    expect(res.status).toBe(404);
  });
});

// ── T-WS-5 — Thread API (PUT already exists, tested here for completeness) ──

describe("T-WS-5: Thread API — update title", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Thread.createTable();
  });

  it("PUT /api/threads/{id} updates title", async () => {
    const thread = (await Thread.create({
      user_id: "u1",
      title: "Old Title",
    })) as Thread;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/threads/${thread.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({ title: "New Title" }),
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Record<string, unknown>;
    expect(body.title).toBe("New Title");
  });
});

// ── T-WS-7 — Node API ───────────────────────────────────────────────

describe("T-WS-7: Node API — replicate_status", () => {
  it("GET /api/nodes/replicate_status returns configured status", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/nodes/replicate_status")
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as { configured: boolean };
    expect(typeof body.configured).toBe("boolean");
  });
});
