/**
 * The shipped example apps, over REST.
 *
 * These run against the real bundles in
 * `packages/base-nodes/nodetool/examples/apps`, so a bundle that stops parsing
 * or loses its workflows fails here rather than on a user's first install.
 */
import { fileURLToPath } from "node:url";
import nodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { Application, ModelObserver, Workflow, initTestDb } from "@nodetool-ai/models";

import applicationsRoutes from "../src/routes/applications.js";
import type { HttpApiOptions } from "../src/http-api.js";

const USER_ID = "user-1";

const EXAMPLE_APPS_DIR = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  "../../base-nodes/nodetool/examples/apps"
);

async function buildServer(
  apiOptions: HttpApiOptions = { exampleAppsDir: EXAMPLE_APPS_DIR }
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = USER_ID;
  });
  await app.register(applicationsRoutes, { apiOptions });
  await app.ready();
  return app;
}

interface ExampleSummary {
  slug: string;
  name: string;
  description: string;
  workflows: string[];
  operationCount: number;
}

describe("example apps", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
    ModelObserver.clear();
  });

  it("lists every shipped bundle with the workflows it installs", async () => {
    const response = await server.inject({ url: "/api/applications/examples" });
    expect(response.statusCode).toBe(200);
    const apps = response.json() as ExampleSummary[];

    expect(apps.length).toBeGreaterThanOrEqual(11);
    for (const app of apps) {
      expect(app.name).not.toBe("");
      expect(app.operationCount).toBeGreaterThan(0);
      expect(app.workflows.length).toBeGreaterThan(0);
    }
    const photo = apps.find((a) => a.slug === "photo-studio");
    expect(photo?.name).toBe("Photo Studio");
    expect(photo?.workflows).toContain("Image Enhance");
  });

  it("serves one bundle and 404s an unknown slug", async () => {
    const bundle = await server.inject({
      url: "/api/applications/examples/model-arena"
    });
    expect(bundle.statusCode).toBe(200);
    expect(bundle.json().name).toBe("Model Arena");
    // Operations address bundle-local keys, never workflow ids.
    const keys = bundle.json().workflows.map((w: { key: string }) => w.key);
    for (const operation of bundle.json().app.operations) {
      expect(keys).toContain(operation.workflowId);
    }

    const missing = await server.inject({
      url: "/api/applications/examples/not-an-app"
    });
    expect(missing.statusCode).toBe(404);
  });

  it("refuses a path-shaped slug", async () => {
    const response = await server.inject({
      url: "/api/applications/examples/..%2F..%2Fsecrets"
    });
    expect(response.statusCode).toBe(404);
  });

  it("installs an app together with its workflows", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/applications/examples/photo-studio/install",
      payload: { projectId: "p1" }
    });
    expect(response.statusCode).toBe(200);
    const app = response.json();
    expect(app.name).toBe("Photo Studio");
    expect(app.projectId).toBe("p1");

    // Every operation points at a real workflow row carrying a real graph.
    const boundIds: string[] = app.document.operations.map(
      (o: { workflowId: string }) => o.workflowId
    );
    expect(boundIds.length).toBeGreaterThan(0);
    for (const id of boundIds) {
      const workflow = await Workflow.find(USER_ID, id);
      expect(workflow).not.toBeNull();
      expect(workflow!.getGraph().nodes.length).toBeGreaterThan(0);
    }
    expect(await Application.findById(app.id)).not.toBeNull();
  });

  it("reuses the shared workflow when two apps bind the same template", async () => {
    // Photo Studio and Concept Studio both bind Image Enhance. Installing both
    // must leave one Image Enhance row that both apps point at.
    const photo = (
      await server.inject({
        method: "POST",
        url: "/api/applications/examples/photo-studio/install"
      })
    ).json();
    const concept = (
      await server.inject({
        method: "POST",
        url: "/api/applications/examples/concept-studio/install"
      })
    ).json();

    const [rows] = await Workflow.paginate(USER_ID, { limit: 100 });
    const enhance = rows.filter((w) => w.name === "Image Enhance");
    expect(enhance).toHaveLength(1);

    const idsOf = (app: { document: { operations: { workflowId: string }[] } }) =>
      new Set(app.document.operations.map((o) => o.workflowId));
    expect(idsOf(photo)).toContain(enhance[0]!.id);
    expect(idsOf(concept)).toContain(enhance[0]!.id);
  });

  it("installs the same app twice without duplicating its workflows", async () => {
    await server.inject({
      method: "POST",
      url: "/api/applications/examples/study-buddy/install"
    });
    const [before] = await Workflow.paginate(USER_ID, { limit: 100 });
    await server.inject({
      method: "POST",
      url: "/api/applications/examples/study-buddy/install"
    });
    const [after] = await Workflow.paginate(USER_ID, { limit: 100 });

    expect(after).toHaveLength(before.length);
    // Two apps, though — installing twice is a deliberate act on the app side.
    expect(await Application.listByUser(USER_ID)).toHaveLength(2);
  });

  it("keeps a bundle without a sourceId on the create-fresh path", async () => {
    const bundle = (
      await server.inject({ url: "/api/applications/examples/dataset-builder" })
    ).json();
    for (const workflow of bundle.workflows) delete workflow.sourceId;

    const first = await server.inject({
      method: "POST",
      url: "/api/applications/import-bundle",
      payload: { bundle }
    });
    const second = await server.inject({
      method: "POST",
      url: "/api/applications/import-bundle",
      payload: { bundle }
    });
    expect(second.statusCode).toBe(200);

    const idOf = (r: typeof first) => r.json().document.operations[0].workflowId;
    expect(idOf(first)).not.toBe(idOf(second));
    const [rows] = await Workflow.paginate(USER_ID, { limit: 100 });
    expect(rows).toHaveLength(2);
  });

  it("reports no examples when none are configured", async () => {
    await server.close();
    server = await buildServer({});
    const response = await server.inject({ url: "/api/applications/examples" });
    expect(response.json()).toEqual([]);
  });
});
