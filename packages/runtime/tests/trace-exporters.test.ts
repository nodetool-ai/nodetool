/**
 * Tests for trace-exporters: JSONL file and stdout span exporters.
 *
 * We construct minimal `ReadableSpan`-shaped objects to drive the exporters
 * directly; this covers the formatting code without requiring an actual SDK
 * setup.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  spanToRecord,
  JsonlFileSpanExporter,
  StdoutSpanExporter,
  type TraceRecord
} from "../src/trace-exporters.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeSpan(overrides: Partial<{
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId: string;
  startMs: number;
  endMs: number;
  attributes: Record<string, unknown>;
  statusCode: number;
  statusMessage: string;
}> = {}) {
  const startMs = overrides.startMs ?? 1_700_000_000_000;
  const endMs = overrides.endMs ?? startMs + 250;
  return {
    name: overrides.name ?? "llm.chat anthropic/claude-sonnet-4-6",
    kind: 0,
    spanContext: () => ({
      traceId: overrides.traceId ?? "a".repeat(32),
      spanId: overrides.spanId ?? "b".repeat(16),
      traceFlags: 1
    }),
    parentSpanContext: overrides.parentSpanId
      ? { spanId: overrides.parentSpanId }
      : undefined,
    startTime: msToHrTime(startMs),
    endTime: msToHrTime(endMs),
    status: {
      code: overrides.statusCode ?? 1,
      message: overrides.statusMessage
    },
    attributes: overrides.attributes ?? {
      "llm.provider": "anthropic",
      "llm.model": "claude-sonnet-4-6",
      "gen_ai.usage.input_tokens": 100,
      "gen_ai.usage.output_tokens": 50
    },
    events: [],
    resource: { attributes: { "service.name": "nodetool" } }
  } as unknown as Parameters<typeof spanToRecord>[0];
}

function msToHrTime(ms: number): [number, number] {
  const seconds = Math.floor(ms / 1000);
  const nanos = Math.floor((ms - seconds * 1000) * 1_000_000);
  return [seconds, nanos];
}

describe("spanToRecord", () => {
  it("converts a span to a stable JSON record shape", () => {
    const span = makeSpan({ startMs: 1000, endMs: 1500 });
    const rec = spanToRecord(span);
    expect(rec.name).toBe("llm.chat anthropic/claude-sonnet-4-6");
    expect(rec.duration_ms).toBe(500);
    expect(rec.start_time_ms).toBe(1000);
    expect(rec.end_time_ms).toBe(1500);
    expect(rec.status.code).toBe("OK");
    expect(rec.attributes["llm.provider"]).toBe("anthropic");
    expect(rec.parent_span_id).toBeNull();
    expect(rec.trace_id).toHaveLength(32);
  });

  it("includes parent_span_id when present", () => {
    const span = makeSpan({ parentSpanId: "c".repeat(16) });
    const rec = spanToRecord(span);
    expect(rec.parent_span_id).toBe("c".repeat(16));
  });

  it("maps status codes to readable strings", () => {
    const errSpan = makeSpan({ statusCode: 2, statusMessage: "boom" });
    const rec = spanToRecord(errSpan);
    expect(rec.status.code).toBe("ERROR");
    expect(rec.status.message).toBe("boom");
  });

  it("rounds sub-millisecond timestamps to integer milliseconds", () => {
    // Construct a span whose endTime carries 600_000 ns (0.6ms) past the second.
    const span = {
      ...makeSpan(),
      // raw hrTime: 1000s + 600µs → exactly 1_000_000.6 ms
      startTime: [1000, 600_000] as [number, number],
      endTime: [1000, 1_000_000] as [number, number]
    };
    const rec = spanToRecord(span as Parameters<typeof spanToRecord>[0]);
    expect(Number.isInteger(rec.start_time_ms)).toBe(true);
    expect(Number.isInteger(rec.end_time_ms)).toBe(true);
    expect(Number.isInteger(rec.duration_ms)).toBe(true);
  });
});

describe("JsonlFileSpanExporter", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "nodetool-trace-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("appends one JSON span per line", async () => {
    const path = join(tmpDir, "trace.jsonl");
    const exporter = new JsonlFileSpanExporter(path);
    await new Promise<void>((resolve, reject) => {
      exporter.export([makeSpan({ name: "first" }), makeSpan({ name: "second" })], (r) => {
        if (r.code === 0) resolve();
        else reject(r.error);
      });
    });
    await exporter.shutdown();

    const contents = await readFile(path, "utf8");
    const lines = contents.trim().split("\n");
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]) as TraceRecord;
    expect(first.name).toBe("first");
    expect(first.attributes["llm.provider"]).toBe("anthropic");
  });

  it("creates parent directories as needed", async () => {
    const path = join(tmpDir, "nested", "deep", "trace.jsonl");
    const exporter = new JsonlFileSpanExporter(path);
    await new Promise<void>((resolve, reject) => {
      exporter.export([makeSpan()], (r) => {
        if (r.code === 0) resolve();
        else reject(r.error);
      });
    });
    await exporter.shutdown();

    const contents = await readFile(path, "utf8");
    expect(contents.trim().split("\n")).toHaveLength(1);
  });
});

describe("StdoutSpanExporter", () => {
  let stdoutChunks: string[];
  let originalWrite: typeof process.stdout.write;

  beforeEach(() => {
    stdoutChunks = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  it("emits JSONL when format is 'json'", async () => {
    const exporter = new StdoutSpanExporter("json");
    await new Promise<void>((resolve, reject) => {
      exporter.export([makeSpan({ name: "abc" })], (r) => {
        if (r.code === 0) resolve();
        else reject(r.error);
      });
    });
    expect(stdoutChunks).toHaveLength(1);
    const parsed = JSON.parse(stdoutChunks[0]) as TraceRecord;
    expect(parsed.name).toBe("abc");
  });

  it("emits human-readable lines when format is 'pretty'", async () => {
    const exporter = new StdoutSpanExporter("pretty");
    await new Promise<void>((resolve, reject) => {
      exporter.export([makeSpan({ name: "llm.chat openai/gpt-5" })], (r) => {
        if (r.code === 0) resolve();
        else reject(r.error);
      });
    });
    expect(stdoutChunks).toHaveLength(1);
    expect(stdoutChunks[0]).toContain("llm.chat openai/gpt-5");
    expect(stdoutChunks[0]).toContain("ms");
  });
});
