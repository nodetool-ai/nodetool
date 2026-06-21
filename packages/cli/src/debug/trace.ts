/**
 * Reads and summarizes the OpenTelemetry JSONL trace a debug run produces.
 *
 * The runtime's `JsonlFileSpanExporter` writes one span per line in the shape
 * documented in CLAUDE.md (workflow.run → node.process → agent.* → llm.*). We
 * roll those up into per-name timing plus token/cost totals from the
 * `gen_ai.usage.*` attributes carried by every llm.chat / llm.stream span.
 */
import { readFile } from "node:fs/promises";
import type { TraceSummary } from "./types.js";

/** One span as serialized by the JSONL trace exporter. */
export interface TraceSpan {
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
  events: Array<{ name: string; time_ms: number; attributes?: Record<string, unknown> }>;
  resource: Record<string, unknown>;
}

const SLOWEST_LIMIT = 10;

/** Parse a JSONL trace file body, skipping blank/corrupt lines. */
export function parseTraceJsonl(text: string): TraceSpan[] {
  const spans: TraceSpan[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      spans.push(JSON.parse(trimmed) as TraceSpan);
    } catch {
      // Ignore partial/corrupt lines (e.g. a crash mid-write).
    }
  }
  return spans;
}

function numAttr(attrs: Record<string, unknown>, key: string): number {
  const v = attrs[key];
  return typeof v === "number" ? v : 0;
}

/** Roll spans up into a `TraceSummary`. */
export function summarizeSpans(spans: TraceSpan[]): TraceSummary {
  const byName: TraceSummary["byName"] = {};
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;

  for (const span of spans) {
    const bucket = (byName[span.name] ??= { count: 0, totalDurationMs: 0 });
    bucket.count += 1;
    bucket.totalDurationMs += span.duration_ms;

    if (Number.isFinite(span.start_time_ms)) minStart = Math.min(minStart, span.start_time_ms);
    if (Number.isFinite(span.end_time_ms)) maxEnd = Math.max(maxEnd, span.end_time_ms);

    const a = span.attributes ?? {};
    inputTokens += numAttr(a, "gen_ai.usage.input_tokens");
    outputTokens += numAttr(a, "gen_ai.usage.output_tokens");
    totalTokens += numAttr(a, "gen_ai.usage.total_tokens");
    costUsd += numAttr(a, "gen_ai.usage.cost_usd");
  }

  const slowest = spans
    .slice()
    .sort((x, y) => y.duration_ms - x.duration_ms)
    .slice(0, SLOWEST_LIMIT)
    .map((s) => ({ name: s.name, durationMs: s.duration_ms, status: s.status?.code ?? "UNSET" }));

  return {
    spanCount: spans.length,
    totalDurationMs:
      spans.length > 0 && minStart !== Number.POSITIVE_INFINITY ? maxEnd - minStart : null,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: totalTokens || inputTokens + outputTokens
    },
    costUsd,
    byName,
    slowest
  };
}

/** Read + summarize a trace file. Returns null when the file is missing/empty. */
export async function readTraceSummary(path: string): Promise<TraceSummary | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return null;
  }
  const spans = parseTraceJsonl(text);
  if (spans.length === 0) return null;
  return summarizeSpans(spans);
}
