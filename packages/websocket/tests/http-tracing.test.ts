/**
 * HTTP server spans: one per request, active for the handler, continuing an
 * validated run ancestry separately, and skipped for health probes.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify, { type FastifyInstance } from "fastify";
import {
  initTelemetry,
  shutdownTelemetry,
  withSpan,
  type TraceRecord
} from "@nodetool-ai/runtime";
import { registerHttpTracing, acceptedRunTraceParent } from "../src/lib/http-tracing.js";

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const PARENT_SPAN_ID = "00f067aa0ba902b7";

let traceDir: string;
let traceFile: string;
let app: FastifyInstance;

async function readRecords(
  ready: (records: TraceRecord[]) => boolean,
  file = traceFile
): Promise<TraceRecord[]> {
  const deadline = Date.now() + 3000;
  let records: TraceRecord[] = [];
  while (Date.now() < deadline) {
    const text = await readFile(file, "utf8").catch(() => "");
    records = text
      .split("\n")
      .slice(0, -1)
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as TraceRecord);
    if (ready(records)) return records;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return records;
}

beforeAll(async () => {
  traceDir = await mkdtemp(join(tmpdir(), "nodetool-http-tracing-"));
  traceFile = join(traceDir, "trace.jsonl");
  await initTelemetry({ traceFile, silent: true });
  app = Fastify();
  app.addHook("onRequest", (request, _reply, done) => { request.headers["x-auth-ready"] = "yes"; done(); });
  registerHttpTracing(app, { authorizeTraceParent: async (request) => request.headers["x-auth-ready"] === "yes" && request.headers["x-owner"] === "owner" && request.headers["x-visitor"] !== "yes" });
  app.get("/items/:id", async (request) =>
    withSpan("script.run", {}, async () => ({ ok: true, accepted: acceptedRunTraceParent(request)?.traceId }))
  );
  app.get("/boom", async () => {
    throw new Error("boom");
  });
  app.get("/health", async () => ({ ok: true }));
  await app.ready();
}, 30000);

afterAll(async () => {
  await app.close();
  await shutdownTelemetry();
  await rm(traceDir, { recursive: true, force: true });
}, 30000);

describe("trace JSONL reader", () => {
  it("reads completed records while the writer has an unfinished trailing record", async () => {
    const file = join(traceDir, "incomplete-tail.jsonl");
    const completed: TraceRecord = {
      trace_id: TRACE_ID,
      span_id: PARENT_SPAN_ID,
      parent_span_id: null,
      name: "completed request",
      kind: "SERVER",
      start_time_ms: 1,
      end_time_ms: 2,
      duration_ms: 1,
      status: { code: "UNSET" },
      attributes: {},
      events: [],
      resource: {}
    };
    await writeFile(file, `${JSON.stringify(completed)}\n{\"name\":`, "utf8");

    await expect(readRecords((records) => records.length === 1, file))
      .resolves.toEqual([completed]);
  });

  it("rejects malformed records that have a completed newline delimiter", async () => {
    const file = join(traceDir, "malformed-record.jsonl");
    await writeFile(file, "{\"name\":\n", "utf8");

    await expect(readRecords(() => true, file)).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe("registerHttpTracing", () => {
  it("reserves authorized ancestry for the run root while HTTP spans stay separate", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/items/42?secret=x",
      headers: { traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`, "x-owner": "owner" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().accepted).toBe(TRACE_ID);

    const records = await readRecords((r) =>
      r.some((x) => x.name === "GET /items/:id")
    );
    const server = records.find((r) => r.name === "GET /items/:id");
    const work = records.find((r) => r.name === "script.run");
    expect(server?.kind).toBe("SERVER");
    expect(server?.trace_id).not.toBe(TRACE_ID);
    expect(server?.parent_span_id).toBeNull();
    expect(server?.attributes["http.route"]).toBe("/items/:id");
    expect(server?.attributes["url.path"]).toBeUndefined();
    expect(server?.attributes["http.response.status_code"]).toBe(200);
    expect(work?.parent_span_id).toBe(server?.span_id);
  });

  it("rejects foreign, visitor, and malformed ancestry after authentication", async () => {
    for (const headers of [
      { traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`, "x-owner": "foreign" },
      { traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01`, "x-owner": "owner", "x-visitor": "yes" },
      { traceparent: "malformed", "x-owner": "owner" }
    ]) {
      const response = await app.inject({ method: "GET", url: "/items/rejected", headers });
      expect(response.statusCode).toBe(200);
      expect(response.json().accepted).toBeUndefined();
    }
  });

  it("marks a 5xx response as an error and records the exception", async () => {
    const response = await app.inject({ method: "GET", url: "/boom" });
    expect(response.statusCode).toBe(500);

    const records = await readRecords((r) =>
      r.some((x) => x.name === "GET /boom")
    );
    const server = records.find((r) => r.name === "GET /boom");
    expect(server?.status.code).toBe("ERROR");
    expect(server?.attributes["error.type"]).toBe("500");
    expect(server?.events.some((e) => e.name === "exception")).toBe(true);
  });

  it("does not trace health probes", async () => {
    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/items/7" });

    const records = await readRecords(
      (r) => r.filter((x) => x.name === "GET /items/:id").length >= 2
    );
    expect(records.some((r) => r.name.includes("/health"))).toBe(false);
  });
});
