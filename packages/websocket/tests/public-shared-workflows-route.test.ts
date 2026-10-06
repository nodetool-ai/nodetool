/**
 * GET /api/shared-workflows/:token is reachable without an account, so it
 * must answer only for an active public token and say nothing about the
 * owner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Workflow: { ...actual.Workflow, get: vi.fn() },
    WorkflowShare: { ...actual.WorkflowShare, findByToken: vi.fn() }
  };
});

import { Workflow, WorkflowShare } from "@nodetool-ai/models";
import publicSharedWorkflowRoutes from "../src/routes/public-shared-workflows.js";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const graph = {
  nodes: [{ id: "n1", type: "nodetool.input.StringInput", data: {} }],
  edges: []
};

function share(role: string, revokedAt: string | null = null) {
  return {
    id: "share-1",
    workflow_id: "wf-1",
    token: "tok_abc",
    role,
    created_by: "owner-1",
    revoked_at: revokedAt,
    isRevoked: revokedAt != null
  };
}

describe("GET /api/shared-workflows/:token", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    asMock(Workflow.get).mockResolvedValue({
      id: "wf-1",
      user_id: "owner-1",
      name: "Shared",
      description: "A shared workflow",
      tags: ["demo"],
      graph,
      access: "private"
    });
    app = Fastify({ logger: false });
    await app.register(publicSharedWorkflowRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns the graph and label for an active public token", async () => {
    asMock(WorkflowShare.findByToken).mockResolvedValue(share("public"));

    const res = await app.inject({
      method: "GET",
      url: "/api/shared-workflows/tok_abc"
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const body = res.json();
    expect(body).toEqual({
      name: "Shared",
      description: "A shared workflow",
      tags: ["demo"],
      graph: expect.objectContaining({ nodes: [expect.objectContaining({ id: "n1" })] })
    });
    expect(body).not.toHaveProperty("user_id");
    expect(body).not.toHaveProperty("id");
  });

  it.each([
    ["a viewer token", share("viewer")],
    ["an editor token", share("editor")],
    ["a revoked public token", share("public", "2026-07-09T00:00:00Z")],
    ["an unknown token", null]
  ])("answers 404 for %s", async (_label, row) => {
    asMock(WorkflowShare.findByToken).mockResolvedValue(row);

    const res = await app.inject({
      method: "GET",
      url: "/api/shared-workflows/tok_abc"
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ detail: "This workflow is not available" });
  });

  it("answers 404 when the workflow behind the token is gone", async () => {
    asMock(WorkflowShare.findByToken).mockResolvedValue(share("public"));
    asMock(Workflow.get).mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/shared-workflows/tok_abc"
    });

    expect(res.statusCode).toBe(404);
  });
});
