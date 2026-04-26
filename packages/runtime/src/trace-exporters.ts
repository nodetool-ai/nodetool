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

import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
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

  async shutdown(): Promise<void> {
    await this.streamReady;
    await new Promise<void>((resolve) => {
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
function writeLine(stream: WriteStream, line: string): Promise<void> {
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
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  reset: "\x1b[0m"
};

function colorize(s: string, color: keyof typeof COLOR): string {
  return process.stdout.isTTY ? `${COLOR[color]}${s}${COLOR.reset}` : s;
}

function formatPretty(r: TraceRecord): string {
  const dur = `${r.duration_ms.toFixed(1)}ms`;
  const statusColor: keyof typeof COLOR =
    r.status.code === "ERROR"
      ? "red"
      : r.status.code === "OK"
        ? "green"
        : "dim";
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
      ? colorize(`[${r.status.code}${r.status.message ? `: ${r.status.message}` : ""}]`, statusColor)
      : "";
  return `${colorize(r.name, "cyan")} ${colorize(dur, "yellow")} ${tags.join(" ")} ${status}`.trimEnd();
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
