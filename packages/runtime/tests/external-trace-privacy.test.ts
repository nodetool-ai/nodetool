import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConsoleSpanExporter, type ReadableSpan, type SpanExporter } from "@opentelemetry/sdk-trace-base";
import { ContentFilteringSpanExporter } from "../src/run-trace-processor.js";
import { JsonlFileSpanExporter, StdoutSpanExporter } from "../src/trace-exporters.js";
import { logProviderRequestFailure } from "../src/providers/provider-request-log.js";

function span(): ReadableSpan {
  return {
    name: "private custom span name", kind: 0, spanContext: () => ({ traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 }),
    startTime: [1, 0], endTime: [2, 0], duration: [1, 0], ended: true,
    status: { code: 2, message: "private provider error" },
    attributes: { "llm.provider": "test", "llm.request.messages": "private request", "llm.response.content": "private response", "new.unknown.content": "private custom attribute" },
    events: [{ name: "console", time: [1, 1], attributes: { "console.output": "private console output", "log.level": "error" } }],
    resource: { attributes: { "service.name": "nodetool", "host.name": "private host" } },
    links: [], instrumentationScope: { name: "nodetool" }, droppedAttributesCount: 0, droppedEventsCount: 0, droppedLinksCount: 0
  } as unknown as ReadableSpan;
}

function exportOnce(exporter: SpanExporter): Promise<void> {
  return new Promise((resolve, reject) => exporter.export([span()], (result) => result.code === 0 ? resolve() : reject(result.error)));
}

beforeEach(() => { vi.stubEnv("NODETOOL_TRACE_INCLUDE_CONTENT", ""); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("external trace privacy default", () => {
  it("removes classified content from a directly constructed JSONL exporter", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodetool-trace-privacy-"));
    try {
      const file = join(directory, "trace.jsonl");
      const exporter = new JsonlFileSpanExporter(file);
      await exportOnce(exporter);
      await exporter.shutdown();
      const text = await readFile(file, "utf8");
      expect(text).not.toContain("private");
      expect(text).toContain("llm.provider");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it.each(["json", "pretty"] as const)("removes content from the %s stdout exporter", async (format) => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await exportOnce(new StdoutSpanExporter(format));
    const text = write.mock.calls.map((call) => String(call[0])).join("");
    expect(text).not.toContain("private");
    expect(text).toContain("content.span");
  });

  it("removes content from the actual legacy console exporter", async () => {
    const output = vi.spyOn(console, "dir").mockImplementation(() => {});
    await exportOnce(new ContentFilteringSpanExporter(new ConsoleSpanExporter()));
    expect(JSON.stringify(output.mock.calls)).not.toContain("private");
    expect(JSON.stringify(output.mock.calls)).toContain("llm.provider");
  });

  it("removes content before an OTLP exporter receives it", async () => {
    let received: ReadableSpan[] = [];
    const exporter = new ContentFilteringSpanExporter({ export(spans, callback) { received = spans; callback({ code: 0 }); }, async shutdown() {} });
    await exportOnce(exporter);
    expect(JSON.stringify(received.map((item) => ({ name: item.name, attributes: item.attributes, events: item.events, status: item.status, resource: item.resource.attributes })))).not.toContain("private");
    expect(received[0].attributes["llm.provider"]).toBe("test");
  });

  it("keeps provider failure logs metadata-only outside an active span", () => {
    const error = vi.fn();
    logProviderRequestFailure({ provider: "test", model: "model", request: { prompt: "private request" }, error: new Error("private error") }, { error, info() {}, warn() {}, debug() {} });
    expect(JSON.stringify(error.mock.calls)).not.toContain("private");
    expect(error.mock.calls[0][1]).toMatchObject({ provider: "test", model: "model", error_type: "Error" });
  });
});
