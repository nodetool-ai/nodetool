/**
 * Outbound fetch becomes a client span without the query string, and a fetch
 * that runs with tracing suppressed (the OTLP exporter's own requests) makes
 * no span.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { context } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor
} from "@opentelemetry/sdk-trace-base";
import { installHttpClientSpans } from "../src/http-client-spans.js";
import { NodeTraceContextManager } from "../src/trace-context-manager.js";

let server: Server;
let baseUrl: string;
const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)]
});
let uninstall: () => void;

beforeAll(async () => {
  context.setGlobalContextManager(new NodeTraceContextManager());
  server = createServer((req, res) => {
    res.statusCode = req.url?.startsWith("/missing") ? 404 : 200;
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  uninstall = installHttpClientSpans(provider.getTracer("test"));
});

afterAll(async () => {
  uninstall();
  context.disable();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Spans end on the response trailers, after the body is read. */
async function fetchText(url: string): Promise<void> {
  const response = await fetch(url);
  await response.text();
  await new Promise((resolve) => setImmediate(resolve));
}

describe("installHttpClientSpans", () => {
  it("records the method, status and URL without the query string", async () => {
    exporter.reset();
    await fetchText(`${baseUrl}/models?key=secret`);
    const [span] = exporter.getFinishedSpans();
    expect(span?.name).toBe("HTTP GET");
    expect(span?.attributes["http.request.method"]).toBe("GET");
    expect(span?.attributes["http.response.status_code"]).toBe(200);
    expect(span?.attributes["url.full"]).toBe(`${baseUrl}/models`);
    expect(span?.attributes["server.address"]).toBe("127.0.0.1");
  });

  it("marks a 4xx response as an error", async () => {
    exporter.reset();
    await fetchText(`${baseUrl}/missing`);
    const [span] = exporter.getFinishedSpans();
    expect(span?.attributes["http.response.status_code"]).toBe(404);
    expect(span?.status.code).toBe(2);
  });

  it("records nothing while tracing is suppressed", async () => {
    exporter.reset();
    await context.with(suppressTracing(context.active()), () =>
      fetchText(`${baseUrl}/v1/traces`)
    );
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });
});
