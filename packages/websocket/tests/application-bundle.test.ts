/**
 * Bundle export/import over REST. The point of the round trip is that the
 * artifact is portable: exporting an app, throwing the database away, and
 * importing the file has to reproduce a runnable app — new workflow rows, and
 * operations pointing at those rows rather than at ids from the old database.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  ModelObserver,
  Workflow,
  initTestDb
} from "@nodetool-ai/models";

import applicationsRoutes from "../src/routes/applications.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const USER_ID = "user-1";

const createCaller = createCallerFactory(appRouter);

function makeCtx(userId: string): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  } as Context;
}

async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = USER_ID;
  });
  await app.register(applicationsRoutes, { apiOptions: {} });
  await app.ready();
  return app;
}

const graphOf = (nodeId: string) => ({
  nodes: [{ id: nodeId, type: "nodetool.text.Concat" }],
  edges: []
});

/** An app binding two workflows, one operation each. */
async function seedTwoWorkflowApp() {
  await Workflow.create<Workflow>({
    id: "wf-draft",
    user_id: USER_ID,
    name: "Draft copy",
    description: "writes a draft",
    graph: graphOf("draft-node")
  });
  await Workflow.create<Workflow>({
    id: "wf-refine",
    user_id: USER_ID,
    name: "Refine copy",
    graph: graphOf("refine-node")
  });
  const document = createEmptyDocument("Copywriter");
  document.operations = [
    {
      id: "draft",
      name: "Draft",
      workflowId: "wf-draft",
      inputs: {},
      outputs: {},
      policy: "replace"
    },
    {
      id: "refine",
      name: "Refine",
      workflowId: "wf-refine",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  document.variables = [
    { id: "tone", name: "Tone", scope: "instance", persist: false }
  ];
  return Application.create<Application>({
    user_id: USER_ID,
    project_id: "p1",
    name: "Copywriter",
    description: "draft then refine",
    document: JSON.stringify(document)
  });
}

describe("application bundle export/import", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
    ModelObserver.clear();
  });

  it("exports an app with the graphs of every workflow it binds", async () => {
    const seeded = await seedTwoWorkflowApp();
    const response = await server.inject({
      url: `/api/applications/${seeded.id}/export-bundle`
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="Copywriter.app.json"'
    );
    const bundle = response.json();
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.name).toBe("Copywriter");
    expect(bundle.workflows.map((w: { key: string }) => w.key)).toEqual([
      "draft-copy",
      "refine-copy"
    ]);
    // Operations address bundle keys, never the ids of the exporting database.
    expect(
      bundle.app.operations.map((o: { workflowId: string }) => o.workflowId)
    ).toEqual(["draft-copy", "refine-copy"]);
    expect(bundle.workflows[0].graph).toEqual(graphOf("draft-node"));
    expect(bundle.workflows[0].version).toBeNull();
  });

  it("round-trips onto a clean database into a working app", async () => {
    const seeded = await seedTwoWorkflowApp();
    const exported = (
      await server.inject({
        url: `/api/applications/${seeded.id}/export-bundle`
      })
    ).json();

    // Everything the export came from is gone: a fresh database and a fresh
    // server, so nothing can resolve by an old id.
    await server.close();
    initTestDb();
    server = await buildServer();
    expect(await Workflow.find(USER_ID, "wf-draft")).toBeNull();

    const imported = await server.inject({
      method: "POST",
      url: "/api/applications/import-bundle",
      payload: { bundle: exported, projectId: "p2" }
    });
    expect(imported.statusCode).toBe(200);
    const app = imported.json();
    expect(app.name).toBe("Copywriter");
    expect(app.description).toBe("draft then refine");
    expect(app.projectId).toBe("p2");
    expect(app.document.variables).toHaveLength(1);

    const boundIds = app.document.operations.map(
      (o: { workflowId: string }) => o.workflowId
    );
    expect(boundIds).toHaveLength(2);
    expect(new Set(boundIds).size).toBe(2);
    expect(boundIds).not.toContain("wf-draft");
    expect(boundIds).not.toContain("draft-copy");

    // Each operation resolves to a real workflow carrying the exported graph.
    const draft = await Workflow.find(USER_ID, boundIds[0]);
    const refine = await Workflow.find(USER_ID, boundIds[1]);
    expect(draft?.name).toBe("Draft copy");
    expect(draft?.getGraph()).toEqual(graphOf("draft-node"));
    expect(refine?.getGraph()).toEqual(graphOf("refine-node"));

    // And the app reads back over the normal API, publishable — which only
    // succeeds when every bound workflow exists.
    const readBack = await server.inject({ url: `/api/applications/${app.id}` });
    expect(readBack.json()).toEqual(app);
    const release = await createCaller(makeCtx(USER_ID)).applications.publish({
      id: app.id
    });
    expect(
      release.capabilities.workflows.map((w) => w.workflowId).sort()
    ).toEqual([...boundIds].sort());
  });

  it("exports the released snapshot and its pinned graphs with ?released=1", async () => {
    const seeded = await seedTwoWorkflowApp();
    await createCaller(makeCtx(USER_ID)).applications.publish({ id: seeded.id });

    // The live workflow moves on after the release; the pinned export must not.
    const workflow = (await Workflow.find(USER_ID, "wf-draft"))!;
    workflow.graph = graphOf("edited-after-release");
    await workflow.save();

    const draftExport = (
      await server.inject({
        url: `/api/applications/${seeded.id}/export-bundle`
      })
    ).json();
    expect(draftExport.workflows[0].graph).toEqual(
      graphOf("edited-after-release")
    );

    const pinned = await server.inject({
      url: `/api/applications/${seeded.id}/export-bundle?released=1`
    });
    expect(pinned.statusCode).toBe(200);
    const bundle = pinned.json();
    expect(bundle.workflows[0].graph).toEqual(graphOf("draft-node"));
    expect(bundle.workflows[0].version).toBe(1);
    expect(typeof bundle.workflows[0].graphHash).toBe("string");
  });

  it("404s a released export when nothing is published", async () => {
    const seeded = await seedTwoWorkflowApp();
    const response = await server.inject({
      url: `/api/applications/${seeded.id}/export-bundle?released=1`
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().detail).toContain("no released version");
  });

  it("rejects a payload that is not a bundle", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/applications/import-bundle",
      payload: { bundle: { name: "nope" } }
    });
    expect(response.statusCode).toBe(400);
  });

  it("hides another user's app from export", async () => {
    initTestDb();
    const other = await Application.create<Application>({
      user_id: "someone-else",
      name: "Theirs",
      document: JSON.stringify(createEmptyDocument("Theirs"))
    });
    const response = await server.inject({
      url: `/api/applications/${other.id}/export-bundle`
    });
    expect(response.statusCode).toBe(404);
  });
});
