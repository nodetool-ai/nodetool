/**
 * OpenTelemetry telemetry for LLM provider calls, agent execution, and
 * workflow runs.
 *
 * Multiple sinks can be active simultaneously — for example, log to a JSONL
 * file *and* ship to Traceloop *and* pretty-print to stdout. Each sink gets
 * its own span processor so they're independent.
 *
 * Configuration (env vars; CLI flags / programmatic options take precedence):
 *
 *   OpenTelemetry / OTLP:
 *     TRACELOOP_API_KEY            — Traceloop cloud API key
 *     OTEL_EXPORTER_OTLP_ENDPOINT  — Any OTLP-compatible backend
 *     OTEL_SERVICE_NAME            — Service name tag (default: "nodetool")
 *     OTEL_TRACES_EXPORTER=console — Print spans to stdout via OTel SDK
 *     TRACELOOP_DISABLE_BATCH=true — Flush spans immediately (dev mode)
 *
 *   NodeTool sinks (analyzer-friendly):
 *     NODETOOL_TRACE_FILE=path.jsonl     — append one JSON span per line
 *     NODETOOL_TRACE_STDOUT=pretty|json  — write spans to stdout (human/JSONL)
 *
 * All NodeTool sinks emit the same {@link TraceRecord} shape (see
 * trace-exporters.ts) so a downstream agent can ingest either one.
 */

import type { Tracer } from "@opentelemetry/api";
import { createLogger } from "@nodetool/config";
import type { StdoutFormat } from "./trace-exporters.js";

const log = createLogger("nodetool.runtime.telemetry");

let _tracer: Tracer | null = null;
let _initialized = false;

export interface TelemetryOptions {
  /** Override the service name (defaults to OTEL_SERVICE_NAME or "nodetool"). */
  serviceName?: string;
  /** Print spans to stdout via OTel SDK ConsoleSpanExporter (legacy). */
  console?: boolean;
  /**
   * Write spans to stdout in the given format. Same as setting
   * `NODETOOL_TRACE_STDOUT`. Use this for the analyzer-friendly stdout sink.
   */
  stdout?: StdoutFormat | false;
  /**
   * Append spans as JSONL to this path. Same as `NODETOOL_TRACE_FILE`. Parent
   * directories are created automatically.
   */
  traceFile?: string;
  /** Flush OTLP spans immediately instead of batching. */
  disableBatch?: boolean;
  /** Suppress the initialization log. */
  silent?: boolean;
}

/**
 * Initialize OpenTelemetry instrumentation.
 *
 * Idempotent: calling more than once is a no-op (returns the previous result).
 * Returns true if at least one sink is active, false if telemetry was skipped.
 */
export async function initTelemetry(
  options: TelemetryOptions = {}
): Promise<boolean> {
  if (_initialized) return _tracer !== null;

  const traceloopKey = process.env["TRACELOOP_API_KEY"];
  const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  const consoleMode =
    options.console || process.env["OTEL_TRACES_EXPORTER"] === "console";

  const stdoutFormat: StdoutFormat | null = (() => {
    if (options.stdout === false) return null;
    if (options.stdout === "pretty" || options.stdout === "json") {
      return options.stdout;
    }
    const env = process.env["NODETOOL_TRACE_STDOUT"];
    if (env === "pretty" || env === "json") return env;
    if (env === "1" || env === "true") return "pretty";
    return null;
  })();

  const traceFilePath = options.traceFile ?? process.env["NODETOOL_TRACE_FILE"];

  const hasOtlp = !!(traceloopKey || otlpEndpoint);
  if (!hasOtlp && !consoleMode && !stdoutFormat && !traceFilePath) {
    _initialized = true;
    return false;
  }

  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME } = await import(
    "@opentelemetry/semantic-conventions"
  );
  const otelApi = await import("@opentelemetry/api");
  const { BatchSpanProcessor, SimpleSpanProcessor, ConsoleSpanExporter } =
    await import("@opentelemetry/sdk-trace-base");

  const serviceName =
    options.serviceName ?? process.env["OTEL_SERVICE_NAME"] ?? "nodetool";

  const disableBatch =
    options.disableBatch ?? process.env["TRACELOOP_DISABLE_BATCH"] === "true";

  const processors: unknown[] = [];
  const destinations: string[] = [];

  if (hasOtlp) {
    const { OTLPTraceExporter } = await import(
      "@opentelemetry/exporter-trace-otlp-proto"
    );
    const url = otlpEndpoint
      ? `${otlpEndpoint}/v1/traces`
      : "https://api.traceloop.com/v1/traces";
    const headers: Record<string, string> = traceloopKey
      ? { Authorization: `Bearer ${traceloopKey}` }
      : {};
    const exporter = new OTLPTraceExporter({ url, headers });
    const Proc = disableBatch ? SimpleSpanProcessor : BatchSpanProcessor;
    processors.push(new Proc(exporter));
    destinations.push(traceloopKey ? "traceloop" : `otlp:${otlpEndpoint!}`);
  }

  if (consoleMode) {
    processors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    destinations.push("otel-console");
  }

  if (stdoutFormat) {
    const { StdoutSpanExporter } = await import("./trace-exporters.js");
    processors.push(
      new SimpleSpanProcessor(new StdoutSpanExporter(stdoutFormat))
    );
    destinations.push(`stdout:${stdoutFormat}`);
  }

  if (traceFilePath) {
    const { JsonlFileSpanExporter } = await import("./trace-exporters.js");
    // SimpleSpanProcessor — we want the file written eagerly so a crash
    // doesn't lose recent spans, and disk I/O is cheap enough.
    processors.push(
      new SimpleSpanProcessor(new JsonlFileSpanExporter(traceFilePath))
    );
    destinations.push(`file:${traceFilePath}`);
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    spanProcessors: processors as never
  });

  // sdk.start() is typed as void in current SDK versions, but historically
  // returned a Promise — `await` is a no-op on non-thenable values, so this
  // is safe across versions and avoids racing the first spans on any
  // version that does init asynchronously.
  await sdk.start();
  _tracer = otelApi.trace.getTracer("nodetool", "0.1.0");
  _initialized = true;

  if (!options.silent) {
    log.info("OpenTelemetry initialized", {
      destinations: destinations.join(", ")
    });
  }

  return true;
}

/** Returns the active tracer, or null if telemetry is not initialized. */
export function getTracer(): Tracer | null {
  return _tracer;
}

/**
 * Reset the telemetry singleton. Test-only — production code should call
 * `initTelemetry()` exactly once at startup.
 */
export function _resetTelemetryForTest(): void {
  _tracer = null;
  _initialized = false;
}
