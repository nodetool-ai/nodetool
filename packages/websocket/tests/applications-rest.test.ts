/**
 * REST/tRPC parity for applications. Both transports call the same service, so
 * the point of these tests is that nothing in the transport layer reshapes an
 * app on its way out.
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

async function buildServer(userId: string | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = userId;
  });
  await app.register(applicationsRoutes, { apiOptions: {} });
  await app.ready();
  return app;
}

async function seedApp(userId = USER_ID) {
  await Workflow.create<Workflow>({
    id: "wf1",
    user_id: userId,
    name: "Demo workflow",
    graph: { nodes: [{ id: "n1", type: "nodetool.text.Concat" }], edges: [] }
  });
  const document = createEmptyDocument("Demo");
  document.operations = [
    {
      id: "main",
      name: "Run",
      workflowId: "wf1",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  return Application.create<Application>({
    user_id: userId,
    project_id: "p1",
    name: "Demo app",
    description: "seeded",
    document: JSON.stringify(document)
  });
}

describe("applications REST routes", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    server = await buildServer(USER_ID);
  });

  afterEach(async () => {
    await server.close();
    ModelObserver.clear();
  });

  it("returns the same list and detail shapes as tRPC", async () => {
    const seeded = await seedApp();
    const caller = createCaller(makeCtx(USER_ID));

    const list = await server.inject({ url: "/api/applications" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual(await caller.applications.list({}));

    const detail = await server.inject({
      url: `/api/applications/${seeded.id}`
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toEqual(
      await caller.applications.get({ id: seeded.id })
    );
  });

  it("filters the list by project", async () => {
    await seedApp();
    const empty = await server.inject({
      url: "/api/applications?project_id=other"
    });
    expect(empty.json()).toEqual([]);

    const matching = await server.inject({
      url: "/api/applications?project_id=p1"
    });
    expect(matching.json()).toHaveLength(1);
  });

  it("creates an app that tRPC then reads back identically", async () => {
    const created = await server.inject({
      method: "POST",
      url: "/api/applications",
      payload: { name: "From REST", projectId: "p2" }
    });
    expect(created.statusCode).toBe(200);
    const body = created.json();
    expect(body.name).toBe("From REST");
    expect(body.projectId).toBe("p2");

    const caller = createCaller(makeCtx(USER_ID));
    expect(await caller.applications.get({ id: body.id })).toEqual(body);
  });

  it("updates with optimistic concurrency and reports a conflict", async () => {
    const seeded = await seedApp();
    const before = (
      await server.inject({ url: `/api/applications/${seeded.id}` })
    ).json();

    const updated = await server.inject({
      method: "PUT",
      url: `/api/applications/${seeded.id}`,
      payload: { name: "Renamed", baseUpdatedAt: before.updatedAt }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe("Renamed");

    const stale = await server.inject({
      method: "PATCH",
      url: `/api/applications/${seeded.id}`,
      payload: { name: "Too late", baseUpdatedAt: "1999-01-01T00:00:00.000Z" }
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().detail).toContain("optimistic concurrency");
  });

  it("deletes an app and then 404s on it", async () => {
    const seeded = await seedApp();
    const deleted = await server.inject({
      method: "DELETE",
      url: `/api/applications/${seeded.id}`
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });

    const missing = await server.inject({
      url: `/api/applications/${seeded.id}`
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ detail: "Application not found" });
  });

  it("serves the released document exactly as tRPC does", async () => {
    const seeded = await seedApp();
    const caller = createCaller(makeCtx(USER_ID));

    const beforePublish = await server.inject({
      url: `/api/applications/${seeded.id}/released-document`
    });
    expect(beforePublish.statusCode).toBe(200);
    expect(beforePublish.json()).toBeNull();

    await caller.applications.publish({ id: seeded.id });
    const released = await server.inject({
      url: `/api/applications/${seeded.id}/released-document`
    });
    expect(released.json()).toEqual(
      await caller.applications.releasedDocument({ id: seeded.id })
    );
  });

  it("hides another user's app", async () => {
    const seeded = await seedApp("someone-else");
    const response = await server.inject({
      url: `/api/applications/${seeded.id}`
    });
    expect(response.statusCode).toBe(404);
  });
});
