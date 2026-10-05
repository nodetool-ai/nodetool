import Fastify, { type FastifyInstance } from "fastify";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  initTestDb, createAppInstance, getAppRun, getAppInstance, listRunTraceRecords, claimAppRun, sweepInterruptedAppRuns, settleAppRun, resolveRunReader
} from "@nodetool-ai/models";
import { registerContextRunTrace } from "@nodetool-ai/execution";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import { BROWSER_TRACE_SOURCE_KEY } from "@nodetool-ai/protocol";
import type { AppRunRecord } from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import runSpansRoutes from "../src/routes/run-spans.js";
import { patchOwnedAppRun, reserveOwnedAppRun } from "../src/lib/app-instances-service.js";
import { createTestUiRunRoutes } from "../src/lib/test-ui-run-routes.js";

const OWNER = "browser-app-owner";
let server: FastifyInstance;
let run: AppRunRecord;
const parentId = "9".repeat(16);
const snapshot = () => ({ document: { ...createEmptyDocument(), operations: [{ id: "op", name: "Browser operation", workflowId: "wf", inputs: {}, outputs: {}, policy: "parallel" as const }] }, workflow_graphs: { wf: { nodes: [], edges: [] } }, script_documents: {} });
beforeEach(async () => {
  initTestDb();
  const instance = await createAppInstance({ userId: OWNER, sourceId: "example:browser-start", snapshot: snapshot() });
  run = await reserveOwnedAppRun(OWNER, { instance_id: instance.id, operation_id: "op", invocation_id: "browser-invocation" });
  server = Fastify();
  server.addHook("onRequest", async (request) => {
    request.userId = typeof request.headers["x-user"] === "string" ? request.headers["x-user"] : undefined;
    if (request.headers["x-visitor"]) { request.appSession = { applicationId: "visitor", version: 1 }; }
  });
  await server.register(runSpansRoutes);
});
afterEach(async () => { await server.close(); });
function start(options: { traceId?: string; parentId?: string; user?: string; visitor?: boolean } = {}) {
  return server.inject({ method: "POST", url: `/api/runs/${run.id}/browser-start`, headers: { "x-user": options.user ?? OWNER, ...(options.visitor ? { "x-visitor": "1" } : {}) }, payload: { traceparent: `00-${options.traceId ?? run.trace_id}-${options.parentId ?? parentId}-01` } });
}

describe("phase 4 browser app run root lifecycle", () => {
  it("suppresses running server app content before late secrets resolve, then redacts after the host settles", async () => {
    const secret = "late resolved provider token 27495";
    const context = new ProcessingContext({ userId: OWNER, secretResolver: () => secret });
    const registration = await resolveRunReader(OWNER, run.id);
    if (!registration) { throw new Error("App trace fixture missing"); }
    await registerContextRunTrace(context, { kind: "app", id: run.id, sourceId: run.id, traceId: run.trace_id, origin: "ui", parents: registration.parents });
    const time = Date.now();
    const record = { trace_id: run.trace_id, span_id: "3".repeat(16), parent_span_id: null, name: "ui.resolve_params", kind: "INTERNAL", start_time_ms: time, end_time_ms: time, duration_ms: 0, status: { code: "OK" }, attributes: { "ui.resolved.value": secret }, events: [], resource: { [BROWSER_TRACE_SOURCE_KEY]: "browser" } };
    const post = () => server.inject({ method: "POST", url: `/api/runs/${run.id}/spans`, headers: { "x-user": OWNER }, payload: { records: [record] } });
    expect((await post()).statusCode).toBe(200);
    const active = await listRunTraceRecords(OWNER, run.id);
    expect(JSON.stringify(active)).not.toContain(secret);
    expect(active.records[0]?.record.attributes["nodetool.trace.content_suppressed"]).toBe(true);
    await context.getSecret("late-provider-key");
    await settleAppRun(OWNER, run.id, { status: "completed" });
    record.span_id = "4".repeat(16);
    expect((await post()).statusCode).toBe(200);
    const ended = await listRunTraceRecords(OWNER, run.id);
    expect(JSON.stringify(ended)).not.toContain(secret);
    const preview = ended.records.find((span) => span.record.span_id === record.span_id)?.record;
    expect(preview?.attributes["ui.resolved.value"]).toContain("REDACTED");
    expect(preview?.attributes["nodetool.trace.content_suppressed"]).toBeUndefined();
  });
  it("claims once and closes the persisted server root on a later owner outcome", async () => {
    await patchOwnedAppRun(OWNER, { id: run.id, inputs: { prompt: "Browser input" } });
    const response = await start(); expect(response.statusCode).toBe(200);
    const rootId = response.json<{ root_span_id: string }>().root_span_id;
    expect(rootId).toMatch(/^[0-9a-f]{16}$/); expect(rootId).not.toBe(parentId);
    expect((await getAppRun(OWNER, run.id))?.root_span_id).toBe(rootId);
    const [started] = (await listRunTraceRecords(OWNER, run.id)).records;
    expect(started?.kind).toBe("span_started"); expect(started?.record.name).toBe("app.run");
    expect(started?.record.parent_span_id).toBe(parentId); expect(started?.record.resource[BROWSER_TRACE_SOURCE_KEY]).toBe("server");
    expect((await start()).json()).toEqual({ root_span_id: rootId });
    expect((await listRunTraceRecords(OWNER, run.id)).records).toHaveLength(1);
    expect(await sweepInterruptedAppRuns(new Date(Date.now() + 1_000).toISOString(), null)).toBe(0);
    const finished = await patchOwnedAppRun(OWNER, { id: run.id, status: "completed", outputs: { result: "done" } });
    expect(finished?.status).toBe("completed");
    expect((await getAppInstance(OWNER, run.instance_id))?.variables).toMatchObject({ result: "done" });
    const [ended] = (await listRunTraceRecords(OWNER, run.id)).records;
    expect(ended?.kind).toBe("span_ended"); expect(ended?.record.status.code).toBe("OK");
    expect(ended?.record.end_time_ms).toBeGreaterThanOrEqual(ended?.record.start_time_ms ?? 0);
  });
  it("keeps input and outcome ownership for server-claimed work", async () => {
    expect(await claimAppRun(OWNER, run.id, "server-worker")).toBe(true);
    expect((await start()).statusCode).toBe(400);
    await expect(patchOwnedAppRun(OWNER, { id: run.id, status: "completed", outputs: { injected: "not allowed" } })).rejects.toThrow("execution host owns");
    await expect(patchOwnedAppRun(OWNER, { id: run.id, inputs: { injected: "not allowed" } })).rejects.toThrow("execution host owns");
    expect((await getAppRun(OWNER, run.id))?.status).toBe("running");
  });
  it("refuses foreign owners, visitors, zero ancestry and trace mismatches before claiming", async () => {
    expect((await start({ user: "foreign" })).statusCode).toBe(404);
    expect((await start({ visitor: true })).statusCode).toBe(401);
    expect((await start({ parentId: "0".repeat(16) })).statusCode).toBe(400);
    expect((await start({ traceId: "a".repeat(32) })).statusCode).toBe(400);
    expect((await getAppRun(OWNER, run.id))?.execution_started_at).toBeNull();
    expect((await listRunTraceRecords(OWNER, run.id)).records).toHaveLength(0);
  });
});

