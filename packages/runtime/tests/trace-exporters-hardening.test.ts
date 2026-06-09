/**
 * Mutation-hardening tests for the trace exporters.
 *
 * Pins spanToRecord's enum/fallback/spread/event mapping and the exact
 * hrTime→ms arithmetic; the writeLine backpressure state machine (direct, via
 * a fake stream); the JSONL exporter's append flag + error path; and the
 * formatPretty structure (non-TTY) plus its ANSI coloring (TTY). See
 * MUTATION_TESTING.md.
 */
import { describe, it, expect, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  spanToRecord,
  writeLine,
  JsonlFileSpanExporter,
  StdoutSpanExporter,
  type TraceRecord
} from "../src/trace-exporters.js";

type Span = Parameters<typeof spanToRecord>[0];

function msToHrTime(ms: number): [number, number] {
  const seconds = Math.floor(ms / 1000);
  return [seconds, Math.floor((ms - seconds * 1000) * 1_000_000)];
}

function makeSpan(o: Partial<{
  name: string;
  kind: number;
  parentSpanId: string;
  startTime: [number, number];
  endTime: [number, number];
  statusCode: number;
  statusMessage: string;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; time: [number, number]; attributes?: Record<string, unknown> }>;
  resource: Record<string, unknown>;
}> = {}): Span {
  return {
    name: o.name ?? "llm.chat",
    kind: o.kind ?? 0,
    spanContext: () => ({ traceId: "a".repeat(32), spanId: "b".repeat(16), traceFlags: 1 }),
    parentSpanContext: o.parentSpanId ? { spanId: o.parentSpanId } : undefined,
    startTime: o.startTime ?? msToHrTime(1000),
    endTime: o.endTime ?? msToHrTime(1250),
    status: { code: o.statusCode ?? 1, message: o.statusMessage },
    attributes: o.attributes ?? {},
    events: o.events ?? [],
    resource: { attributes: o.resource ?? { "service.name": "nodetool" } }
  } as unknown as Span;
}

describe("spanToRecord", () => {
  it("maps each span kind by index, falling back to INTERNAL", () => {
    expect(spanToRecord(makeSpan({ kind: 0 })).kind).toBe("INTERNAL");
    expect(spanToRecord(makeSpan({ kind: 1 })).kind).toBe("SERVER");
    expect(spanToRecord(makeSpan({ kind: 2 })).kind).toBe("CLIENT");
    expect(spanToRecord(makeSpan({ kind: 3 })).kind).toBe("PRODUCER");
    expect(spanToRecord(makeSpan({ kind: 4 })).kind).toBe("CONSUMER");
    expect(spanToRecord(makeSpan({ kind: 99 })).kind).toBe("INTERNAL");
  });

  it("maps each status code by index, falling back to UNSET", () => {
    expect(spanToRecord(makeSpan({ statusCode: 0 })).status.code).toBe("UNSET");
    expect(spanToRecord(makeSpan({ statusCode: 1 })).status.code).toBe("OK");
    expect(spanToRecord(makeSpan({ statusCode: 2 })).status.code).toBe("ERROR");
    expect(spanToRecord(makeSpan({ statusCode: 99 })).status.code).toBe("UNSET");
  });

  it("includes status.message only when present", () => {
    expect(
      spanToRecord(makeSpan({ statusCode: 2, statusMessage: "boom" })).status
    ).toEqual({ code: "ERROR", message: "boom" });
    expect("message" in spanToRecord(makeSpan({ statusCode: 1 })).status).toBe(
      false
    );
  });

  it("uses parentSpanId when present, null otherwise", () => {
    expect(spanToRecord(makeSpan({ parentSpanId: "c".repeat(16) })).parent_span_id).toBe(
      "c".repeat(16)
    );
    expect(spanToRecord(makeSpan()).parent_span_id).toBeNull();
  });

  it("copies attributes and resource attributes", () => {
    const rec = spanToRecord(
      makeSpan({ attributes: { k: "v" }, resource: { "service.name": "svc" } })
    );
    expect(rec.attributes).toEqual({ k: "v" });
    expect(rec.resource).toEqual({ "service.name": "svc" });
  });

  it("maps events, including per-event attributes only when present", () => {
    const rec = spanToRecord(
      makeSpan({
        events: [
          { name: "e1", time: msToHrTime(1100), attributes: { a: 1 } },
          { name: "e2", time: msToHrTime(1200) }
        ]
      })
    );
    expect(rec.events).toEqual([
      { name: "e1", time_ms: 1100, attributes: { a: 1 } },
      { name: "e2", time_ms: 1200 }
    ]);
  });

  it("converts hrTime to rounded integer ms (seconds×1000 + nanos/1e6)", () => {
    // 2s + 500_000ns = 2000.5ms → rounds to 2001
    const rec = spanToRecord(
      makeSpan({ startTime: [2, 500_000], endTime: [3, 0] })
    );
    expect(rec.start_time_ms).toBe(2001);
    expect(rec.end_time_ms).toBe(3000);
    expect(rec.duration_ms).toBe(999);
  });
});

