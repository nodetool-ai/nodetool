import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  ModelObserver,
  Workflow,
  claimAppRun,
  createAppInstance,
  getRawDb,
  initTestDb,
  listAppRuns,
  reserveAppRun,
  setApplicationBudget,
  settleAppRun
} from "@nodetool-ai/models";
import {
  appInstanceResponse,
  appRunResponse,
  type AppRunSnapshot
} from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import appRunsRoutes from "../src/routes/app-runs.js";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);
function context(userId: string | null): Context {
  return {
    userId,
    registry: {} as never,
    apiOptions: {} as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  };
}
function snapshot(): AppRunSnapshot {
  return {
    document: {
      ...createEmptyDocument(),
      operations: [
        {
          id: "op",
          name: "Run",
          workflowId: "wf",
          inputs: {},
          outputs: {},
          policy: "parallel"
        }
      ]
    },
    workflow_graphs: { wf: { nodes: [], edges: [] } },
    script_documents: {}
  };
}
const createInput = () => ({
  source_id: "example:test",
  snapshot: snapshot(),
  variables: { x: 1 }
});
let server: FastifyInstance;

beforeEach(async () => {
  initTestDb();
  server = Fastify();
  server.removeAllContentTypeParsers();
  server.addContentTypeParser(
    "*",
    { parseAs: "buffer" },
    (_req, body, done) => {
      done(null, body);
    }
  );
  server.addHook("onRequest", async (request) => {
    const user = request.headers["x-test-user"];
    request.userId = typeof user === "string" ? user : undefined;
    if (request.headers["x-test-visitor"] === "1") {
      request.appSession = { applicationId: "visitor-app", version: 1 };
    }
  });
  await server.register(appRunsRoutes);
});
afterEach(async () => {
  await server.close();
  ModelObserver.clear();
});
const ownerHeaders = { "x-test-user": "u1" };
async function createThroughRest() {
  const result = await server.inject({
    method: "POST",
    url: "/api/app-instances",
    headers: ownerHeaders,
    payload: createInput()
  });
  expect(result.statusCode).toBe(200);
  return appInstanceResponse.parse(result.json());
}

