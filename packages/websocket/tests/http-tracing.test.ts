/**
 * HTTP server spans: one per request, active for the handler, continuing an
 * incoming `traceparent`, and skipped for health probes.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify, { type FastifyInstance } from "fastify";
import {
  initTelemetry,
  shutdownTelemetry,
  withSpan,
  type TraceRecord
} from "@nodetool-ai/runtime";
import { registerHttpTracing } from "../src/lib/http-tracing.js";

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const PARENT_SPAN_ID = "00f067aa0ba902b7";

let traceDir: string;
let traceFile: string;
let app: FastifyInstance;

async function readRecords(
  ready: (records: TraceRecord[]) => boolean
): Promise<TraceRecord[]> {
  const deadline = Date.now() + 3000;
  let records: TraceRecord[] = [];
  while (Date.now() < deadline) {
    const text = await readFile(traceFile, "utf8").catch(() => "");
    records = text
      .split("\n")
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
  registerHttpTracing(app);
  app.get("/items/:id", async () =>
    withSpan("handler.work", {}, async () => ({ ok: true }))
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

describe("registerHttpTracing", () => {
  it("wraps the handler in a server span that continues the caller's trace", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/items/42?secret=x",
      headers: { traceparent: `00-${TRACE_ID}-${PARENT_SPAN_ID}-01` }
    });
    expect(response.statusCode).toBe(200);

    const records = await readRecords((r) =>
      r.some((x) => x.name === "GET /items/:id")
    );
    const server = records.find((r) => r.name === "GET /items/:id");
    const work = records.find((r) => r.name === "handler.work");
    expect(server?.kind).toBe("SERVER");
    expect(server?.trace_id).toBe(TRACE_ID);
    expect(server?.parent_span_id).toBe(PARENT_SPAN_ID);
    expect(server?.attributes["http.route"]).toBe("/items/:id");
    expect(server?.attributes["url.path"]).toBe("/items/42");
    expect(server?.attributes["http.response.status_code"]).toBe(200);
    expect(work?.parent_span_id).toBe(server?.span_id);
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
