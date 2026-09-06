/**
 * REST `DELETE /api/workflows/:id` must cascade the grants that outlive the
 * row, the same way the tRPC route and the sandbox capability do.
 *
 * The three delete paths used to differ: REST called `workflow.delete()`
 * directly and left collaborator and share rows behind, so a workflow
 * recreated under the same id inherited grants its owner never issued.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  initTestDb,
  ModelObserver,
  Workflow,
  WorkflowCollaborator,
  WorkflowShare
} from "@nodetool-ai/models";
import workflowsRoutes from "../src/routes/workflows.js";

const OWNER = "owner-1";
const OTHER = "other-1";

describe("REST workflow delete", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    app = Fastify({ logger: false });
    // `bridge` forwards only the server-authenticated identity, so stand in for
    // the auth hook the production server registers ahead of these routes.
    app.decorateRequest("userId", null);
    app.addHook("onRequest", async (req) => {
      req.userId = (req.headers["x-test-user"] as string | undefined) ?? null;
    });
    await app.register(workflowsRoutes, { apiOptions: {} });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    ModelObserver.clear();
  });

  async function seedWorkflow(): Promise<string> {
    const wf = await Workflow.create<Workflow>({
      user_id: OWNER,
      name: "wf",
      description: "",
      tags: [],
      access: "private",
      graph: { nodes: [], edges: [] },
      run_mode: "workflow"
    });
    await WorkflowCollaborator.upsert({
      workflowId: wf.id,
      userId: OTHER,
      role: "editor",
      invitedBy: OWNER
    });
    await WorkflowShare.ensure({
      workflowId: wf.id,
      role: "viewer",
      createdBy: OWNER
    });
    return wf.id;
  }

  it("removes the collaborator grants and share links with the row", async () => {
    const id = await seedWorkflow();

    const response = await app.inject({
      method: "DELETE",
      url: `/api/workflows/${id}`,
      headers: { "x-test-user": OWNER }
    });

    expect(response.statusCode).toBe(204);
    expect(await Workflow.get(id)).toBeNull();
    expect(await WorkflowCollaborator.findFor(id, OTHER)).toBeNull();
    expect(await WorkflowShare.listForWorkflow(id)).toEqual([]);
  });

  it("refuses a delete from a non-owner and leaves the grants alone", async () => {
    const id = await seedWorkflow();

    const response = await app.inject({
      method: "DELETE",
      url: `/api/workflows/${id}`,
      headers: { "x-test-user": OTHER }
    });

    expect(response.statusCode).toBe(404);
    expect(await Workflow.get(id)).not.toBeNull();
    expect(await WorkflowCollaborator.findFor(id, OTHER)).not.toBeNull();
  });
});
