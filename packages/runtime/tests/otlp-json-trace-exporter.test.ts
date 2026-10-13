import { describe, expect, it, vi } from "vitest";
import { ROOT_CONTEXT, trace, SpanKind, SpanStatusCode, createTraceState } from "@opentelemetry/api";
import { ExportResultCode } from "@opentelemetry/core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BasicTracerProvider, BatchSpanProcessor, InMemorySpanExporter, SimpleSpanProcessor, type ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { encodeOtlpTraces, OtlpJsonTraceExporter, otlpExporterConfigFromEnv } from "../src/otlp-json-trace-exporter.js";

async function fixture(): Promise<ReadableSpan[]> {
  const capture = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({ "service.name": "test-service", enabled: true }),
    spanProcessors: [new SimpleSpanProcessor(capture)],
    idGenerator: { generateTraceId: () => "ab".repeat(16), generateSpanId: () => "cd".repeat(8) }
  });
  const tracer = provider.getTracer("test-scope", "1.2", { schemaUrl: "https://schema.example/scope" });
  const span = tracer.startSpan("request", {
    kind: SpanKind.CLIENT, startTime: [1_700_000_000, 123],
    attributes: { text: "hello", integer: 42, fraction: 1.25, enabled: false, strings: ["a", "b"], numbers: [1, 1.5], booleans: [true, false] },
    links: [{ context: { traceId: "ef".repeat(16), spanId: "12".repeat(8), traceFlags: 1, isRemote: true, traceState: createTraceState("vendor=value") }, attributes: { linked: true } }]
  }, trace.setSpanContext(ROOT_CONTEXT, { traceId: "ab".repeat(16), spanId: "34".repeat(8), traceFlags: 1, isRemote: true }));
  span.addEvent("done", { attempts: 2 }, [1_700_000_000, 456]);
  span.setStatus({ code: SpanStatusCode.ERROR, message: "failed" });
  span.end([1_700_000_001, 789]);
  const second = tracer.startSpan("second");
  second.end();
  await provider.forceFlush();
  const spans = capture.getFinishedSpans().slice();
  await provider.shutdown();
  return spans;
}

describe("OTLP JSON trace export", () => {
  it("encodes hex IDs, precise timestamps, AnyValues, resources, scopes, events and links", async () => {
    const encoded = encodeOtlpTraces(await fixture());
    expect(encoded.resourceSpans).toHaveLength(1);
    const resource = encoded.resourceSpans[0]!;
    expect(resource.resource.attributes).toEqual([
      { key: "service.name", value: { stringValue: "test-service" } },
      { key: "enabled", value: { boolValue: true } }
    ]);
    expect(resource.scopeSpans).toHaveLength(1);
    expect(resource.scopeSpans[0]?.scope).toEqual({ name: "test-scope", version: "1.2" });
    expect(resource.scopeSpans[0]?.schemaUrl).toBe("https://schema.example/scope");
    expect(resource.scopeSpans[0]?.spans).toHaveLength(2);
    const span = resource.scopeSpans[0]!.spans[0]!;
    expect(span).toMatchObject({
      traceId: "ab".repeat(16), spanId: "cd".repeat(8), parentSpanId: "34".repeat(8), kind: 3,
      startTimeUnixNano: "1700000000000000123", endTimeUnixNano: "1700000001000000789",
      status: { code: 2, message: "failed" }, flags: 769
    });
    expect(span.attributes).toEqual([
      { key: "text", value: { stringValue: "hello" } },
      { key: "integer", value: { intValue: "42" } },
      { key: "fraction", value: { doubleValue: 1.25 } },
      { key: "enabled", value: { boolValue: false } },
      { key: "strings", value: { arrayValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] } } },
      { key: "numbers", value: { arrayValue: { values: [{ intValue: "1" }, { doubleValue: 1.5 }] } } },
      { key: "booleans", value: { arrayValue: { values: [{ boolValue: true }, { boolValue: false }] } } }
    ]);
    expect(span.events).toEqual([{ name: "done", timeUnixNano: "1700000000000000456", attributes: [{ key: "attempts", value: { intValue: "2" } }], droppedAttributesCount: 0 }]);
    expect(span.links[0]).toMatchObject({ traceId: "ef".repeat(16), spanId: "12".repeat(8), traceState: "vendor=value", flags: 769 });
  });

  it("flushes a buffered batch on provider shutdown", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    const provider = new BasicTracerProvider({
      spanProcessors: [new BatchSpanProcessor(new OtlpJsonTraceExporter({ url: "http://collector/v1/traces", headers: { authorization: "token" } }, send), { scheduledDelayMillis: 60_000 })]
    });
    const span = provider.getTracer("batch").startSpan("buffered");
    span.end();
    expect(send).not.toHaveBeenCalled();
    await provider.shutdown();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("http://collector/v1/traces", expect.objectContaining({ method: "POST", headers: { authorization: "token", "content-type": "application/json" } }));
    expect(send.mock.calls[0]?.[1]?.body).toContain('"name":"buffered"');
  });

  it("reports HTTP and transport failures and rejects export after shutdown", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 503 })).mockRejectedValueOnce(new Error("offline"));
    const exporter = new OtlpJsonTraceExporter({ url: "http://collector/v1/traces", headers: {} }, send);
    const callback = vi.fn();
    exporter.export(await fixture(), callback);
    await exporter.shutdown();
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.FAILED, error: expect.objectContaining({ message: "OTLP trace export failed with HTTP 503" }) });
    exporter.export([], callback);
    expect(callback).toHaveBeenLastCalledWith({ code: ExportResultCode.FAILED, error: expect.objectContaining({ message: "Trace exporter is shut down" }) });
    const second = new OtlpJsonTraceExporter({ url: "http://collector/v1/traces", headers: {} }, send);
    second.export([], callback);
    await second.shutdown();
    expect(callback).toHaveBeenLastCalledWith({ code: ExportResultCode.FAILED, error: expect.objectContaining({ message: "offline" }) });
  });
});

describe("OTLP environment configuration", () => {
  it("requires an endpoint or Traceloop key", () => {
    expect(otlpExporterConfigFromEnv({ OTEL_EXPORTER_OTLP_HEADERS: "a=b" })).toBeNull();
    expect(otlpExporterConfigFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector///" })?.url).toBe("http://collector/v1/traces");
  });

  it("prefers the full traces endpoint and parses encoded headers without losing equals signs", () => {
    expect(otlpExporterConfigFromEnv({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://base", OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://traces/custom",
      OTEL_EXPORTER_OTLP_HEADERS: " Authorization = Bearer%20env, x-key=a=b, invalid", TRACELOOP_API_KEY: "cloud-key"
    })).toEqual({ url: "http://traces/custom", headers: { authorization: "Bearer cloud-key", "x-key": "a=b" } });
    expect(otlpExporterConfigFromEnv({ TRACELOOP_API_KEY: "cloud-key" })?.url).toBe("https://api.traceloop.com/v1/traces");
    expect(otlpExporterConfigFromEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://base", OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer%20env" })?.headers).toEqual({ authorization: "Bearer env" });
  });
});
