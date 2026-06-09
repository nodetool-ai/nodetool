/**
 * Custom OpenTelemetry span exporters for NodeTool.
 *
 * - {@link JsonlFileSpanExporter}  — appends one JSON line per span to a file
 * - {@link StdoutSpanExporter}     — writes spans to stdout in `json` (JSONL)
 *                                    or `pretty` (human-readable) format
 *
 * Both produce the same structured shape, so an analyzer agent reading either
 * file or stdout output gets identical fields.
 */

import { importNodeBuiltin } from "@nodetool-ai/config";

// Trace-exporter file/stream APIs require Node — lazy-load so this
// module loads on non-Node runtimes (where file exporters are unused).
const nodeFs = await importNodeBuiltin<typeof import("node:fs")>("node:fs");
const nodeFsP = await importNodeBuiltin<typeof import("node:fs/promises")>(
  "node:fs/promises"
);
const nodePath = await importNodeBuiltin<typeof import("node:path")>(
  "node:path"
);

type WriteStream = ReturnType<typeof import("node:fs").createWriteStream>;
// The `!node*` guards below only fire in a non-Node runtime (browser/edge),
// which the test environment never is — unreachable here, so suppressed.
function createWriteStream(
  ...args: Parameters<typeof import("node:fs").createWriteStream>
): WriteStream {
  // Stryker disable all
  if (!nodeFs) {
    throw new Error(
      "JsonlFileSpanExporter requires node:fs (Node-only feature)"
    );
  }
  // Stryker restore all
  return nodeFs.createWriteStream(...args);
}
async function mkdir(
  ...args: Parameters<typeof import("node:fs/promises").mkdir>
): Promise<string | undefined> {
  // Stryker disable all
  if (!nodeFsP) {
    throw new Error("File span exporter requires node:fs/promises");
  }
  // Stryker restore all
  return nodeFsP.mkdir(...args);
}
function dirname(p: string): string {
  // Stryker disable all
  if (!nodePath) {
    throw new Error("File span exporter requires node:path");
  }
  // Stryker restore all
  return nodePath.dirname(p);
}
import type {
  ReadableSpan,
  SpanExporter
} from "@opentelemetry/sdk-trace-base";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";

/**
 * Stable, analyzer-friendly JSON shape derived from a {@link ReadableSpan}.
 *
 * `start_time_ms` / `end_time_ms` are unix-epoch milliseconds; `duration_ms`
 * is end−start. Timestamps are ms (not ns) because that's what every
 * downstream consumer (logs, dashboards, LLMs) actually uses.
 */
export interface TraceRecord {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  start_time_ms: number;
  end_time_ms: number;
  duration_ms: number;
  status: { code: string; message?: string };
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    time_ms: number;
    attributes?: Record<string, unknown>;
  }>;
  resource: Record<string, unknown>;
}

const SPAN_KINDS = ["INTERNAL", "SERVER", "CLIENT", "PRODUCER", "CONSUMER"];
const STATUS_CODES = ["UNSET", "OK", "ERROR"];

/**
 * Convert an OTel hrTime ([seconds, nanoseconds]) to integer unix-epoch ms.
 *
 * We round (rather than truncate) so a 0.6ms span doesn't read as 0ms, and
 * we keep the schema integer-typed for downstream JSONL consumers that
 * assume `start_time_ms`/`end_time_ms`/`duration_ms` are whole numbers.
 */
function hrTimeToMs(hrTime: [number, number]): number {
  return Math.round(hrTime[0] * 1000 + hrTime[1] / 1_000_000);
}

export function spanToRecord(span: ReadableSpan): TraceRecord {
  const ctx = span.spanContext();
  const startMs = hrTimeToMs(span.startTime);
  const endMs = hrTimeToMs(span.endTime);
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    parent_span_id: span.parentSpanContext?.spanId ?? null,
    name: span.name,
    kind: SPAN_KINDS[span.kind] ?? "INTERNAL",
    start_time_ms: startMs,
    end_time_ms: endMs,
    duration_ms: endMs - startMs,
    status: {
      code: STATUS_CODES[span.status.code] ?? "UNSET",
      ...(span.status.message ? { message: span.status.message } : {})
    },
    attributes: { ...span.attributes },
    events: span.events.map((e) => ({
      name: e.name,
      time_ms: hrTimeToMs(e.time),
      ...(e.attributes ? { attributes: { ...e.attributes } } : {})
    })),
    resource: { ...span.resource.attributes }
  };
}

/**
 * Append spans as JSONL to a file. Creates parent directories as needed.
 *
 * Spans are written as soon as `export()` is called (use a SimpleSpanProcessor
 * for immediate flush, BatchSpanProcessor for buffered).
 *
 * Honors stream backpressure: each batch awaits the underlying `write`
 * callback (and a `drain` event when the stream reports it's full) before
 * reporting SUCCESS, so high trace volume can't accumulate unbounded.
 */
export class JsonlFileSpanExporter implements SpanExporter {
  private stream: WriteStream | null = null;
  private streamReady: Promise<void>;

