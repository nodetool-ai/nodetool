import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { context, propagation, trace, ROOT_CONTEXT } from "@opentelemetry/api";
import { _resetTelemetryForTest, getTracer, initTelemetry, shutdownTelemetry } from "../src/telemetry.js";

beforeEach(() => {
  _resetTelemetryForTest();
  for (const name of ["TRACELOOP_API_KEY", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS", "OTEL_TRACES_EXPORTER", "NODETOOL_TRACE_FILE", "NODETOOL_TRACE_STDOUT", "TRACELOOP_DISABLE_BATCH"]) { vi.stubEnv(name, ""); }
});
afterEach(async () => { await shutdownTelemetry(); _resetTelemetryForTest(); });

describe("telemetry pipeline", () => {
  it("records local spans with no network exporter when no endpoint is configured", async () => {
    const send = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", send);
    expect(await initTelemetry({ silent: true })).toBe(true);
    const span = getTracer()!.startSpan("local");
    expect(span.isRecording()).toBe(true);
    span.end();
    await shutdownTelemetry();
    expect(send).not.toHaveBeenCalled();
  });

  it("preserves async parent spans and W3C propagation", async () => {
    await initTelemetry({ silent: true });
    await getTracer()!.startActiveSpan("parent", async (parent) => {
      await Promise.resolve();
      expect(trace.getSpan(context.active())).toBe(parent);
      const child = getTracer()!.startSpan("child");
      expect(child.spanContext().traceId).toBe(parent.spanContext().traceId);
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);
      const extracted = propagation.extract(ROOT_CONTEXT, carrier);
      expect(trace.getSpanContext(extracted)?.spanId).toBe(parent.spanContext().spanId);
      const bound = context.bind(context.active(), () => trace.getSpan(context.active()));
      expect(context.with(ROOT_CONTEXT, bound)).toBe(parent);
      child.end();
      parent.end();
    });
  });

  it("exports the configured service name and headers on shutdown", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector/");
    vi.stubEnv("OTEL_EXPORTER_OTLP_HEADERS", "x-auth=secret%20value");
    vi.stubEnv("OTEL_SERVICE_NAME", "env-service");
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", send);
    await initTelemetry({ silent: true });
    getTracer()!.startSpan("agent.step").end();
    await shutdownTelemetry();
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBe("http://collector/v1/traces");
    expect(send.mock.calls[0]?.[1]?.headers).toEqual({ "x-auth": "secret value", "content-type": "application/json" });
    expect(send.mock.calls[0]?.[1]?.body).toContain('"stringValue":"env-service"');
  });

  it("honors immediate export and option precedence and initializes only once", async () => {
    vi.stubEnv("TRACELOOP_API_KEY", "cloud-key");
    vi.stubEnv("TRACELOOP_DISABLE_BATCH", "true");
    vi.stubEnv("OTEL_SERVICE_NAME", "env-service");
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", send);
    await initTelemetry({ silent: true, serviceName: "option-service" });
    await initTelemetry({ silent: true, serviceName: "ignored-service" });
    getTracer()!.startSpan("agent.step").end();
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]?.[0]).toBe("https://api.traceloop.com/v1/traces");
    expect(send.mock.calls[0]?.[1]?.body).toContain('"stringValue":"option-service"');
  });
});