describe("writeLine — backpressure state machine", () => {
  class FakeStream extends EventEmitter {
    public writeReturn = true;
    public lastCb: ((err?: Error) => void) | null = null;
    write(_line: string, cb: (err?: Error) => void): boolean {
      this.lastCb = cb;
      return this.writeReturn;
    }
    off(event: string, fn: (...a: unknown[]) => void): this {
      this.removeListener(event, fn);
      return this;
    }
  }

  it("resolves once the write callback fires, and removes its listeners", async () => {
    const s = new FakeStream();
    const p = writeLine(s as never, "x");
    s.lastCb!(); // write succeeded
    await expect(p).resolves.toBeUndefined();
    expect(s.listenerCount("error")).toBe(0);
    expect(s.listenerCount("drain")).toBe(0);
  });

  it("does not resolve on 'drain' until the write callback has also fired", async () => {
    const s = new FakeStream();
    s.writeReturn = false;
    let resolved = false;
    const p = writeLine(s as never, "x").then(() => (resolved = true));
    s.emit("drain"); // drain arrives BEFORE the write callback
    await Promise.resolve();
    expect(resolved).toBe(false); // `written` is still false → must wait
    s.lastCb!();
    await p;
    expect(resolved).toBe(true);
  });

  it("waits for 'drain' before resolving when write() returns false", async () => {
    const s = new FakeStream();
    s.writeReturn = false;
    let resolved = false;
    const p = writeLine(s as never, "x").then(() => (resolved = true));
    s.lastCb!(); // callback fired, but stream said it needs draining
    await Promise.resolve();
    expect(resolved).toBe(false); // must NOT resolve yet
    s.emit("drain");
    await p;
    expect(resolved).toBe(true);
    // both listeners removed even on the backpressure-resolution path
    expect(s.listenerCount("drain")).toBe(0);
    expect(s.listenerCount("error")).toBe(0);
  });

  it("rejects when the write callback reports an error", async () => {
    const s = new FakeStream();
    const p = writeLine(s as never, "x");
    s.lastCb!(new Error("write failed"));
    await expect(p).rejects.toThrow("write failed");
  });

  it("rejects when the stream emits an error and detaches the drain listener", async () => {
    const s = new FakeStream();
    s.writeReturn = false;
    const p = writeLine(s as never, "x");
    s.emit("error", new Error("stream broke"));
    await expect(p).rejects.toThrow("stream broke");
    expect(s.listenerCount("drain")).toBe(0);
  });
});

