/**
 * OpenTelemetry telemetry for LLM provider calls.
 *
 * Uses manual spans in BaseProvider rather than auto-instrumentation, so it
 * works correctly with ESM (where module-level imports are hoisted before any
 * code runs, making monkey-patching unreliable).
 *
 * Configuration (via environment variables):
 *   TRACELOOP_API_KEY            — Traceloop cloud API key
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — Any OTLP-compatible backend
 *   OTEL_SERVICE_NAME            — Service name tag (default: "nodetool")
 *   OTEL_TRACES_EXPORTER=console — Print spans to stdout
 *   TRACELOOP_DISABLE_BATCH=true — Flush spans immediately (dev mode)
 */

import type { Tracer } from "@opentelemetry/api";
import { createLogger } from "@nodetool/config";

const log = createLogger("nodetool.runtime.telemetry");

let _tracer: Tracer | null = null;

export interface TelemetryOptions {
  /** Override the service name (defaults to OTEL_SERVICE_NAME or "nodetool"). */
  serviceName?: string;
  /** Print spans to stdout. Also enabled via OTEL_TRACES_EXPORTER=console. */
  console?: boolean;
  /** Flush spans immediately instead of batching. */
  disableBatch?: boolean;
  /** Suppress the initialization log. */
  silent?: boolean;
}

/**
 * Initialize OpenTelemetry instrumentation.
 *
 * Call once at startup before any LLM calls. Returns true if telemetry was
 * enabled, false if skipped (no configuration present).
 */
export async function initTelemetry(
  options: TelemetryOptions = {}
): Promise<boolean> {
  const apiKey = process.env["TRACELOOP_API_KEY"];
  const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  const consoleMode =
    options.console || process.env["OTEL_TRACES_EXPORTER"] === "console";

  if (!apiKey && !otlpEndpoint && !consoleMode) {
    return false;
  }

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME } =
    await import("@opentelemetry/semantic-conventions");
  const otelApi = await import("@opentelemetry/api");

  const serviceName =
    options.serviceName ?? process.env["OTEL_SERVICE_NAME"] ?? "nodetool";

  const disableBatch =
    (options.disableBatch ??
      process.env["TRACELOOP_DISABLE_BATCH"] === "true") ||
    consoleMode;

  let exporter: unknown;
  let destination: string;

  if (consoleMode) {
    const { ConsoleSpanExporter } =
      await import("@opentelemetry/sdk-trace-base");
    exporter = new ConsoleSpanExporter();
    destination = "console";
  } else if (apiKey || otlpEndpoint) {
    const { OTLPTraceExporter } =
      await import("@opentelemetry/exporter-trace-otlp-proto");
    const url = otlpEndpoint
      ? `${otlpEndpoint}/v1/traces`
      : "https://api.traceloop.com/v1/traces";
    const headers: Record<string, string> = apiKey
      ? { Authorization: `Bearer ${apiKey}` }
      : {};
    exporter = new OTLPTraceExporter({ url, headers });
    destination = apiKey ? "Traceloop" : otlpEndpoint!;
  } else {
    return false;
  }

  const { BatchSpanProcessor, SimpleSpanProcessor } =
    await import("@opentelemetry/sdk-trace-base");
  const SpanProcessor = disableBatch ? SimpleSpanProcessor : BatchSpanProcessor;

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    spanProcessors: [new SpanProcessor(exporter as never)]
  });

  sdk.start();
  _tracer = otelApi.trace.getTracer("nodetool", "0.1.0");

  if (!options.silent) {
    log.info(`OpenTelemetry initialized`, { destination });
  }

  return true;
}

/** Returns the active tracer, or null if telemetry is not initialized. */
export function getTracer(): Tracer | null {
  return _tracer;
}
