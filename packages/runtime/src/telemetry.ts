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
 *     OTEL_EXPORTER_OTLP_ENDPOINT  — Any OTLP-compatible backend (`/v1/traces`
 *                                    is appended)
 *     OTEL_EXPORTER_OTLP_TRACES_ENDPOINT — Full traces URL, used as given;
 *                                    wins over OTEL_EXPORTER_OTLP_ENDPOINT
 *     OTEL_EXPORTER_OTLP_HEADERS   — Extra exporter headers (read by the SDK)
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

import { context, propagation, trace, type Tracer } from "@opentelemetry/api";
import { createLogger, setLogHook } from "@nodetool-ai/config";
import type { StdoutFormat } from "./trace-exporters.js";
import { ContentFilteringSpanExporter, RunTraceSpanProcessor, installRunTraceLogHook } from "./run-trace-processor.js";
import { getRunTraceScope } from "./run-trace-context.js";
import { TRACE_SPAN_EVENT_LIMIT } from "@nodetool-ai/protocol";

const log = createLogger("nodetool.runtime.telemetry");

let _tracer: Tracer | null = null;
let _initialized = false;
let _sdk: { shutdown: () => Promise<void> } | null = null;
let _processors: import("@opentelemetry/sdk-trace-base").SpanProcessor[] = [];

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
 * The durable processor is always active. External sinks remain optional.
 */
export async function initTelemetry(
  options: TelemetryOptions = {}
): Promise<boolean> {
  if (_initialized) return _tracer !== null;

  const traceloopKey = process.env["TRACELOOP_API_KEY"];
  const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  const otlpTracesEndpoint = process.env["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"];
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

  const hasOtlp = !!(traceloopKey || otlpEndpoint || otlpTracesEndpoint);
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { resourceFromAttributes } = await import("@opentelemetry/resources");
  const { ATTR_SERVICE_NAME } = await import(
    "@opentelemetry/semantic-conventions"
  );
  const otelApi = await import("@opentelemetry/api");
  const { BatchSpanProcessor, SimpleSpanProcessor, ConsoleSpanExporter, RandomIdGenerator, AlwaysOnSampler } =
    await import("@opentelemetry/sdk-trace-base");

  const serviceName =
    options.serviceName ?? process.env["OTEL_SERVICE_NAME"] ?? "nodetool";

  const disableBatch =
    options.disableBatch ?? process.env["TRACELOOP_DISABLE_BATCH"] === "true";

  const processor = new RunTraceSpanProcessor();
  const processors: import("@opentelemetry/sdk-trace-base").SpanProcessor[] = [processor];
  _processors = processors;
  const destinations: string[] = ["run-store"];

  if (hasOtlp) {
    const { OTLPTraceExporter } = await import(
      "@opentelemetry/exporter-trace-otlp-proto"
    );
    const url = otlpTracesEndpoint
      ? otlpTracesEndpoint
      : otlpEndpoint
        ? `${otlpEndpoint.replace(/\/+$/, "")}/v1/traces`
        : "https://api.traceloop.com/v1/traces";
    const headers: Record<string, string> = traceloopKey
      ? { Authorization: `Bearer ${traceloopKey}` }
      : {};
    const exporter = new OTLPTraceExporter({ url, headers });
    const Proc = disableBatch ? SimpleSpanProcessor : BatchSpanProcessor;
    processors.push(new Proc(new ContentFilteringSpanExporter(exporter)));
    destinations.push(traceloopKey ? "traceloop" : `otlp:${url}`);
  }

  if (consoleMode) {
    processors.push(new SimpleSpanProcessor(new ContentFilteringSpanExporter(new ConsoleSpanExporter())));
    destinations.push("otel-console");
  }

  if (stdoutFormat) {
    const { StdoutSpanExporter } = await import("./trace-exporters.js");
    processors.push(
      new SimpleSpanProcessor(new ContentFilteringSpanExporter(new StdoutSpanExporter(stdoutFormat)))
    );
    destinations.push(`stdout:${stdoutFormat}`);
  }

  if (traceFilePath) {
    const { JsonlFileSpanExporter } = await import("./trace-exporters.js");
    // SimpleSpanProcessor — we want the file written eagerly so a crash
    // doesn't lose recent spans, and disk I/O is cheap enough.
    processors.push(
      new SimpleSpanProcessor(new ContentFilteringSpanExporter(new JsonlFileSpanExporter(traceFilePath)))
    );
    destinations.push(`file:${traceFilePath}`);
  }

  // Outbound `fetch` (provider APIs, S3, Supabase, safeFetch) becomes
  // `HTTP <method>` client spans. undici publishes on diagnostics_channel, so
  // this works in ESM and in the bundled backend without a loader hook. The
  // OTLP exporter sends over `node:http`, so it never traces itself.
  const { UndiciInstrumentation } = await import(
    "@opentelemetry/instrumentation-undici"
  );

  const ids = new RandomIdGenerator();
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    autoDetectResources: false,
    spanProcessors: processors,
    sampler: new AlwaysOnSampler(),
    spanLimits: { eventCountLimit: TRACE_SPAN_EVENT_LIMIT },
    idGenerator: { generateTraceId: () => getRunTraceScope()?.traceId ?? ids.generateTraceId(), generateSpanId: () => ids.generateSpanId() },
    instrumentations: [new UndiciInstrumentation()]
  });

  // sdk.start() is typed as void in current SDK versions, but historically
  // returned a Promise — `await` is a no-op on non-thenable values, so this
  // is safe across versions and avoids racing the first spans on any
  // version that does init asynchronously.
  await sdk.start();
  _sdk = sdk;
  _tracer = otelApi.trace.getTracer("nodetool", "0.1.0");
  _initialized = true;
  installRunTraceLogHook();

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
 * Flush and shut down the OpenTelemetry SDK. Must be awaited before a
 * short-lived process exits — the OTLP/Traceloop sink uses a BatchSpanProcessor
 * that only ships buffered spans on a timer or an explicit shutdown, so without
 * this a CLI that finishes before the batch delay delivers zero traces.
 */
export async function shutdownTelemetry(): Promise<void> {
  const sdk = _sdk;
  _sdk = null;
  _tracer = null;
  _initialized = false;
  _processors = [];
  if (sdk) {
    try {
      await sdk.shutdown();
    } catch (err) {
      log.warn(
        "Telemetry shutdown failed",
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }
  setLogHook(null);
}

/** Wait until the durable processor has persisted every queued completed record. */
export async function flushTelemetry(): Promise<void> {
  await Promise.all(_processors.map((processor) => processor.forceFlush()));
}

/**
 * Reset the telemetry singleton. Test-only — production code should call
 * `initTelemetry()` exactly once at startup.
 */
export function _resetTelemetryForTest(): void {
  _tracer = null;
  _initialized = false;
  _sdk = null;
  _processors = [];
  setLogHook(null);
  trace.disable();
  context.disable();
  propagation.disable();
}
