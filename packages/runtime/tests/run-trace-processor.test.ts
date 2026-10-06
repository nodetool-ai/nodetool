import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { createLogger, redactTraceText } from "@nodetool-ai/config";
import { splitTraceRecord, type RunTraceRegistration, type TraceRecord } from "@nodetool-ai/protocol";
import { initTelemetry, getTracer, flushTelemetry, shutdownTelemetry, _resetTelemetryForTest } from "../src/telemetry.js";
import { withSpan } from "../src/tracing-helpers.js";
import { withRunTrace, recordRunTraceSecret, recordTraceEvent, type RunTraceScope } from "../src/run-trace-context.js";
import { ProcessingContext } from "../src/context.js";
import { configureRunTraceStore, ContentFilteringSpanExporter, RunTraceSpanProcessor, type RunTraceStore, type RunTraceWrite } from "../src/run-trace-processor.js";
import { ConsoleSpanExporter, type ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { StdoutSpanExporter } from "../src/trace-exporters.js";

const registrations = new Map<string, RunTraceRegistration>();
const records = new Map<string, RunTraceWrite>();
const incomplete: string[] = [];
let failWrites = false;
const adapter: RunTraceStore = {
  async lookup(id) { return registrations.get(id) ?? null; },
  async write(updates) {
    if (failWrites) { throw new Error("private database failure"); }
    for (const update of updates) { records.set(update.update.record.span_id, update); }
  },
  async markIncomplete(id) { incomplete.push(id); },
  async flush() {},
  sanitize(record, options) {
    const clean = JSON.parse(JSON.stringify(record, (_key, value: unknown) => typeof value === "string" ? redactTraceText(value, options.secretValues) : value)) as TraceRecord;
    return options.public || options.contentSuppressed ? splitTraceRecord(clean).record : clean;
  }
};

function scope(id: string, origin: RunTraceScope["origin"] = "ui"): RunTraceScope {
  const traceId = id.repeat(32);
  registrations.set(traceId, { id: id.repeat(32), user_id: "owner", kind: "app", source_id: "app", parent_run_id: null, trace_id: traceId, root_span_id: null, origin, status: "running", started_at: "2026-10-04", ended_at: null, cost_usd: null, error: null, content_expired: 0, truncated: 0, incomplete: 0, parents: [] });
  return { userId: "owner", runId: id.repeat(32), traceId, origin, secretValues: new Set(["resolved-oauth-secret-value"]), policy: { contentSuppressed: false } };
}

beforeAll(async () => {
  _resetTelemetryForTest();
  for (const name of ["TRACELOOP_API_KEY", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "OTEL_TRACES_EXPORTER", "NODETOOL_TRACE_FILE", "NODETOOL_TRACE_STDOUT", "NODETOOL_TRACE_INCLUDE_CONTENT"]) { vi.stubEnv(name, ""); }
  await initTelemetry({ silent: true });
  configureRunTraceStore(adapter);
}, 30_000);
beforeEach(() => { registrations.clear(); records.clear(); incomplete.length = 0; failWrites = false; });
afterAll(async () => { await shutdownTelemetry(); _resetTelemetryForTest(); vi.unstubAllEnvs(); }, 30_000);

describe("always-on durable run processor", () => {
  it("stores nested registered spans without any external sink and excludes unrelated requests", async () => {
    const run = scope("a");
    await withSpan("GET", {}, async () => withRunTrace(run, () => withSpan("app.run", {}, async () => {
      await withSpan("script.run", {}, async () => withSpan("capability.call", {}, async () => withSpan("llm.chat test/model", { "llm.response.content": "private reply" }, async () => {})));
    })));
    await flushTelemetry();
    expect(records.size).toBe(4);
    const tree = [...records.values()].map((item) => item.update.record);
    const root = tree.find((item) => item.name === "app.run");
    expect(root?.parent_span_id).toBeNull();
    expect(root?.trace_id).toBe(run.traceId);
    expect(new Set(tree.map((item) => item.trace_id))).toEqual(new Set([run.traceId]));
    expect(tree.find((item) => item.name === "script.run")?.parent_span_id).toBe(root?.span_id);
    expect(tree.find((item) => item.name.startsWith("llm.chat"))?.attributes["llm.response.content"]).toBe("private reply");
    expect([...records.values()].filter((item) => item.isRoot)).toHaveLength(1);
  });

  it("continues an explicitly supplied same-owner parent without a phantom root", async () => {
    const run = scope("b");
    const parent = { traceId: run.traceId, spanId: "c".repeat(16), traceFlags: 1, isRemote: true };
    await withRunTrace({ ...run, parentSpanContext: parent }, () => withSpan("app.run", {}, async () => {}));
    await flushTelemetry();
    expect([...records.values()][0].update.record.parent_span_id).toBe(parent.spanId);
    expect(records.size).toBe(1);
  });

  it("retains a child run's identity when canonical lookup returns the app root", async () => {
    const root = scope("4");
    const child = { ...root, runId: "5".repeat(32) };
    await withRunTrace(root, () => withSpan("app.run", {}, async () => {
      await withRunTrace(child, () => withSpan("workflow.run", {}, async () => {}));
    }));
    await flushTelemetry();
    expect([...records.values()].find((item) => item.update.record.name === "workflow.run")?.runId).toBe(child.runId);
    expect([...records.values()].find((item) => item.update.record.name === "app.run")?.runId).toBe(root.runId);
  });

  it("records explicit-span events outside a yielded async scope", async () => {
    let span: ReturnType<typeof trace.getSpan>;
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const running = withRunTrace(scope("6"), () => withSpan("app.run", {}, async (active) => {
      span = active ?? undefined;
      await waiting;
    }));
    recordTraceEvent("agent.activity", { "log.message": "stored after yield" }, span);
    release?.();
    await running;
    await flushTelemetry();
    expect([...records.values()][0].update.record.events[0].attributes?.["log.message"]).toBe("stored after yield");
  });

  it("shares child-resolved secrets across fresh contexts and copied contexts", async () => {
    const run = scope("7");
    await withRunTrace(run, async () => {
      const fresh = new ProcessingContext({ userId: "owner", secretResolver: () => "child-provider-private-secret" });
      await fresh.getSecret("provider_key");
      const copy = fresh.copy();
      expect(copy.runTraceContext).toBe(run);
      expect(run.secretValues.has("child-provider-private-secret")).toBe(true);
      expect(copy.getResolvedSecretValues()).toBe(run.secretValues);
    });
  });

  it("masks short secrets resolved before the trace handle is assigned", async () => {
    const early = new ProcessingContext({ userId: "owner", secretResolver: () => "tiny" });
    await early.getSecret("password");
    const run = { ...scope("0"), secretValues: early.getResolvedSecretValues() };
    early.runTraceContext = run;
    await withRunTrace(run, () => withSpan("app.run", { "llm.response.content": "The credential is tiny" }, async () => {}));
    await flushTelemetry();
    expect(run.secretValues.has("tiny")).toBe(true);
    expect([...records.values()][0].update.record.attributes["llm.response.content"]).toBe("The credential is [REDACTED:secret]");
  });

  it("masks short provider credentials resolved through the run scope in logs and exceptions", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const run = scope("0");
    await expect(withRunTrace(run, () => withSpan("app.run", {}, async () => {
      recordRunTraceSecret("xy");
      recordRunTraceSecret("");
      recordRunTraceSecret(null);
      createLogger("test.provider").error("provider credential xy failed");
      throw new Error("provider credential xy failed");
    }))).rejects.toThrow("provider credential xy failed");
    await flushTelemetry();
    expect(run.secretValues.has("xy")).toBe(true);
    expect(run.secretValues.has("")).toBe(false);
    const content = JSON.stringify([...records.values()][0].update.record);
    expect(content).not.toContain("credential xy");
    expect(content).toContain("[REDACTED:secret]");
    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).not.toContain("credential xy");
    stderr.mockRestore();
  });

  it("spans the full generation lifetime including provider failure", async () => {
    await withRunTrace(scope("9"), () => withSpan("app.run", {}, async () => {
      const generationContext = new ProcessingContext({ userId: "owner" });
      await expect(generationContext.runGenerationWith({ id: "a".repeat(32), provider: "ephemeral", capability: "text_to_image", model: "test", params: {} }, async () => { throw new Error("provider failed"); }, { withoutProvider: true })).rejects.toThrow("provider failed");
    }));
    await flushTelemetry();
    const generation = [...records.values()].find((item) => item.update.record.name === "generation")?.update.record;
    expect(generation?.attributes["generation.id"]).toBe("a".repeat(32));
    expect(generation?.status.code).toBe("ERROR");
    expect(generation?.parent_span_id).toBe([...records.values()].find((item) => item.isRoot)?.update.record.span_id);
  });

  it("keeps concurrent identities and log events isolated and masks the run's resolved credentials", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const first = scope("d"); const second = scope("e");
    await Promise.all([first, second].map((run) => withRunTrace(run, () => withSpan("app.run", {}, async () => {
      await Promise.resolve();
      createLogger("test.run").info(`private ${run.runId}`, "resolved-oauth-secret-value");
      trace.getSpan(context.active())?.addEvent("exception", { "exception.message": "resolved-oauth-secret-value" });
    }))));
    await flushTelemetry();
    expect(records.size).toBe(2);
    for (const item of records.values()) {
      expect(item.update.record.events).toHaveLength(2);
      expect(new Set(item.update.record.events.map((event) => event.id)).size).toBe(2);
      expect(JSON.stringify(item.update.record)).not.toContain("resolved-oauth-secret-value");
      expect(item.userId).toBe("owner");
    }
    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).not.toContain("private");
    stderr.mockRestore();
  });

  it("excludes all public content even when the local override is enabled", async () => {
    vi.stubEnv("NODETOOL_TRACE_INCLUDE_CONTENT", "1");
    await withRunTrace(scope("f", "public"), () => withSpan("app.run", { "app.inputs": "visitor private input", "unknown": "visitor private value" }, async (span) => span?.addEvent("visitor private event", { body: "visitor private body" })));
    await flushTelemetry();
    expect(JSON.stringify([...records.values()])).not.toContain("visitor private");
    vi.stubEnv("NODETOOL_TRACE_INCLUDE_CONTENT", "");
  });

  it("preserves a visitor child's content policy when trace lookup returns an owner run", async () => {
    const owner = scope("f");
    await withRunTrace({ ...owner, runId: "e".repeat(32), origin: "public" }, () => withSpan("app.run", { "app.inputs": "visitor private input", "unknown": "visitor private value" }, async (span) => span?.addEvent("visitor private event", { body: "visitor private body" })));
    await flushTelemetry();
    expect(records.size).toBe(1);
    expect(JSON.stringify([...records.values()])).not.toContain("visitor private");
  });

  it("enforces the captured visitor policy in direct exporters after the async scope ends", async () => {
    vi.stubEnv("NODETOOL_TRACE_INCLUDE_CONTENT", "1");
    let ended: ReadableSpan | undefined;
    await withRunTrace(scope("f", "public"), () => withSpan("app.run", { "app.inputs": "visitor private input" }, async (span) => { ended = span as unknown as ReadableSpan; }));
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    if (!ended) { throw new Error("No test span"); }
    new StdoutSpanExporter("json").export([ended], () => {});
    expect(output.mock.calls.map((call) => String(call[0])).join("")).not.toContain("visitor private input");
    output.mockRestore();
    vi.stubEnv("NODETOOL_TRACE_INCLUDE_CONTENT", "");
    await flushTelemetry();
  });

  it("preserves an explicit returned-error status", async () => {
    await withRunTrace(scope("1"), () => withSpan("app.run", {}, async (span) => span?.setStatus({ code: SpanStatusCode.ERROR })));
    await flushTelemetry();
    expect([...records.values()][0].update.record.status.code).toBe("ERROR");
  });

  it("marks SDK event drops while preserving the final root status", async () => {
    await withRunTrace(scope("1"), () => withSpan("app.run", {}, async (span) => {
      for (let index = 0; index < 140; index++) { span?.addEvent("log", { "log.message": `event ${index}` }); }
    }));
    await flushTelemetry();
    const root = [...records.values()][0].update.record;
    expect(root.status.code).toBe("OK");
    expect(root.events).toHaveLength(128);
    expect(root.attributes["nodetool.trace.truncated"]).toBe(true);
    expect(root.attributes["nodetool.trace.dropped_events"]).toBe(12);
  });

  it("bounds sanitizer work for a burst while retaining events and final status", async () => {
    let sanitizedEvents = 0;
    configureRunTraceStore({ ...adapter, sanitize(record, options) {
      sanitizedEvents += record.events.length;
      return adapter.sanitize(record, options);
    } });
    try {
      await withRunTrace(scope("1"), () => withSpan("app.run", {}, async (span) => {
        for (let index = 0; index < 100; index++) {
          span?.addEvent("log", { "log.message": `event ${index} resolved-oauth-secret-value` });
        }
      }));
      await flushTelemetry();
      const root = [...records.values()][0].update.record;
      expect(root.status.code).toBe("OK");
      expect(root.events).toHaveLength(100);
      expect(new Set(root.events.map((event) => event.id)).size).toBe(100);
      expect(JSON.stringify(root)).not.toContain("resolved-oauth-secret-value");
      expect(sanitizedEvents).toBeLessThanOrEqual(400);
    } finally {
      configureRunTraceStore(adapter);
    }
  });

  it("reports oversized SDK content before sanitization removes its original length", async () => {
    await withRunTrace(scope("1"), () => withSpan("app.run", { "console.output": "word ".repeat(5_000) }, async () => {}));
    await flushTelemetry();
    const root = [...records.values()][0].update.record;
    expect(root.attributes["console.output"]).toHaveLength(20_000);
    expect(root.attributes["nodetool.trace.truncated"]).toBe(true);
  });

  it("bounds incomplete diagnostics while allowing flush to finish when storage stalls", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    let outstanding = 0;
    const resolvers: Array<() => void> = [];
    configureRunTraceStore({ ...adapter, markIncomplete: () => { outstanding++; return new Promise<void>((resolve) => { resolvers.push(() => { outstanding--; resolve(); }); }); } });
    const processor = new RunTraceSpanProcessor();
    const diagnostics = processor as unknown as { flagIncomplete(id: string, reason: "queue_overflow"): void };
    try {
      for (let index = 0; index < 2_000; index++) { diagnostics.flagIncomplete(index.toString(16).padStart(32, "0"), "queue_overflow"); }
      await Promise.resolve();
      expect(outstanding).toBeLessThanOrEqual(1);
      await expect(Promise.race([processor.forceFlush().then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_500))])).resolves.toBe(true);
    } finally {
      configureRunTraceStore(adapter);
      for (const resolve of resolvers) { resolve(); }
      stderr.mockRestore();
    }
  });

  it("passes actual SDK duration getters to the legacy console exporter", async () => {
    const output = vi.spyOn(console, "dir").mockImplementation(() => {});
    let ended: ReadableSpan | undefined;
    await withRunTrace(scope("1"), () => withSpan("app.run", {}, async (span) => { ended = span as unknown as ReadableSpan; }));
    if (!ended) { throw new Error("No test span"); }
    expect(Object.hasOwn(ended, "duration")).toBe(false);
    const exporter = new ContentFilteringSpanExporter(new ConsoleSpanExporter());
    expect(() => exporter.export([ended], () => {})).not.toThrow();
    const info = output.mock.calls[0][0];
    expect(info.duration).toBeGreaterThanOrEqual(0);
    output.mockRestore();
    await flushTelemetry();
  });

  it("omits numeric media bytes from both events and logger arguments", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await withRunTrace(scope("1"), () => withSpan("app.run", {}, async (span) => {
      recordTraceEvent("console", { "console.output": new Uint8Array([251, 252, 253]) }, span ?? undefined);
      recordTraceEvent("console", { "console.output": JSON.stringify(Buffer.from([245, 246, 247])) }, span ?? undefined);
      span?.addEvent("console", { "console.output": JSON.stringify(Buffer.from([239, 240, 241])) });
      createLogger("test.console").info(`guest output ${JSON.stringify(Buffer.from([242, 243, 244]))}`);
      createLogger("test.console").info("bytes", { media: Buffer.from([249, 250, 251]) });
    }));
    await flushTelemetry();
    const content = JSON.stringify([...records.values()][0].update.record.events.map((event) => event.attributes));
    expect(content).toContain("[media omitted]");
    for (const byte of [239, 240, 241, 242, 243, 244, 245, 246, 247, 249, 250, 251, 252, 253]) { expect(content).not.toContain(String(byte)); }
    stderr.mockRestore();
  });

  it("reports recording failure without leaking the storage error content", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    failWrites = true;
    await withRunTrace(scope("2"), () => withSpan("app.run", {}, async () => {}));
    await flushTelemetry();
    expect(incomplete).toContain("2".repeat(32));
    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).not.toContain("private database failure");
    stderr.mockRestore();
  });

  it("keeps final root status when the observer queue is exhausted", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const run = scope("8");
    await withRunTrace(run, () => withSpan("app.run", {}, async () => {
      const tracer = getTracer();
      for (let index = 0; index < 1_100; index++) { tracer?.startSpan("node.process", { attributes: { "node.id": String(index) } }).end(); }
    }));
    await flushTelemetry();
    expect(incomplete).toContain(run.traceId);
    expect([...records.values()].find((item) => item.update.record.name === "app.run")?.update.record.status.code).toBe("OK");
    expect(records.size).toBeLessThanOrEqual(1_000);
    stderr.mockRestore();
  });

  it("strips classified content before a legacy console or OTLP exporter sees a span", async () => {
    let exported: readonly ReadableSpan[] = [];
    const wrapped = new ContentFilteringSpanExporter({ export(spans, callback) { exported = spans; callback({ code: 0 }); }, async shutdown() {} });
    const tracer = getTracer();
    expect(tracer).not.toBeNull();
    let ended: ReadableSpan | undefined;
    await withRunTrace(scope("3"), () => withSpan("app.run", { "llm.request.messages": "private prompt", "new.content": "private value", "llm.provider": "test" }, async (span) => {
      span?.addEvent("exception", { "exception.message": "private error" });
      ended = span as unknown as ReadableSpan;
    }));
    if (!ended) { throw new Error("No test span"); }
    wrapped.export([ended], () => {});
    expect(JSON.stringify(exported.map((span) => ({ name: span.name, attributes: span.attributes, events: span.events, status: span.status })))).not.toContain("private");
    expect(exported[0].attributes["llm.provider"]).toBe("test");
    await flushTelemetry();
  });
});