describe("JsonlFileSpanExporter", () => {
  let dir: string;
  const exportOnce = (exp: JsonlFileSpanExporter, spans: Span[]) =>
    new Promise<ExportLike>((resolve) => exp.export(spans as never, resolve));
  type ExportLike = { code: number; error?: Error };

  beforeEachDir();
  function beforeEachDir() {
    afterEach(async () => {
      if (dir) await rm(dir, { recursive: true, force: true });
    });
  }

  it("appends to an existing file rather than truncating it", async () => {
    dir = await mkdtemp(join(tmpdir(), "te-"));
    const path = join(dir, "t.jsonl");
    await writeFile(path, "PRE\n");
    const exp = new JsonlFileSpanExporter(path);
    await exportOnce(exp, [makeSpan({ name: "new" })]);
    await exp.shutdown();
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    expect(lines[0]).toBe("PRE"); // original content preserved (flags: "a")
    expect(JSON.parse(lines[1]).name).toBe("new");
  });

  it("reports FAILED when the target directory cannot be created", async () => {
    dir = await mkdtemp(join(tmpdir(), "te-"));
    const fileAsDir = join(dir, "afile");
    await writeFile(fileAsDir, "x");
    // mkdir under a regular file → ENOTDIR → streamReady rejects → FAILED
    const exp = new JsonlFileSpanExporter(join(fileAsDir, "sub", "t.jsonl"));
    const res = await exportOnce(exp, [makeSpan()]);
    expect(res.code).toBe(1); // ExportResultCode.FAILED
  });
});

