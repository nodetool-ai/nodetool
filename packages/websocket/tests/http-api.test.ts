import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
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
});