describe("phase 4 native UI harness owner-route bridge", () => {
  let native: Server | undefined;
  let bridge: ReturnType<typeof createTestUiRunRoutes> | undefined;
  afterEach(async () => {
    if (native) { await new Promise<void>((resolve, reject) => native?.close((error) => error ? reject(error) : resolve())); }
    await bridge?.close();
  });
  it("drives reservation, browser root, span ingest and terminal outcome through real HTTP", async () => {
    bridge = createTestUiRunRoutes();
    const handler = bridge;
    native = createServer((request, response) => { void handler.handle(request, response); });
    await new Promise<void>((resolve) => native?.listen(0, "127.0.0.1", resolve));
    const address = native.address(); if (!address || typeof address === "string") { throw new Error("HTTP fixture address missing"); }
    const base = `http://127.0.0.1:${address.port}`;
    const request = (path: string, body: unknown, method = "POST", headers: Record<string, string> = {}) => fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    const created = await request("/api/app-instances", { source_id: "example:http-browser", snapshot: snapshot() });
    expect(created.status).toBe(200); const instance: { id: string } = await created.json();
    const reserved = await request(`/api/app-instances/${instance.id}/runs`, { operation_id: "op", invocation_id: "http-invocation" });
    expect(reserved.status).toBe(200); const appRun: { id: string; trace_id: string } = await reserved.json();
    const startBody = { traceparent: `00-${appRun.trace_id}-${parentId}-01` };
    expect((await request(`/api/runs/${appRun.id}/browser-start`, startBody, "POST", { authorization: "Bearer nda_fixture" })).status).toBe(401);
    expect((await request(`/api/runs/${appRun.id}/browser-start`, startBody)).status).toBe(200);
    const time = Date.now();
    expect((await request(`/api/runs/${appRun.id}/spans`, { records: [{ trace_id: appRun.trace_id, span_id: parentId, parent_span_id: null, name: "ui.action", kind: "INTERNAL", start_time_ms: time, end_time_ms: time, duration_ms: 0, status: { code: "OK" }, attributes: { "ui.resolved.value": "Browser preview retained" }, events: [], resource: { [BROWSER_TRACE_SOURCE_KEY]: "browser" } }] })).status).toBe(200);
    expect((await request(`/api/app-runs/${appRun.id}`, { status: "completed", outputs: { result: "http done" } }, "PATCH")).status).toBe(200);
    const trace = await listRunTraceRecords("1", appRun.id);
    expect(trace.records).toHaveLength(2);
    const appRoot = trace.records.find((span) => span.record.name === "app.run");
    expect(appRoot?.record.parent_span_id).toBe(parentId); expect(appRoot?.kind).toBe("span_ended");
    expect(trace.records.find((span) => span.record.name === "ui.action")?.record.attributes["ui.resolved.value"]).toBe("Browser preview retained");
  });
});
