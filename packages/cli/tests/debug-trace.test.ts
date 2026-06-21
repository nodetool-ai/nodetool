/**
 * Tests for the debug harness trace summarizer (src/debug/trace.ts).
 */
import { describe, expect, it } from "vitest";
import { parseTraceJsonl, summarizeSpans, type TraceSpan } from "../src/debug/trace.js";

function span(partial: Partial<TraceSpan>): TraceSpan {
  return {
    trace_id: "t",
    span_id: "s",
    parent_span_id: null,
    name: "span",
    kind: "INTERNAL",
    start_time_ms: 0,
    end_time_ms: 0,
    duration_ms: 0,
    status: { code: "OK" },
    attributes: {},
    events: [],
    resource: {},
    ...partial
  };
}

describe("parseTraceJsonl", () => {
  it("parses valid lines and skips blank/corrupt ones", () => {
    const text = [
      JSON.stringify(span({ name: "workflow.run" })),
      "",
      "{ not json",
      JSON.stringify(span({ name: "llm.chat" }))
    ].join("\n");
    const spans = parseTraceJsonl(text);
    expect(spans.map((s) => s.name)).toEqual(["workflow.run", "llm.chat"]);
  });
});

describe("summarizeSpans", () => {
  it("rolls up timing, token usage and cost", () => {
    const spans = [
      span({ name: "workflow.run", start_time_ms: 100, end_time_ms: 1100, duration_ms: 1000 }),
      span({
        name: "llm.chat",
        start_time_ms: 200,
        end_time_ms: 700,
        duration_ms: 500,
        attributes: {
          "gen_ai.usage.input_tokens": 100,
          "gen_ai.usage.output_tokens": 40,
          "gen_ai.usage.total_tokens": 140,
          "gen_ai.usage.cost_usd": 0.002
        }
      }),
      span({ name: "llm.chat", start_time_ms: 720, end_time_ms: 900, duration_ms: 180 })
    ];
    const summary = summarizeSpans(spans);
    expect(summary.spanCount).toBe(3);
    expect(summary.totalDurationMs).toBe(1000); // 1100 - 100
    expect(summary.tokens.total).toBe(140);
    expect(summary.costUsd).toBeCloseTo(0.002);
    expect(summary.byName["llm.chat"].count).toBe(2);
    expect(summary.byName["llm.chat"].totalDurationMs).toBe(680);
    expect(summary.slowest[0].name).toBe("workflow.run");
  });

  it("falls back to input+output when total_tokens is absent", () => {
    const summary = summarizeSpans([
      span({
        attributes: {
          "gen_ai.usage.input_tokens": 7,
          "gen_ai.usage.output_tokens": 3
        }
      })
    ]);
    expect(summary.tokens.total).toBe(10);
  });
});
