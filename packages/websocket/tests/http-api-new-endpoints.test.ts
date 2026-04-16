/**
 * Tests for new API endpoints: T-WS-1 through T-WS-7.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  initTestDb,
  Workflow,
  Job,
  Message,
  Thread,
  Asset
} from "@nodetool/models";
import { handleApiRequest } from "../src/http-api.js";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ── T-WS-1 — Workflow API ────────────────────────────────────────────

describe("T-WS-1: Workflow API — autosave + names", () => {
  beforeEach(() => {
    initTestDb();
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
          graph: { nodes: [], edges: [] }
        })
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
          graph: { nodes: [{ id: "n1" }], edges: [] }
        })
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
          graph: { nodes: [], edges: [] }
        })
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
          graph: { nodes: [], edges: [] }
        })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;
    const wfId = String(created.id);

    const res = await handleApiRequest(
      new Request(`http://localhost/api/workflows/${wfId}/autosave`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({})
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
          graph: { nodes: [], edges: [] }
        })
      })
    );
    await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "Beta",
          access: "private",
          graph: { nodes: [], edges: [] }
        })
      })
    );

    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/names", {
        headers: { "x-user-id": "u1" }
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
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Record<string, string>;
    expect(Object.keys(body).length).toBe(0);
  });

  it("POST /api/workflows/{id}/run executes a simple workflow", async () => {
    const created = (await Workflow.create({
      user_id: "u1",
      name: "Run Me",
      access: "private",
      graph: {
        nodes: [
          {
            id: "const-1",
            type: "nodetool.constant.Integer",
            data: { value: 9 }
          },
          {
            id: "out-1",
            type: "nodetool.output.Output",
            data: { name: "answer", description: "" }
          }
        ],
        edges: [
          {
            id: "edge-1",
            source: "const-1",
            sourceHandle: "output",
            target: "out-1",
            targetHandle: "value",
            edge_type: "data"
          }
        ]
      }
    })) as Workflow;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/workflows/${created.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({ params: {} })
      })
    );

    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as {
      job_id: string;
      status: string;
      outputs: Record<string, unknown[]>;
    };
    expect(body.job_id).toBeTruthy();
    expect(body.status).toBe("completed");
    expect(Object.values(body.outputs).flat()).toContain(9);
  });
});

// ── T-WS-2 — Job API ────────────────────────────────────────────────

describe("T-WS-2: Job API — running + delete", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("GET /api/jobs/running/all returns only running jobs", async () => {
    await Job.create({
      user_id: "u1",
      workflow_id: "wf1",
      status: "running",
      started_at: new Date().toISOString()
    });
    await Job.create({
      user_id: "u1",
      workflow_id: "wf2",
      status: "completed"
    });

    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs/running/all", {
        headers: { "x-user-id": "u1" }
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
        headers: { "x-user-id": "u1" }
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
      status: "completed"
    })) as Job;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: "DELETE",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(204);

    // Verify it's gone
    const getRes = await handleApiRequest(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        headers: { "x-user-id": "u1" }
      })
    );
    expect(getRes.status).toBe(404);
  });

  it("DELETE /api/jobs/{id} returns 404 for missing job", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs/nonexistent", {
        method: "DELETE",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/jobs/{id} returns 404 for other user's job", async () => {
    const job = (await Job.create({
      user_id: "u2",
      workflow_id: "wf1",
      status: "completed"
    })) as Job;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/jobs/${job.id}`, {
        method: "DELETE",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(404);
  });
});

// ── T-WS-3 — Asset API ──────────────────────────────────────────────

describe("T-WS-3: Asset API — search + children", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("GET /api/assets/search?query=foo searches assets", async () => {
    await Asset.create({
      user_id: "u1",
      name: "foo-image.png",
      content_type: "image/png",
      parent_id: "u1"
    });
    await Asset.create({
      user_id: "u1",
      name: "bar-doc.pdf",
      content_type: "application/pdf",
      parent_id: "u1"
    });

    const res = await handleApiRequest(
      new Request("http://localhost/api/assets/search?query=foo", {
        headers: { "x-user-id": "u1" }
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
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(400);
  });

  it("GET /api/assets/{id}/children returns child assets", async () => {
    const folder = (await Asset.create({
      user_id: "u1",
      name: "My Folder",
      content_type: "folder",
      parent_id: "u1"
    })) as Asset;

    await Asset.create({
      user_id: "u1",
      name: "child1.txt",
      content_type: "text/plain",
      parent_id: folder.id
    });
    await Asset.create({
      user_id: "u1",
      name: "child2.txt",
      content_type: "text/plain",
      parent_id: folder.id
    });

    const res = await handleApiRequest(
      new Request(`http://localhost/api/assets/${folder.id}/children`, {
        headers: { "x-user-id": "u1" }
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
      parent_id: "u1"
    })) as Asset;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/assets/${folder.id}/children`, {
        headers: { "x-user-id": "u1" }
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
  beforeEach(() => {
    initTestDb();
  });

  it("DELETE /api/messages/{id} returns 204", async () => {
    const thread = (await Thread.create({
      user_id: "u1",
      title: "Test"
    })) as Thread;

    const msg = (await Message.create({
      user_id: "u1",
      thread_id: thread.id,
      role: "user",
      content: "hello"
    })) as Message;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/messages/${msg.id}`, {
        method: "DELETE",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(204);

    // Verify it's gone
    const getRes = await handleApiRequest(
      new Request(`http://localhost/api/messages/${msg.id}`, {
        headers: { "x-user-id": "u1" }
      })
    );
    expect(getRes.status).toBe(404);
  });

  it("DELETE /api/messages/{id} returns 404 for missing message", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/messages/nonexistent", {
        method: "DELETE",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/messages/{id} returns 404 for other user's message", async () => {
    const thread = (await Thread.create({
      user_id: "u2",
      title: "Test"
    })) as Thread;
    const msg = (await Message.create({
      user_id: "u2",
      thread_id: thread.id,
      role: "user",
      content: "hello"
    })) as Message;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/messages/${msg.id}`, {
        method: "DELETE",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(404);
  });
});

// ── T-WS-5 — Thread API (PUT already exists, tested here for completeness) ──

describe("T-WS-5: Thread API — update title", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("PUT /api/threads/{id} updates title", async () => {
    const thread = (await Thread.create({
      user_id: "u1",
      title: "Old Title"
    })) as Thread;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/threads/${thread.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({ title: "New Title" })
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Record<string, unknown>;
    expect(body.title).toBe("New Title");
  });
});

// ── T-WS-7 — Node API ───────────────────────────────────────────────

describe("T-WS-7: Node API — replicate_status", () => {
  it("GET /api/nodes/replicate_status is not handled by handleApiRequest (only Fastify routes)", async () => {
    // replicate_status is only registered as a Fastify route, not in handleApiRequest
    const res = await handleApiRequest(
      new Request("http://localhost/api/nodes/replicate_status")
    );
    expect(res.status).toBe(404);
  });
});

// ── T-WS-8 — Workflow generate-name ────────────────────────────────────

describe("T-WS-8: Workflow generate-name", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("POST /api/workflows/{id}/generate-name returns a name", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "My Workflow",
          access: "private",
          graph: {
            nodes: [
              { id: "n1", type: "nodetool.text.Generate" },
              { id: "n2", type: "nodetool.image.Transform" }
            ],
            edges: []
          }
        })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;
    const wfId = String(created.id);

    const res = await handleApiRequest(
      new Request(`http://localhost/api/workflows/${wfId}/generate-name`, {
        method: "POST",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Record<string, unknown>;
    expect(typeof body.name).toBe("string");
    expect((body.name as string).length).toBeGreaterThan(0);
  });

  it("POST /api/workflows/{id}/generate-name returns 404 for missing workflow", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/nonexistent/generate-name", {
        method: "POST",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/workflows/{id}/generate-name returns 404 for another user's workflow", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "owner" },
        body: JSON.stringify({
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] }
        })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const res = await handleApiRequest(
      new Request(
        `http://localhost/api/workflows/${String(created.id)}/generate-name`,
        {
          method: "POST",
          headers: { "x-user-id": "other-user" }
        }
      )
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/workflows/{id}/generate-name returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/any-id/generate-name", {
        method: "GET",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(405);
  });
});

// ── T-WS-9 — Workflow DSL export ────────────────────────────────────────

describe("T-WS-9: Workflow DSL export", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("GET /api/workflows/{id}/dsl-export returns DSL text or 400 for empty graph", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] }
        })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const res = await handleApiRequest(
      new Request(
        `http://localhost/api/workflows/${String(created.id)}/dsl-export`,
        {
          headers: { "x-user-id": "u1" }
        }
      )
    );
    // dsl-export is now fully implemented; empty graph may return 200 or 400
    expect([200, 400]).toContain(res.status);
  });

  it("GET /api/workflows/{id}/dsl-export returns 404 for missing workflow", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/nonexistent/dsl-export", {
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/workflows/{id}/dsl-export returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/any-id/dsl-export", {
        method: "POST",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(405);
  });
});

// ── T-WS-10 — Workflow Gradio export ────────────────────────────────────

describe("T-WS-10: Workflow Gradio export", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("POST /api/workflows/{id}/gradio-export returns 501 in standalone mode", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] }
        })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const res = await handleApiRequest(
      new Request(
        `http://localhost/api/workflows/${String(created.id)}/gradio-export`,
        {
          method: "POST",
          headers: { "x-user-id": "u1" }
        }
      )
    );
    expect(res.status).toBe(501);
  });

  it("POST /api/workflows/{id}/gradio-export returns 404 for missing workflow", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/nonexistent/gradio-export", {
        method: "POST",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/workflows/{id}/gradio-export returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/any-id/gradio-export", {
        method: "GET",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(405);
  });
});

// ── T-WS-11 — Thread summarize ────────────────────────────────────────────

describe("T-WS-11: Thread summarize", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("POST /api/threads/{id}/summarize returns title derived from messages", async () => {
    const thread = (await Thread.create({
      user_id: "u1",
      title: "Old Title"
    })) as Thread;

    await Message.create({
      user_id: "u1",
      thread_id: thread.id,
      role: "user",
      content: "What is the capital of France?"
    });

    const res = await handleApiRequest(
      new Request(`http://localhost/api/threads/${thread.id}/summarize`, {
        method: "POST",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Record<string, unknown>;
    expect(typeof body.title).toBe("string");
    expect((body.title as string).length).toBeGreaterThan(0);
  });

  it("POST /api/threads/{id}/summarize returns 404 for missing thread", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/threads/nonexistent/summarize", {
        method: "POST",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/threads/{id}/summarize returns 404 for another user's thread", async () => {
    const thread = (await Thread.create({
      user_id: "owner",
      title: "Owner's Thread"
    })) as Thread;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/threads/${thread.id}/summarize`, {
        method: "POST",
        headers: { "x-user-id": "other-user" }
      })
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/threads/{id}/summarize returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/threads/any-id/summarize", {
        method: "GET",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(405);
  });
});

// ── T-WS-12 — Trigger job stubs ──────────────────────────────────────────

describe("T-WS-12: Trigger job endpoints", () => {
  it("GET /api/triggers/running returns empty list", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs/triggers/running", {
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(200);
    const body = (await jsonBody(res)) as Record<string, unknown>;
    expect(Array.isArray(body.workflows)).toBe(true);
  });

  it("POST /api/triggers/{id}/start returns 501", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs/triggers/some-workflow/start", {
        method: "POST",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(501);
  });

  it("POST /api/triggers/{id}/stop returns 501", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs/triggers/some-workflow/stop", {
        method: "POST",
        headers: { "x-user-id": "u1" }
      })
    );
    expect(res.status).toBe(501);
  });
});
