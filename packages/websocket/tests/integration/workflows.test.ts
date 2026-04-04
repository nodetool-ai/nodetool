import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initTestDb } from "@nodetool/models";
import { startServer, stopServer, get, post, put, del } from "./setup.js";

const emptyGraph = { nodes: [], edges: [] };

beforeAll(startServer);
afterAll(stopServer);
beforeEach(() => initTestDb());

function createWf(name: string, extra: Record<string, unknown> = {}) {
  return post("/workflows/", {
    name,
    access: "private",
    graph: emptyGraph,
    ...extra
  });
}

describe("Workflow CRUD", () => {
  it("creates a workflow and returns it with graph", async () => {
    const res = await createWf("My Workflow", { description: "testing" });
    expect(res.status).toBe(200);
    const wf = await res.json();
    expect(wf.id).toBeTypeOf("string");
    expect(wf.name).toBe("My Workflow");
    expect(wf.description).toBe("testing");
    expect(wf.graph).toEqual(emptyGraph);
    expect(wf.created_at).toBeTypeOf("string");
  });

  it("lists workflows with pagination", async () => {
    await createWf("A");
    await createWf("B");
    await createWf("C");

    const res = await get("/workflows/?limit=2");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.workflows).toHaveLength(2);
    expect(data.next).not.toBeNull();
  });

  it("gets a single workflow by ID", async () => {
    const created = await (await createWf("Solo")).json();

    const res = await get(`/workflows/${created.id}`);
    expect(res.status).toBe(200);
    const wf = await res.json();
    expect(wf.id).toBe(created.id);
    expect(wf.name).toBe("Solo");
    expect(wf.graph.nodes).toEqual([]);
    expect(wf.graph.edges).toEqual([]);
  });

  it("returns 404 for non-existent workflow", async () => {
    const res = await get("/workflows/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("updates a workflow name and graph with nodes", async () => {
    const created = await (await createWf("Original")).json();

    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.String",
          data: { value: "hello" },
          ui_properties: { position: [100, 100] }
        }
      ],
      edges: []
    };

    const res = await put(`/workflows/${created.id}`, {
      ...created,
      name: "Updated",
      graph
    });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Updated");

    // Verify the graph persisted
    const fetched = await (await get(`/workflows/${created.id}`)).json();
    expect(fetched.graph.nodes).toHaveLength(1);
    expect(fetched.graph.nodes[0].type).toBe("nodetool.constant.String");
  });

  it("deletes a workflow and confirms it's gone", async () => {
    const created = await (await createWf("ToDelete")).json();

    const delRes = await del(`/workflows/${created.id}`);
    expect(delRes.status).toBe(204);

    const getRes = await get(`/workflows/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it("PUT upserts a workflow that doesn't exist", async () => {
    const res = await put("/workflows/new-id-123", {
      name: "Upserted",
      access: "private",
      graph: emptyGraph
    });
    expect(res.status).toBe(200);
    const wf = await res.json();
    expect(wf.id).toBe("new-id-123");
    expect(wf.name).toBe("Upserted");
  });
});

describe("Workflow access control", () => {
  it("public endpoint returns only public workflows", async () => {
    await createWf("Private");
    const pub = await (await createWf("Public", { access: "public" })).json();

    const res = await get(`/workflows/public/${pub.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Public");
  });

  it("public endpoint returns 404 for private workflows", async () => {
    const priv = await (await createWf("Secret")).json();
    const res = await get(`/workflows/public/${priv.id}`);
    expect(res.status).toBe(404);
  });

  it("user cannot see another user's workflow", async () => {
    const created = await (await createWf("User1's")).json();
    const res = await get(`/workflows/${created.id}`, { userId: "other-user" });
    expect(res.status).toBe(404);
  });
});

describe("Workflow graph persistence", () => {
  it("persists a complex graph with multiple nodes and edges", async () => {
    const created = await (await createWf("Complex")).json();

    const graph = {
      nodes: [
        {
          id: "input",
          type: "nodetool.constant.String",
          data: { value: "hello" },
          ui_properties: { position: [0, 0] }
        },
        {
          id: "output",
          type: "nodetool.constant.String",
          data: { value: "" },
          ui_properties: { position: [300, 0] }
        }
      ],
      edges: [
        {
          id: "e1",
          source: "input",
          sourceHandle: "output",
          target: "output",
          targetHandle: "value"
        }
      ]
    };

    await put(`/workflows/${created.id}`, { ...created, graph });

    const fetched = await (await get(`/workflows/${created.id}`)).json();
    expect(fetched.graph.nodes).toHaveLength(2);
    expect(fetched.graph.edges).toHaveLength(1);
    expect(fetched.graph.edges[0].source).toBe("input");
    expect(fetched.graph.edges[0].target).toBe("output");
  });
});