  constructor(filePath: string) {
    this.streamReady = (async () => {
      await mkdir(dirname(filePath), { recursive: true });
      this.stream = createWriteStream(filePath, { flags: "a" });
    })();
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    void this.streamReady
      .then(async () => {
        // Unreachable: streamReady only resolves after `this.stream` is assigned;
        // if init failed it rejects and we go to .catch instead. Defensive guard.
        // Stryker disable next-line ConditionalExpression,StringLiteral
        if (!this.stream) throw new Error("trace stream not initialized");
        for (const span of spans) {
          await writeLine(this.stream, JSON.stringify(spanToRecord(span)) + "\n");
        }
        resultCallback({ code: ExportResultCode.SUCCESS });
      })
      .catch((err) => {
        resultCallback({ code: ExportResultCode.FAILED, error: err as Error });
      });
  }

  // Stryker disable next-line BlockStatement: shutdown only closes the stream; writeLine already flushed every line to the fd, so emptying it doesn't change observable file output (resource cleanup, not behaviour).
  async shutdown(): Promise<void> {
    await this.streamReady;
    await new Promise<void>((resolve) => {
      // Unreachable in practice: if streamReady resolved, the stream is set; if it
      // rejected, the await above already threw. Defensive guard.
      // Stryker disable next-line ConditionalExpression,BooleanLiteral
      if (!this.stream) return resolve();
      this.stream.end(resolve);
    });
  }

  async forceFlush(): Promise<void> {
    // WriteStream auto-flushes on write; nothing to do.
  }
}

/**
 * Write a single line to a WriteStream, respecting backpressure.
 *
 * Resolves once the write callback has fired AND the stream has drained
 * (if `write()` returned false). Rejects on any stream error during the
 * write — caller is responsible for re-attaching listeners afterwards.
 */
export function writeLine(stream: WriteStream, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let written = false;
    let drained = false;
    let needsDrain = false;
    const onError = (err: Error) => {
      stream.off("drain", onDrain);
      reject(err);
    };
    const onDrain = () => {
      drained = true;
      maybeDone();
    };
    const maybeDone = () => {
      if (written && (!needsDrain || drained)) {
        stream.off("error", onError);
        // Stryker disable next-line StringLiteral: redundant — resolving under backpressure means the once("drain") listener already fired and auto-removed itself, so there is never a drain listener to remove here.
        stream.off("drain", onDrain);
        resolve();
      }
    };
    stream.once("error", onError);
    const ok = stream.write(line, (err) => {
      if (err) return onError(err);
      written = true;
      maybeDone();
    });
    if (!ok) {
      needsDrain = true;
      stream.once("drain", onDrain);
    }
  });
}

export type StdoutFormat = "pretty" | "json";

/**
 * Write spans to stdout. `format: "json"` emits JSONL; `format: "pretty"`
 * emits a human-readable single-line summary that's still grep-friendly.
 */
export class StdoutSpanExporter implements SpanExporter {
  // Stryker disable next-line StringLiteral: only `=== "json"` is checked, so any non-"json" default (incl. "") yields pretty — the default value is equivalent.
  constructor(private readonly format: StdoutFormat = "pretty") {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    try {
      for (const span of spans) {
        const rec = spanToRecord(span);
        if (this.format === "json") {
          process.stdout.write(JSON.stringify(rec) + "\n");
        } else {
          process.stdout.write(formatPretty(rec) + "\n");
        }
      }
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (err) {
      resultCallback({ code: ExportResultCode.FAILED, error: err as Error });
    }
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up.
  }

  async forceFlush(): Promise<void> {
    // stdout writes are synchronous-ish; nothing to do.
  }
}

const COLOR = {
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  // Stryker disable next-line StringLiteral: `green`/`bold` are part of the palette but unused by formatPretty; kept for completeness.
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  // Stryker disable next-line StringLiteral: see above.
  bold: "\x1b[1m",
  reset: "\x1b[0m"
};

function colorize(s: string, color: keyof typeof COLOR): string {
  return process.stdout.isTTY ? `${COLOR[color]}${s}${COLOR.reset}` : s;
}

function formatPretty(r: TraceRecord): string {
  // duration_ms is already integer-rounded by hrTimeToMs, so toFixed(1) only
  // ever appended a meaningless ".0".
  const dur = `${r.duration_ms}ms`;
  const tags: string[] = [];
  // Surface the most useful attributes inline, in priority order.
  const inlineKeys = [
    "llm.provider",
    "llm.model",
    "gen_ai.usage.input_tokens",
    "gen_ai.usage.output_tokens",
    "agent.objective",
    "node.type",
    "node.id",
    "workflow.id"
  ];
  for (const k of inlineKeys) {
    const v = r.attributes[k];
    if (v !== undefined && v !== null && v !== "") {
      tags.push(`${colorize(k, "dim")}=${truncate(String(v), 60)}`);
    }
  }
  const status =
    r.status.code === "ERROR"
      ? colorize(`[${r.status.code}${r.status.message ? `: ${r.status.message}` : ""}]`, "red")
      : "";
  return `${colorize(r.name, "cyan")} ${colorize(dur, "yellow")} ${tags.join(" ")} ${status}`.trimEnd();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
