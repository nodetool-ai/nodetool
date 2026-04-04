import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Workflow, Message, Thread } from "@nodetool/models";
import { handleApiRequest } from "../src/http-api.js";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("HTTP API: metadata + workflows", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("serves /api/nodes/metadata from Python package metadata files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nt-ts-md-"));
    const metadataDir = path.join(
      root,
      "pkg",
      "src",
      "nodetool",
      "package_metadata"
    );
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(
      path.join(metadataDir, "pkg.json"),
      JSON.stringify({
        name: "pkg",
        nodes: [
          {
            title: "Example Node",
            description: "Example description",
            namespace: "example",
            node_type: "example.Node",
            layout: "default",
            properties: [],
            outputs: [],

            recommended_models: [],
            basic_fields: [],
            required_settings: [],
            is_dynamic: false,
            is_streaming_output: false,
            expose_as_tool: false,
            supports_dynamic_outputs: false
          }
        ]
      }),
      "utf8"
    );

    const request = new Request("http://localhost/api/nodes/metadata");
    const response = await handleApiRequest(request, { metadataRoots: [root] });
    expect(response.status).toBe(200);

    const data = (await jsonBody(response)) as Array<Record<string, unknown>>;
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]?.node_type).toBe("example.Node");
  });

  it("supports /api/workflows CRUD", async () => {
    const createReq = new Request("http://localhost/api/workflows/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": "user-1"
      },
      body: JSON.stringify({
        name: "Workflow A",
        access: "private",
        graph: { nodes: [], edges: [] },
        description: "desc",
        run_mode: "workflow"
      })
    });

    const createRes = await handleApiRequest(createReq);
    expect(createRes.status).toBe(200);
    const created = (await jsonBody(createRes)) as Record<string, unknown>;
    expect(created.name).toBe("Workflow A");
    expect(typeof created.id).toBe("string");

    const listReq = new Request("http://localhost/api/workflows/?limit=10", {
      headers: { "x-user-id": "user-1" }
    });
    const listRes = await handleApiRequest(listReq);
    expect(listRes.status).toBe(200);
    const listed = (await jsonBody(listRes)) as {
      workflows: Array<Record<string, unknown>>;
      next: string | null;
    };
    expect(listed.workflows.length).toBe(1);
    expect(listed.next).toBeNull();

    const workflowId = String(created.id);
    const getReq = new Request(`http://localhost/api/workflows/${workflowId}`, {
      headers: { "x-user-id": "user-1" }
    });
    const getRes = await handleApiRequest(getReq);
    expect(getRes.status).toBe(200);
    const got = (await jsonBody(getRes)) as Record<string, unknown>;
    expect(got.id).toBe(workflowId);

    const updateReq = new Request(
      `http://localhost/api/workflows/${workflowId}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-1"
        },
        body: JSON.stringify({
          name: "Workflow B",
          access: "private",
          graph: { nodes: [], edges: [] },
          description: "updated",
          run_mode: "tool"
        })
      }
    );
    const updateRes = await handleApiRequest(updateReq);
    expect(updateRes.status).toBe(200);
    const updated = (await jsonBody(updateRes)) as Record<string, unknown>;
    expect(updated.name).toBe("Workflow B");
    expect(updated.run_mode).toBe("tool");

    // PUT upserts: creates the workflow if it doesn't exist
    const upsertReq = new Request(
      "http://localhost/api/workflows/does-not-exist",
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-user-id": "user-1"
        },
        body: JSON.stringify({
          name: "Upserted",
          access: "private",
          graph: { nodes: [], edges: [] }
        })
      }
    );
    const upsertRes = await handleApiRequest(upsertReq);
    expect(upsertRes.status).toBe(200);
    const upserted = (await jsonBody(upsertRes)) as Record<string, unknown>;
    expect(upserted.name).toBe("Upserted");
    expect(upserted.id).toBe("does-not-exist");

    const deleteReq = new Request(
      `http://localhost/api/workflows/${workflowId}`,
      {
        method: "DELETE",
        headers: { "x-user-id": "user-1" }
      }
    );
    const deleteRes = await handleApiRequest(deleteReq);
    expect(deleteRes.status).toBe(204);

    const missingRes = await handleApiRequest(getReq);
    expect(missingRes.status).toBe(404);
  });

  it("supports /api/workflows/public/{id} only for public workflows", async () => {
    const privateRes = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "Private WF",
          access: "private",
          graph: { nodes: [], edges: [] }
        })
      })
    );
    expect(privateRes.status).toBe(200);
    const privateWf = (await jsonBody(privateRes)) as Record<string, unknown>;

    const publicRes = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "u1" },
        body: JSON.stringify({
          name: "Public WF",
          access: "public",
          graph: { nodes: [], edges: [] }
        })
      })
    );
    expect(publicRes.status).toBe(200);
    const publicWf = (await jsonBody(publicRes)) as Record<string, unknown>;

    const publicGetOk = await handleApiRequest(
      new Request(
        `http://localhost/api/workflows/public/${String(publicWf.id)}`
      )
    );
    expect(publicGetOk.status).toBe(200);

    const publicGetPrivate = await handleApiRequest(
      new Request(
        `http://localhost/api/workflows/public/${String(privateWf.id)}`
      )
    );
    expect(publicGetPrivate.status).toBe(404);
  });

  it("serves /api/models/providers and /api/models/recommended", async () => {
    const providersRes = await handleApiRequest(
      new Request("http://localhost/api/models/providers")
    );
    expect(providersRes.status).toBe(200);
    const providers = (await jsonBody(providersRes)) as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(providers)).toBe(true);

    const recommendedRes = await handleApiRequest(
      new Request("http://localhost/api/models/recommended")
    );
    expect(recommendedRes.status).toBe(200);
    const recommended = (await jsonBody(recommendedRes)) as Array<
      Record<string, unknown>
    >;
    expect(Array.isArray(recommended)).toBe(true);
    expect(recommended.length).toBeGreaterThan(0);
  });

  it("serves /api/models/all as a deduped list", async () => {
    const response = await handleApiRequest(
      new Request("http://localhost/api/models/all")
    );
    expect(response.status).toBe(200);
    const all = (await jsonBody(response)) as Array<{
      repo_id: string | null;
      path: string | null;
    }>;
    expect(Array.isArray(all)).toBe(true);

    const keys = new Set<string>();
    for (const model of all) {
      const key = `${model.repo_id ?? ""}::${model.path ?? ""}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  it("handles /api/models/huggingface/cache_status", async () => {
    const response = await handleApiRequest(
      new Request("http://localhost/api/models/huggingface/cache_status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          {
            key: "k1",
            repo_id: "openai/does-not-exist",
            allow_patterns: "*.safetensors"
          }
        ])
      })
    );
    expect(response.status).toBe(200);
    const body = (await jsonBody(response)) as Array<{
      key: string;
      downloaded: boolean;
    }>;
    expect(body).toEqual([{ key: "k1", downloaded: false }]);
  });
});

describe("HTTP API: messages", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("POST /api/messages creates a message and auto-creates thread", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ role: "user", content: "Hello world" })
      })
    );
    expect(res.status).toBe(200);
    const msg = (await jsonBody(res)) as Record<string, unknown>;
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello world");
    expect(msg.user_id).toBe("user-1");
    expect(typeof msg.thread_id).toBe("string");
    expect(typeof msg.id).toBe("string");
  });

  it("POST /api/messages with explicit thread_id", async () => {
    // Create a thread first
    const threadRes = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "Test Thread" })
      })
    );
    const thread = (await jsonBody(threadRes)) as Record<string, unknown>;

    const res = await handleApiRequest(
      new Request("http://localhost/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({
          thread_id: thread.id,
          role: "assistant",
          content: "Hi there"
        })
      })
    );
    expect(res.status).toBe(200);
    const msg = (await jsonBody(res)) as Record<string, unknown>;
    expect(msg.thread_id).toBe(thread.id);
  });

  it("GET /api/messages/:id returns message", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ role: "user", content: "test" })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const getRes = await handleApiRequest(
      new Request(`http://localhost/api/messages/${String(created.id)}`, {
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(getRes.status).toBe(200);
    const msg = (await jsonBody(getRes)) as Record<string, unknown>;
    expect(msg.id).toBe(created.id);
    expect(msg.content).toBe("test");
  });

  it("GET /api/messages/:id returns 404 for wrong user", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ role: "user", content: "secret" })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const getRes = await handleApiRequest(
      new Request(`http://localhost/api/messages/${String(created.id)}`, {
        headers: { "x-user-id": "user-2" }
      })
    );
    expect(getRes.status).toBe(404);
  });

  it("GET /api/messages/:id returns 404 for nonexistent", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/messages/does-not-exist", {
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/messages?thread_id=... lists messages", async () => {
    // Create a thread
    const threadRes = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "Thread" })
      })
    );
    const thread = (await jsonBody(threadRes)) as Record<string, unknown>;
    const threadId = String(thread.id);

    // Create two messages
    for (const content of ["msg1", "msg2"]) {
      await handleApiRequest(
        new Request("http://localhost/api/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-id": "user-1"
          },
          body: JSON.stringify({ thread_id: threadId, role: "user", content })
        })
      );
    }

    const listRes = await handleApiRequest(
      new Request(`http://localhost/api/messages?thread_id=${threadId}`, {
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(listRes.status).toBe(200);
    const list = (await jsonBody(listRes)) as {
      messages: Array<Record<string, unknown>>;
      next: string | null;
    };
    expect(list.messages.length).toBe(2);
  });

  it("GET /api/messages without thread_id returns 400", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/messages", {
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("HTTP API: threads", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("POST /api/threads creates a thread", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "My Thread" })
      })
    );
    expect(res.status).toBe(200);
    const thread = (await jsonBody(res)) as Record<string, unknown>;
    expect(thread.title).toBe("My Thread");
    expect(thread.user_id).toBe("user-1");
    expect(typeof thread.id).toBe("string");
  });

  it("POST /api/threads defaults title to New Thread", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({})
      })
    );
    expect(res.status).toBe(200);
    const thread = (await jsonBody(res)) as Record<string, unknown>;
    expect(thread.title).toBe("New Thread");
  });

  it("GET /api/threads/:id returns thread", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "Test" })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const getRes = await handleApiRequest(
      new Request(`http://localhost/api/threads/${String(created.id)}`, {
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(getRes.status).toBe(200);
    const thread = (await jsonBody(getRes)) as Record<string, unknown>;
    expect(thread.id).toBe(created.id);
    expect(thread.title).toBe("Test");
  });

  it("GET /api/threads/:id returns 404 for wrong user", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "Secret" })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const getRes = await handleApiRequest(
      new Request(`http://localhost/api/threads/${String(created.id)}`, {
        headers: { "x-user-id": "user-2" }
      })
    );
    expect(getRes.status).toBe(404);
  });

  it("GET /api/threads/:id returns 404 for nonexistent", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/threads/does-not-exist", {
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/threads lists threads for user", async () => {
    for (const title of ["A", "B"]) {
      await handleApiRequest(
        new Request("http://localhost/api/threads", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-user-id": "user-1"
          },
          body: JSON.stringify({ title })
        })
      );
    }
    // Other user's thread
    await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-2" },
        body: JSON.stringify({ title: "Other" })
      })
    );

    const listRes = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(listRes.status).toBe(200);
    const list = (await jsonBody(listRes)) as {
      threads: Array<Record<string, unknown>>;
      next: string | null;
    };
    expect(list.threads.length).toBe(2);
  });

  it("PUT /api/threads/:id updates title", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "Old" })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const updateRes = await handleApiRequest(
      new Request(`http://localhost/api/threads/${String(created.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "New Title" })
      })
    );
    expect(updateRes.status).toBe(200);
    const updated = (await jsonBody(updateRes)) as Record<string, unknown>;
    expect(updated.title).toBe("New Title");
  });

  it("PUT /api/threads/:id returns 404 for wrong user", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "Mine" })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const updateRes = await handleApiRequest(
      new Request(`http://localhost/api/threads/${String(created.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": "user-2" },
        body: JSON.stringify({ title: "Hacked" })
      })
    );
    expect(updateRes.status).toBe(404);
  });

  it("DELETE /api/threads/:id deletes thread and messages", async () => {
    // Create thread
    const threadRes = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "To Delete" })
      })
    );
    const thread = (await jsonBody(threadRes)) as Record<string, unknown>;
    const threadId = String(thread.id);

    // Add a message
    const msgRes = await handleApiRequest(
      new Request("http://localhost/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({
          thread_id: threadId,
          role: "user",
          content: "bye"
        })
      })
    );
    const msg = (await jsonBody(msgRes)) as Record<string, unknown>;

    // Delete the thread
    const deleteRes = await handleApiRequest(
      new Request(`http://localhost/api/threads/${threadId}`, {
        method: "DELETE",
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(deleteRes.status).toBe(204);

    // Thread should be gone
    const getRes = await handleApiRequest(
      new Request(`http://localhost/api/threads/${threadId}`, {
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(getRes.status).toBe(404);

    // Message should be gone
    const getMsgRes = await handleApiRequest(
      new Request(`http://localhost/api/messages/${String(msg.id)}`, {
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(getMsgRes.status).toBe(404);
  });

  it("DELETE /api/threads/:id returns 404 for wrong user", async () => {
    const createRes = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1" },
        body: JSON.stringify({ title: "Mine" })
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const deleteRes = await handleApiRequest(
      new Request(`http://localhost/api/threads/${String(created.id)}`, {
        method: "DELETE",
        headers: { "x-user-id": "user-2" }
      })
    );
    expect(deleteRes.status).toBe(404);
  });

  it("DELETE /api/threads/:id returns 404 for nonexistent", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/threads/does-not-exist", {
        method: "DELETE",
        headers: { "x-user-id": "user-1" }
      })
    );
    expect(res.status).toBe(404);
  });
});