describe("phase 1 durable app REST and tRPC boundaries", () => {
  it("returns identical durable records through REST and tRPC with compact ids", async () => {
    const instance = await createThroughRest();
    const caller = createCaller(context("u1"));
    expect(
      await caller.appInstances.get({ id: instance.id.slice(0, 12) })
    ).toEqual(instance);
    const reservation = await server.inject({
      method: "POST",
      url: `/api/app-instances/${instance.id.slice(0, 12)}/runs`,
      headers: ownerHeaders,
      payload: {
        operation_id: "op",
        invocation_id: "operation-1",
        origin: "public"
      }
    });
    expect(reservation.statusCode).toBe(200);
    const run = appRunResponse.parse(reservation.json());
    expect(run.origin).toBe("ui");
    expect(run.instance_id).toBe(instance.id);
    expect(await caller.appRuns.get({ id: run.id.slice(0, 12) })).toEqual(run);
    const rest = await server.inject({
      method: "GET",
      url: `/api/app-runs/${run.id.slice(0, 12)}`,
      headers: ownerHeaders
    });
    expect(appRunResponse.parse(rest.json())).toEqual(run);
    expect(
      await caller.appRuns.list({ instance_id: instance.id, limit: 50 })
    ).toEqual([run]);
  });
  it("reloads a default beyond the recent page before resolving live workflow targets", async () => {
    const caller = createCaller(context("u1"));
    const input = createInput();
    const initial = await caller.appInstances.ensureDefault(input);
    for (let index = 0; index < 101; index++) {
      await createAppInstance({
        userId: "u1",
        sourceId: input.source_id,
        snapshot: input.snapshot
      });
    }
    getRawDb()
      .prepare("UPDATE app_instances SET updated_at='2000-01-01' WHERE id=?")
      .run(initial.id);
    // A changed source no longer resolves; reloading keeps the existing frozen default.
    input.snapshot.workflow_graphs = {};
    expect(await caller.appInstances.ensureDefault(input)).toEqual({
      ...initial,
      updated_at: "2000-01-01"
    });
  });
  it("preserves variable output mappings when validating inline snapshot unions", async () => {
    const input = createInput();
    input.snapshot.document.operations[0]!.outputs = {
      answer: { to: "variable", variableId: "x" }
    };
    const created = await server.inject({
      method: "POST",
      url: "/api/app-instances/default",
      headers: ownerHeaders,
      payload: input
    });
    expect(created.statusCode).toBe(200);
    const instance = appInstanceResponse.parse(created.json());
    expect(instance.snapshot.document.operations[0]!.outputs).toEqual({
      answer: { to: "variable", variableId: "x" }
    });
    const reserved = await server.inject({
      method: "POST",
      url: `/api/app-instances/${instance.id}/runs`,
      headers: ownerHeaders,
      payload: { operation_id: "op", invocation_id: "union-snapshot" }
    });
    expect(reserved.statusCode).toBe(200);
    expect(
      appRunResponse.parse(reserved.json()).snapshot?.document.operations[0]!
        .outputs
    ).toEqual({
      answer: { to: "variable", variableId: "x" }
    });
  });
  it("keeps owner reads isolated and refuses unauthenticated and visitor sessions", async () => {
    const instance = await createThroughRest();
    const run = await createCaller(context("u1")).appRuns.reserve({
      instance_id: instance.id,
      operation_id: "op",
      invocation_id: "owned"
    });
    for (const url of [
      `/api/app-instances/${instance.id}`,
      `/api/app-runs/${run.id}`
    ]) {
      const foreign = await server.inject({
        method: "GET",
        url,
        headers: { "x-test-user": "u2" }
      });
      expect(foreign.statusCode).toBe(404);
      expect((await server.inject({ method: "GET", url })).statusCode).toBe(
        401
      );
      expect(
        (
          await server.inject({
            method: "GET",
            url,
            headers: { ...ownerHeaders, "x-test-visitor": "1" }
          })
        ).statusCode
      ).toBe(401);
    }
    await expect(
      createCaller(context("u2")).appRuns.get({ id: run.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createCaller(context(null)).appInstances.get({ id: instance.id })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(
      await createCaller(context("u2")).appInstances.list({ limit: 50 })
    ).toEqual([]);
  });
  it("enforces optimistic state revisions and isolates duplicated instance history", async () => {
    const instance = await createThroughRest();
    const url = `/api/app-instances/${instance.id}`;
    const updated = await server.inject({
      method: "PATCH",
      url,
      headers: ownerHeaders,
      payload: { expected_revision: 0, variables: { x: 2 } }
    });
    expect(updated.statusCode).toBe(200);
    expect(appInstanceResponse.parse(updated.json()).revision).toBe(1);
    const stale = await server.inject({
      method: "PATCH",
      url,
      headers: ownerHeaders,
      payload: { expected_revision: 0, variables: { x: 3 } }
    });
    expect(stale.statusCode).toBe(409);
    const caller = createCaller(context("u1"));
    await caller.appRuns.reserve({
      instance_id: instance.id,
      operation_id: "op",
      invocation_id: "first"
    });
    const copy = await caller.appInstances.duplicate({
      id: instance.id,
      name: "Copy"
    });
    expect(copy.variables).toEqual({ x: 2 });
    expect(copy.id).not.toBe(instance.id);
    expect(
      await caller.appRuns.list({ instance_id: copy.id, limit: 50 })
    ).toEqual([]);
    expect(
      (await caller.appInstances.get({ id: instance.id })).variables
    ).toEqual({ x: 2 });
  });
  it("makes repeated reserve requests idempotent and disallows forged provider costs", async () => {
    const instance = await createThroughRest();
    const caller = createCaller(context("u1"));
    const input = {
      instance_id: instance.id,
      operation_id: "op",
      invocation_id: "retry"
    };
    const [first, second] = await Promise.all([
      caller.appRuns.reserve(input),
      caller.appRuns.reserve(input)
    ]);
    expect(first.id).toBe(second.id);
    expect(await listAppRuns("u1", instance.id)).toHaveLength(1);
    const invalidCostInput = {
      id: first.id,
      status: "completed" as const,
      actual_usd: 0
    };
    await expect(caller.appRuns.update(invalidCostInput)).rejects.toMatchObject(
      { code: "BAD_REQUEST" }
    );
    const forged = await server.inject({
      method: "PATCH",
      url: `/api/app-runs/${first.id}`,
      headers: ownerHeaders,
      payload: { status: "completed", actual_usd: 0 }
    });
    expect(forged.statusCode).toBe(400);
    const settled = await caller.appRuns.get({ id: first.id });
    expect(settled.status).toBe("running");
    expect(settled.actual_usd).toBeNull();
    expect(settled.estimated_usd).toBe(first.estimated_usd);
  });
  it("prevents a browser from settling execution claimed by its server host", async () => {
    const instance = await createThroughRest();
    const caller = createCaller(context("u1"));
    const run = await caller.appRuns.reserve({
      instance_id: instance.id,
      operation_id: "op",
      invocation_id: "claimed"
    });
    expect(await claimAppRun("u1", run.id)).toBe(true);
    const patch = await server.inject({
      method: "PATCH",
      url: `/api/app-runs/${run.id}`,
      headers: ownerHeaders,
      payload: { status: "completed", outputs: { x: 9 } }
    });
    expect(patch.statusCode).toBe(409);
    await expect(
      caller.appRuns.update({ id: run.id, status: "failed" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await caller.appRuns.get({ id: run.id })).status).toBe("running");
    expect(
      (await caller.appInstances.get({ id: instance.id })).variables
    ).toEqual({ x: 1 });
  });
  it("freezes owner draft workflow targets without publishing and rejects foreign saved apps", async () => {
    const document = snapshot().document;
    await Workflow.create<Workflow>({
      id: "wf",
      user_id: "u1",
      graph: { nodes: [], edges: [] }
    });
    const app = await Application.create<Application>({
      user_id: "u1",
      document: JSON.stringify(document)
    });
    const caller = createCaller(context("u1"));
    const instance = await caller.appInstances.create({
      application_id: app.id,
      source_id: app.id,
      snapshot: { document, workflow_graphs: {}, script_documents: {} }
    });
    expect(instance.version).toBeNull();
    expect(instance.snapshot.workflow_graphs.wf).toEqual({
      nodes: [],
      edges: []
    });
    expect(
      getRawDb().prepare("SELECT count(*) n FROM application_versions").get()
    ).toEqual({ n: 0 });
    await expect(
      createCaller(context("u2")).appInstances.create({
        application_id: app.id,
        source_id: app.id,
        snapshot: { document, workflow_graphs: {}, script_documents: {} }
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("accepts owner application prefixes when creating and finding a default", async () => {
    const app = await Application.create<Application>({
      user_id: "u1",
      document: JSON.stringify(createEmptyDocument())
    });
    const caller = createCaller(context("u1"));
    const input = {
      application_id: app.id.slice(0, 12),
      source_id: app.id,
      snapshot: {
        document: createEmptyDocument(),
        workflow_graphs: {},
        script_documents: {}
      }
    };
    const initial = await caller.appInstances.ensureDefault(input);
    expect(initial.application_id).toBe(app.id);
    expect((await caller.appInstances.ensureDefault(input)).id).toBe(
      initial.id
    );
    expect(
      (
        await caller.appInstances.list({ application_id: input.application_id })
      ).map((instance) => instance.id)
    ).toEqual([initial.id]);
    await expect(
      createCaller(context("u2")).appInstances.ensureDefault(input)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("returns bounded public run metadata with no visitor inputs, outputs or owner state changes", async () => {
    const app = await Application.create<Application>({
      user_id: "u1",
      document: JSON.stringify(snapshot().document)
    });
    await setApplicationBudget(app.id, { maxInvocations: 10 });
    const instance = await createCaller(context("u1")).appInstances.create({
      ...createInput(),
      application_id: app.id
    });
    const result = await reserveAppRun({
      userId: "u1",
      instanceId: instance.id,
      operationId: "op",
      invocationId: "visitor",
      origin: "public",
      requireFiniteBudget: true,
      inputs: { prompt: "visitor-private" }
    });
    if (!result.allowed) throw new Error(result.reason);
    await settleAppRun("u1", result.run.id, {
      status: "failed",
      outputs: { x: "visitor-private" },
      error: "visitor-private failure"
    });
    const response = await server.inject({
      method: "GET",
      url: `/api/app-runs/${result.run.id}`,
      headers: ownerHeaders
    });
    const run = appRunResponse.parse(response.json());
    expect(run.snapshot).toBeNull();
    expect(run.inputs).toBeNull();
    expect(run.outputs).toBeNull();
    expect(run.error).toBe("Error");
    expect(response.body).not.toContain("visitor-private");
    expect(
      (await createCaller(context("u1")).appInstances.get({ id: instance.id }))
        .variables
    ).toEqual({ x: 1 });
  });
});