describe("StdoutSpanExporter", () => {
  let chunks: string[];
  let origWrite: typeof process.stdout.write;
  let origTTY: boolean | undefined;

  beforeEachStdout();
  function beforeEachStdout() {
    afterEach(() => {
      process.stdout.write = origWrite;
      Object.defineProperty(process.stdout, "isTTY", { value: origTTY, configurable: true });
    });
  }

  const capture = (tty: boolean) => {
    chunks = [];
    origWrite = process.stdout.write.bind(process.stdout);
    origTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: tty, configurable: true });
    process.stdout.write = ((c: string | Uint8Array) => {
      chunks.push(typeof c === "string" ? c : c.toString());
      return true;
    }) as typeof process.stdout.write;
  };
  const exportOnce = (exp: StdoutSpanExporter, spans: Span[]) =>
    new Promise<{ code: number }>((resolve) => exp.export(spans as never, resolve));

  it("emits JSONL (newline-terminated) for json format", async () => {
    capture(false);
    await exportOnce(new StdoutSpanExporter("json"), [makeSpan({ name: "abc" })]);
    expect(chunks[0].endsWith("\n")).toBe(true);
    expect(JSON.parse(chunks[0]).name).toBe("abc");
  });

  it("defaults to pretty format when no format is given", async () => {
    capture(false);
    await exportOnce(new StdoutSpanExporter(), [
      makeSpan({ name: "n", startTime: msToHrTime(0), endTime: msToHrTime(5), attributes: {} })
    ]);
    expect(chunks[0]).toBe("n 5ms\n"); // pretty single-line, not JSON
  });

  it("reports FAILED when a record cannot be serialized (json)", async () => {
    capture(false);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const res = await exportOnce(new StdoutSpanExporter("json"), [
      makeSpan({ attributes: circular })
    ]);
    expect(res.code).toBe(1);
  });

  describe("pretty format — structure (non-TTY)", () => {
    it("renders exactly `name dur tags` and trims the empty status (OK)", async () => {
      capture(false);
      await exportOnce(new StdoutSpanExporter("pretty"), [
        makeSpan({
          name: "n",
          startTime: msToHrTime(0),
          endTime: msToHrTime(5),
          statusCode: 1,
          attributes: { "llm.provider": "p" }
        })
      ]);
      // pins segment order, single-space separators, and trimEnd of empty status
      expect(chunks[0]).toBe("n 5ms llm.provider=p\n");
    });

    it("appends the colored-but-here-plain [ERROR: msg] for error spans", async () => {
      capture(false);
      await exportOnce(new StdoutSpanExporter("pretty"), [
        makeSpan({
          name: "n",
          startTime: msToHrTime(0),
          endTime: msToHrTime(5),
          statusCode: 2,
          statusMessage: "kaboom",
          attributes: {}
        })
      ]);
      expect(chunks[0]).toBe("n 5ms  [ERROR: kaboom]\n");
    });

    it("renders an error with no message as just [ERROR]", async () => {
      capture(false);
      await exportOnce(new StdoutSpanExporter("pretty"), [
        makeSpan({
          name: "n",
          startTime: msToHrTime(0),
          endTime: msToHrTime(5),
          statusCode: 2,
          attributes: {}
        })
      ]);
      expect(chunks[0]).toBe("n 5ms  [ERROR]\n");
    });

    it("surfaces every inline attribute key, skipping undefined/null/empty", async () => {
      capture(false);
      await exportOnce(new StdoutSpanExporter("pretty"), [
        makeSpan({
          attributes: {
            "llm.provider": "P",
            "llm.model": "M",
            "gen_ai.usage.input_tokens": 1,
            "gen_ai.usage.output_tokens": 2,
            "agent.objective": "O",
            "node.type": "NT",
            "node.id": "NI",
            "workflow.id": "WF",
            "skipped.empty": "",
            "skipped.null": null,
            "skipped.undef": undefined
          }
        })
      ]);
      const out = chunks[0];
      for (const t of [
        "llm.provider=P",
        "llm.model=M",
        "gen_ai.usage.input_tokens=1",
        "gen_ai.usage.output_tokens=2",
        "agent.objective=O",
        "node.type=NT",
        "node.id=NI",
        "workflow.id=WF"
      ]) {
        expect(out).toContain(t);
      }
      // tags are space-separated (pins the join(" "))
      expect(out).toContain("llm.provider=P llm.model=M");
      expect(out).not.toContain("skipped");
    });

    it("skips an inline key whose value is null or empty string", async () => {
      capture(false);
      await exportOnce(new StdoutSpanExporter("pretty"), [
        makeSpan({
          name: "n",
          startTime: msToHrTime(0),
          endTime: msToHrTime(5),
          attributes: {
            "llm.provider": "P", // kept
            "llm.model": null, // skipped (null)
            "node.type": "" // skipped (empty)
          }
        })
      ]);
      expect(chunks[0]).toBe("n 5ms llm.provider=P\n");
    });

    it("truncates a value at exactly 60 chars (keep) vs 61 (ellipsis)", async () => {
      capture(false);
      await exportOnce(new StdoutSpanExporter("pretty"), [
        makeSpan({ attributes: { "agent.objective": "a".repeat(60) } })
      ]);
      expect(chunks[0]).toContain("agent.objective=" + "a".repeat(60));

      capture(false);
      await exportOnce(new StdoutSpanExporter("pretty"), [
        makeSpan({ attributes: { "agent.objective": "b".repeat(61) } })
      ]);
      expect(chunks[0]).toContain("agent.objective=" + "b".repeat(59) + "…");
      expect(chunks[0]).not.toContain("b".repeat(60));
    });
  });

  describe("pretty format — ANSI coloring (TTY)", () => {
    it("wraps the name in cyan and the duration in yellow on a TTY", async () => {
      capture(true);
      await exportOnce(new StdoutSpanExporter("pretty"), [
        makeSpan({ name: "span", startTime: msToHrTime(0), endTime: msToHrTime(5) })
      ]);
      const out = chunks[0];
      expect(out).toContain("\x1b[36mspan\x1b[0m"); // cyan name
      expect(out).toContain("\x1b[33m5ms\x1b[0m"); // yellow duration
    });

    it("dims the inline attribute keys on a TTY", async () => {
      capture(true);
      await exportOnce(new StdoutSpanExporter("pretty"), [
        makeSpan({ attributes: { "llm.provider": "anthropic" } })
      ]);
      expect(chunks[0]).toContain("\x1b[2mllm.provider\x1b[0m=anthropic"); // dim key
    });

    it("colors the error status red on a TTY", async () => {
      capture(true);
      await exportOnce(new StdoutSpanExporter("pretty"), [
        makeSpan({ statusCode: 2, statusMessage: "x" })
      ]);
      expect(chunks[0]).toContain("\x1b[31m[ERROR: x]\x1b[0m"); // red
    });
  });
});
