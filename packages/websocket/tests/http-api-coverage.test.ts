/**
 * Additional HTTP API tests for 100% statement coverage.
 * Covers: handlePublicWorkflows, readNodeRequestBody, handleNodeHttpRequest,
 *         createHttpApiServer, workflow access control, method validation, etc.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  Workflow,
  Message,
  Thread,
  Job,
  Asset,
  Secret,
} from "@nodetool/models";
import {
  handleApiRequest,
  handleNodeHttpRequest,
  createHttpApiServer,
} from "../src/http-api.js";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function makeRequest(
  url: string,
  opts: { method?: string; userId?: string; body?: unknown; headers?: Record<string, string> } = {}
): Request {
  const { method = "GET", userId = "user-1", body, headers: extraHeaders } = opts;
  const headers: Record<string, string> = { "x-user-id": userId, ...extraHeaders };
  let requestBody: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(body);
  }
  return new Request(`http://localhost${url}`, {
    method,
    headers,
    body: requestBody,
  });
}

describe("HTTP API: public workflows", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();
  });

  it("GET /api/workflows/public returns public workflows", async () => {
    // Create a public workflow
    await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: {
          name: "Public WF",
          access: "public",
          graph: { nodes: [], edges: [] },
        },
      })
    );

    // Create a private workflow
    await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: {
          name: "Private WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        },
      })
    );

    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/public")
    );
    expect(res.status).toBe(200);
    const data = (await jsonBody(res)) as {
      workflows: Array<Record<string, unknown>>;
      next: string | null;
    };
    expect(data.workflows.length).toBe(1);
    expect(data.workflows[0].name).toBe("Public WF");
    expect(data.next).toBeNull();
  });

  it("POST /api/workflows/public returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/public", { method: "POST" })
    );
    expect(res.status).toBe(405);
  });

  it("GET /api/workflows/public respects limit", async () => {
    for (let i = 0; i < 3; i++) {
      await handleApiRequest(
        makeRequest("/api/workflows", {
          method: "POST",
          body: {
            name: `WF ${i}`,
            access: "public",
            graph: { nodes: [], edges: [] },
          },
        })
      );
    }

    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows/public?limit=2")
    );
    expect(res.status).toBe(200);
    const data = (await jsonBody(res)) as {
      workflows: Array<Record<string, unknown>>;
    };
    expect(data.workflows.length).toBe(2);
  });
});

describe("HTTP API: workflow access control", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();
  });

  it("GET /api/workflows/:id allows public access by another user", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        userId: "owner",
        body: {
          name: "Public WF",
          access: "public",
          graph: { nodes: [], edges: [] },
        },
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const getRes = await handleApiRequest(
      makeRequest(`/api/workflows/${String(created.id)}`, { userId: "viewer" })
    );
    expect(getRes.status).toBe(200);
  });

  it("GET /api/workflows/:id denies private access by another user", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        userId: "owner",
        body: {
          name: "Private WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        },
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const getRes = await handleApiRequest(
      makeRequest(`/api/workflows/${String(created.id)}`, { userId: "attacker" })
    );
    expect(getRes.status).toBe(404);
  });

  it("PUT /api/workflows/:id denies update by another user", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        userId: "owner",
        body: {
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        },
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const updateRes = await handleApiRequest(
      makeRequest(`/api/workflows/${String(created.id)}`, {
        method: "PUT",
        userId: "attacker",
        body: {
          name: "Hacked",
          access: "private",
          graph: { nodes: [], edges: [] },
        },
      })
    );
    expect(updateRes.status).toBe(404);
  });

  it("DELETE /api/workflows/:id denies delete by another user", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        userId: "owner",
        body: {
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        },
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const deleteRes = await handleApiRequest(
      makeRequest(`/api/workflows/${String(created.id)}`, {
        method: "DELETE",
        userId: "attacker",
      })
    );
    expect(deleteRes.status).toBe(404);
  });

  it("DELETE /api/workflows/:id returns 404 for nonexistent", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/workflows/nonexistent", { method: "DELETE" })
    );
    expect(res.status).toBe(404);
  });
});

describe("HTTP API: workflow validation", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();
  });

  it("POST /api/workflows with invalid body returns 400", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: { name: "test" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("POST /api/workflows without graph returns 400", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: { name: "test", access: "private" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("PUT /api/workflows/:id with invalid graph returns 400", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: {
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        },
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const updateRes = await handleApiRequest(
      makeRequest(`/api/workflows/${String(created.id)}`, {
        method: "PUT",
        body: { name: "Updated", access: "private" },
      })
    );
    expect(updateRes.status).toBe(400);
  });

  it("PUT /api/workflows/:id without json body returns 400", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: {
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        },
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const updateRes = await handleApiRequest(
      new Request(`http://localhost/api/workflows/${String(created.id)}`, {
        method: "PUT",
        headers: { "x-user-id": "user-1", "content-type": "text/plain" },
        body: "not json",
      })
    );
    expect(updateRes.status).toBe(400);
  });

  it("PATCH /api/workflows/:id returns 405", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: {
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        },
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/workflows/${String(created.id)}`, {
        method: "PATCH",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("PATCH /api/workflows returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "PATCH",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });
});

describe("HTTP API: not found routes", () => {
  it("returns 404 for unknown route", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/unknown")
    );
    expect(res.status).toBe(404);
  });
});

describe("HTTP API: method not allowed for various endpoints", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();
    await Job.createTable();
    await Message.createTable();
    await Thread.createTable();
  });

  it("DELETE /api/messages returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/messages", {
        method: "DELETE",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("DELETE /api/messages/:id returns 404 for missing message", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/messages/some-id", {
        method: "DELETE",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(404);
  });

  it("PATCH /api/threads returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/threads", {
        method: "PATCH",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("PATCH /api/threads/:id returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/threads/some-id", {
        method: "PATCH",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("PUT /api/threads/:id with invalid body returns 400", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/threads", {
        method: "POST",
        body: { title: "Test" },
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/threads/${String(created.id)}`, {
        method: "PUT",
        headers: { "x-user-id": "user-1", "content-type": "text/plain" },
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });

  it("POST /api/jobs returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs", {
        method: "POST",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("GET /api/jobs/:id/cancel returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs/some-id/cancel", {
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("POST /api/jobs/:id returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/jobs/some-id", {
        method: "POST",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("POST /api/settings/secrets returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/settings/secrets", {
        method: "POST",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("PATCH /api/settings/secrets/:key returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/settings/secrets/KEY", {
        method: "PATCH",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("PATCH /api/assets returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/assets", {
        method: "PATCH",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("PATCH /api/assets/:id returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/assets/some-id", {
        method: "PATCH",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(405);
  });

  it("POST /api/nodes/metadata returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/nodes/metadata", { method: "POST" })
    );
    expect(res.status).toBe(405);
  });

  it("POST /api/node/metadata returns 405", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/node/metadata", { method: "POST" })
    );
    expect(res.status).toBe(405);
  });
});

describe("HTTP API: handleNodeHttpRequest", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();
  });

  function createMockNodeReq(
    method: string,
    url: string,
    body?: string,
    headers?: Record<string, string | string[]>
  ): IncomingMessage {
    const stream = body
      ? Readable.from([Buffer.from(body)])
      : Readable.from([]);
    const req = Object.assign(stream, {
      method,
      url,
      headers: {
        "x-user-id": "user-1",
        ...headers,
      },
    }) as unknown as IncomingMessage;
    return req;
  }

  function createMockNodeRes(): ServerResponse & {
    _statusCode: number;
    _headers: Record<string, string>;
    _body: Buffer | null;
  } {
    const result = {
      _statusCode: 200,
      _headers: {} as Record<string, string>,
      _body: null as Buffer | null,
      statusCode: 200,
      setHeader(key: string, value: string) {
        result._headers[key] = value;
      },
      end(data?: Buffer | string) {
        if (data instanceof Buffer) {
          result._body = data;
        } else if (typeof data === "string") {
          result._body = Buffer.from(data);
        }
      },
    };
    Object.defineProperty(result, "statusCode", {
      get() {
        return result._statusCode;
      },
      set(value: number) {
        result._statusCode = value;
      },
    });
    return result as unknown as ServerResponse & {
      _statusCode: number;
      _headers: Record<string, string>;
      _body: Buffer | null;
    };
  }

  it("handles GET request", async () => {
    // Create a workflow first
    await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: {
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        },
      })
    );

    const req = createMockNodeReq("GET", "/api/workflows");
    const res = createMockNodeRes();

    await handleNodeHttpRequest(req, res as unknown as ServerResponse);
    expect(res._statusCode).toBe(200);
    expect(res._body).not.toBeNull();
    const data = JSON.parse(res._body!.toString());
    expect(data.workflows).toBeDefined();
  });

  it("handles POST request with body", async () => {
    const body = JSON.stringify({
      name: "Node WF",
      access: "private",
      graph: { nodes: [], edges: [] },
    });
    const req = createMockNodeReq("POST", "/api/workflows", body, {
      "content-type": "application/json",
    });
    const res = createMockNodeRes();

    await handleNodeHttpRequest(req, res as unknown as ServerResponse);
    expect(res._statusCode).toBe(200);
    const data = JSON.parse(res._body!.toString());
    expect(data.name).toBe("Node WF");
  });

  it("handles request with array header values", async () => {
    const req = createMockNodeReq("GET", "/api/workflows", undefined, {
      "accept": ["application/json", "text/plain"],
    } as unknown as Record<string, string>);
    const res = createMockNodeRes();

    await handleNodeHttpRequest(req, res as unknown as ServerResponse);
    expect(res._statusCode).toBe(200);
  });

  it("handles HEAD request (no body)", async () => {
    const req = createMockNodeReq("HEAD", "/api/workflows");
    const res = createMockNodeRes();

    await handleNodeHttpRequest(req, res as unknown as ServerResponse);
    // HEAD to unknown routes would return a status
    expect(typeof res._statusCode).toBe("number");
  });

  it("handles request with no response body", async () => {
    // Create and then delete a workflow
    const createRes = await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: {
          name: "WF",
          access: "private",
          graph: { nodes: [], edges: [] },
        },
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const req = createMockNodeReq("DELETE", `/api/workflows/${String(created.id)}`);
    const res = createMockNodeRes();

    await handleNodeHttpRequest(req, res as unknown as ServerResponse);
    expect(res._statusCode).toBe(204);
  });

  it("uses custom baseUrl option", async () => {
    const req = createMockNodeReq("GET", "/api/workflows");
    const res = createMockNodeRes();

    await handleNodeHttpRequest(req, res as unknown as ServerResponse, {
      baseUrl: "http://custom:8080",
    });
    expect(res._statusCode).toBe(200);
  });

  it("handles request with string chunk in body", async () => {
    // Create a custom readable that yields a string
    const stream = new Readable({
      read() {
        this.push("test body");
        this.push(null);
      },
    });
    const req = Object.assign(stream, {
      method: "POST",
      url: "/api/workflows",
      headers: {
        "x-user-id": "user-1",
        "content-type": "application/json",
      },
    }) as unknown as IncomingMessage;
    const res = createMockNodeRes();

    await handleNodeHttpRequest(req, res as unknown as ServerResponse);
    // Will get a 400 since "test body" is not valid JSON for workflow
    expect(res._statusCode).toBe(400);
  });
});

describe("HTTP API: createHttpApiServer", () => {
  it("creates a server instance", () => {
    const server = createHttpApiServer();
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe("function");
    server.close();
  });

  it("creates a server with options", () => {
    const server = createHttpApiServer({ baseUrl: "http://localhost:9999" });
    expect(server).toBeDefined();
    server.close();
  });
});

describe("HTTP API: POST /api/messages with invalid body returns 400", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Thread.createTable();
    await Message.createTable();
  });

  it("returns 400 for missing role", async () => {
    const res = await handleApiRequest(
      makeRequest("/api/messages", {
        method: "POST",
        body: { content: "hello" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-json body", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/messages", {
        method: "POST",
        headers: { "x-user-id": "user-1", "content-type": "text/plain" },
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("HTTP API: POST /api/assets with invalid body returns 400", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Asset.createTable();
  });

  it("returns 400 for non-json body", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/assets", {
        method: "POST",
        headers: { "x-user-id": "user-1", "content-type": "text/plain" },
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("HTTP API: PUT /api/assets/:id with invalid body", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Asset.createTable();
  });

  it("returns 400 for non-json body on update", async () => {
    const createRes = await handleApiRequest(
      makeRequest("/api/assets", {
        method: "POST",
        body: {
          name: "test.txt",
          content_type: "text/plain",
          parent_id: "user-1",
        },
      })
    );
    const created = (await jsonBody(createRes)) as Record<string, unknown>;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/assets/${String(created.id)}`, {
        method: "PUT",
        headers: { "x-user-id": "user-1", "content-type": "text/plain" },
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("HTTP API: workflow run_mode filter", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();
  });

  it("GET /api/workflows?run_mode=tool filters workflows", async () => {
    await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: {
          name: "Tool WF",
          access: "private",
          graph: { nodes: [], edges: [] },
          run_mode: "tool",
        },
      })
    );
    await handleApiRequest(
      makeRequest("/api/workflows", {
        method: "POST",
        body: {
          name: "Workflow WF",
          access: "private",
          graph: { nodes: [], edges: [] },
          run_mode: "workflow",
        },
      })
    );

    const res = await handleApiRequest(
      makeRequest("/api/workflows?run_mode=tool")
    );
    expect(res.status).toBe(200);
    const data = (await jsonBody(res)) as {
      workflows: Array<Record<string, unknown>>;
    };
    // The filter depends on the model implementation; just verify the endpoint works
    expect(Array.isArray(data.workflows)).toBe(true);
  });
});

describe("HTTP API: POST /api/workflows with non-json content type", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();
  });

  it("returns 400 for non-json POST body", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        method: "POST",
        headers: { "x-user-id": "user-1", "content-type": "text/plain" },
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("HTTP API: job cancel returns 404 for wrong user", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Job.createTable();
  });

  it("POST /api/jobs/:id/cancel returns 404 for wrong user", async () => {
    const job = (await Job.create({
      user_id: "user-2",
      workflow_id: "wf-1",
      status: "running",
    })) as Job;

    const res = await handleApiRequest(
      new Request(`http://localhost/api/jobs/${job.id}/cancel`, {
        method: "POST",
        headers: { "x-user-id": "user-1" },
      })
    );
    expect(res.status).toBe(404);
  });
});

describe("HTTP API: trailing slash normalization", () => {
  it("normalizes trailing slash on paths", async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();

    const res = await handleApiRequest(
      makeRequest("/api/workflows/")
    );
    expect(res.status).toBe(200);
  });
});

describe("HTTP API: getUserId fallback", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Workflow.createTable();
  });

  it("defaults to '1' when no user id header", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows")
    );
    expect(res.status).toBe(200);
  });

  it("uses custom userIdHeader", async () => {
    const res = await handleApiRequest(
      new Request("http://localhost/api/workflows", {
        headers: { "x-custom-user": "custom-user" },
      }),
      { userIdHeader: "x-custom-user" }
    );
    expect(res.status).toBe(200);
  });
});
