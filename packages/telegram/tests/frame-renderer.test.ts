import { describe, expect, it } from "vitest";

import { DEFAULT_CHUNK_MAX, TELEGRAM_MESSAGE_LIMIT } from "../src/chunk.js";
import { createRendererState, foldFrame, foldFrames } from "../src/frame-renderer.js";
import type { RenderFrame, RenderOp, RendererState } from "../src/frame-renderer.js";

function chunk(content: string, extra: Partial<RenderFrame> = {}): RenderFrame {
  return { type: "chunk", content, ...extra } as RenderFrame;
}

function tool(name: string, message?: string): RenderFrame {
  return { type: "tool_call_update", name, args: {}, message: message ?? null } as RenderFrame;
}

function finalMessage(text: string, seq?: number): RenderFrame {
  return {
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    ...(seq === undefined ? {} : { seq })
  } as RenderFrame;
}

/** Drive a script of `[frame, clock]` pairs through the fold. */
function run(
  script: readonly (readonly [RenderFrame, number])[],
  state: RendererState = createRendererState()
): { state: RendererState; ops: RenderOp[] } {
  const result = foldFrames(
    state,
    script.map(([frame, nowMs]) => ({ frame, nowMs }))
  );
  return { state: result.state, ops: [...result.ops] };
}

const kinds = (ops: readonly RenderOp[]): string[] =>
  ops.map((op) => ("target" in op ? `${op.kind}:${op.target}` : op.kind));

describe("foldFrame — text streaming", () => {
  it("asks for typing before the first chunk, then creates the stream message", () => {
    const { ops } = run([[chunk("Hello"), 0]]);
    expect(kinds(ops)).toEqual(["typing", "send:stream"]);
    expect(ops[1]).toMatchObject({ text: "Hello", parseMode: "html" });
  });

  it("throttles edits with the injected clock, never the wall clock", () => {
    const { ops, state } = run([
      [chunk("a"), 1000],
      [chunk("b"), 1100],
      [chunk("c"), 1400],
      [chunk("d"), 2400],
      [chunk("e"), 2500],
      [chunk("f"), 4000]
    ]);
    // Sent at 1000, so no edit lands before 2500 — 2400 is still inside the
    // window and its text rides along with the next one.
    expect(kinds(ops)).toEqual(["typing", "send:stream", "edit:stream", "edit:stream"]);
    const edits = ops.filter((op) => op.kind === "edit");
    expect(edits[0]).toMatchObject({ text: "abcde" });
    expect(edits[1]).toMatchObject({ text: "abcdef" });
    expect(state.carry).toBe("abcdef");
  });

  it("a chunk storm inside one throttle window produces one send and nothing else", () => {
    const script = Array.from(
      { length: 200 },
      (_, i) => [chunk(`x${i} `), 500 + i] as const
    );
    const { ops } = run(script);
    expect(kinds(ops)).toEqual(["typing", "send:stream"]);
  });

  it("a done chunk flushes immediately, ignoring the throttle", () => {
    const { ops } = run([
      [chunk("a"), 0],
      [chunk("b", { done: true }), 10]
    ]);
    expect(kinds(ops)).toEqual(["typing", "send:stream", "edit:stream"]);
  });

  it("skips thinking chunks", () => {
    const { ops } = run([[chunk("secret", { thinking: true }), 0]]);
    expect(ops).toEqual([]);
  });

  it("rolls over past the message limit and starts a new message", () => {
    const filler = "word ".repeat(900); // 4500 chars, over the 3800 rollover
    const { ops, state } = run([[chunk(filler), 0]]);
    expect(kinds(ops)).toEqual(["typing", "finalize:stream", "send:stream"]);
    for (const op of ops) {
      if ("text" in op) {
        expect(op.text.length).toBeLessThanOrEqual(DEFAULT_CHUNK_MAX);
        expect(op.text.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
      }
    }
    expect(state.streamOpen).toBe(true);
    expect(state.carry.length).toBeLessThan(DEFAULT_CHUNK_MAX);
  });

  it("rolls over exactly at the boundary, not before it", () => {
    const state = createRendererState({ rolloverChars: 100 });
    const under = run([[chunk("a".repeat(100)), 0]], state);
    expect(kinds(under.ops)).toEqual(["typing", "send:stream"]);

    const over = run([[chunk("a".repeat(101)), 0]], state);
    expect(kinds(over.ops)).toEqual(["typing", "finalize:stream", "send:stream"]);
  });

  it("keeps every emitted message under Telegram's limit even with heavy escaping", () => {
    const { ops } = run([[chunk("& ".repeat(5000)), 0]]);
    const texts = ops.flatMap((op) => ("text" in op ? [op.text] : []));
    expect(texts.length).toBeGreaterThan(1);
    for (const text of texts) {
      expect(text.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    }
  });
});

describe("foldFrame — status line", () => {
  it("creates one status message and edits it, latest tool winning", () => {
    const { ops } = run([
      [tool("web_search"), 0],
      [tool("read_file"), 100],
      [tool("read_file", "completed"), 200]
    ]);
    expect(kinds(ops)).toEqual(["send:status", "edit:status", "edit:status"]);
    expect(ops[0]).toMatchObject({ text: "🔧 web_search" });
    expect(ops[2]).toMatchObject({ text: "✅ read_file — completed" });
  });

  it("marks a failed tool with ❌", () => {
    const { ops } = run([[tool("write_file", "failed: permission denied"), 0]]);
    expect(ops[0]).toMatchObject({ text: "❌ write_file — failed: permission denied" });
  });

  it("emits nothing when a frame repeats the current status line", () => {
    const { ops } = run([
      [tool("web_search"), 0],
      [tool("web_search"), 100]
    ]);
    expect(kinds(ops)).toEqual(["send:status"]);
  });

  it("folds task, planning, node and job updates into the same line", () => {
    const { ops } = run([
      [{ type: "planning_update", phase: "plan", status: "running", content: null } as RenderFrame, 0],
      [
        {
          type: "task_update",
          task: { title: "Research" },
          step: { title: "Fetch sources" },
          event: "step_started"
        } as RenderFrame,
        10
      ],
      [
        {
          type: "node_update",
          node_id: "n1",
          node_name: "Summarize",
          node_type: "nodetool.text.Summarize",
          status: "running"
        } as RenderFrame,
        20
      ],
      [{ type: "job_update", status: "running" } as RenderFrame, 30]
    ]);
    expect(kinds(ops)).toEqual(["send:status", "edit:status", "edit:status", "edit:status"]);
    expect(ops[1]).toMatchObject({ text: "📋 Fetch sources" });
    expect(ops[2]).toMatchObject({ text: "⚙️ Summarize (running)" });
    expect(ops[3]).toMatchObject({ text: "▶️ job running" });
  });

  it("replaces the status line with the stream message when text starts", () => {
    const { ops, state } = run([
      [tool("web_search"), 0],
      [chunk("Here is what I found"), 100]
    ]);
    expect(kinds(ops)).toEqual(["send:status", "typing", "finalize:status", "send:stream"]);
    expect(ops[2]).toMatchObject({ text: "🔧 web_search", create: false });
    expect(state.statusOpen).toBe(false);
    expect(state.streamOpen).toBe(true);
  });

  it("opens a fresh status message when a tool runs after text has started", () => {
    const { ops } = run([
      [chunk("thinking out loud"), 0],
      [tool("web_search"), 100]
    ]);
    expect(kinds(ops)).toEqual(["typing", "send:stream", "send:status"]);
  });
});

describe("foldFrame — terminal frames", () => {
  it("finalizes the stream on the final message frame", () => {
    const { ops, state } = run([
      [chunk("partial"), 0],
      [finalMessage("partial answer"), 100]
    ]);
    expect(kinds(ops)).toEqual(["typing", "send:stream", "finalize:stream"]);
    expect(ops[2]).toMatchObject({ text: "partial", create: false });
    expect(state.ended).toBe(true);
  });

  it("uses the final message's own text when nothing streamed", () => {
    const { ops } = run([[finalMessage("the whole answer"), 0]]);
    expect(kinds(ops)).toEqual(["finalize:stream"]);
    expect(ops[0]).toMatchObject({ text: "the whole answer", create: true });
  });

  it("ignores the compaction echo and answers with the real reply", () => {
    // The server sends the compaction summary as a `message` frame before the
    // turn streams a word: `role: "user"`, `execution_event_type:
    // "compaction"`. Folded as final it handed the user the summary and
    // swallowed everything after it.
    const compaction = {
      type: "message",
      role: "user",
      execution_event_type: "compaction",
      content: "Summary of the earlier conversation.",
      thread_id: "t1"
    } as RenderFrame;
    const { ops, state } = run([
      [compaction, 0],
      [chunk("the real "), 100],
      [chunk("reply"), 2000],
      [finalMessage("the real reply"), 2100]
    ]);
    expect(kinds(ops)).toEqual(["typing", "send:stream", "edit:stream", "finalize:stream"]);
    const texts = ops.filter((op) => "text" in op).map((op) => (op as { text: string }).text);
    expect(texts.every((text) => !text.includes("Summary of the earlier"))).toBe(true);
    expect(ops[ops.length - 1]).toMatchObject({ text: "the real reply" });
    expect(state.ended).toBe(true);
  });

  it("does not end on the mid-turn tool-call echo", () => {
    // The chat turn echoes each assistant message carrying `tool_calls`, and
    // sends a synthetic card for a subtask's calls. Both are `role:
    // "assistant"` `message` frames with no answer in them.
    const toolCallEcho = {
      type: "message",
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c1", name: "web_search", args: {}, result: null }]
    } as RenderFrame;
    const toolResult = {
      type: "message",
      role: "tool",
      tool_call_id: "c1",
      name: "web_search",
      content: "three results"
    } as RenderFrame;
    const { ops, state } = run([
      [toolCallEcho, 0],
      [toolResult, 10],
      [chunk("found it"), 100],
      [finalMessage("found it"), 200]
    ]);
    expect(state.ended).toBe(true);
    expect(kinds(ops)).toEqual(["typing", "send:stream", "finalize:stream"]);
    expect(ops[ops.length - 1]).toMatchObject({ text: "found it" });
  });

  it("splits an oversized final message across messages", () => {
    const { ops } = run([[finalMessage("word ".repeat(2000)), 0]]);
    expect(ops.length).toBeGreaterThan(2);
    expect(ops.every((op) => op.kind === "finalize")).toBe(true);
    for (const op of ops) {
      if ("text" in op) {
        expect(op.text.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
      }
    }
  });

  it("ends the turn on an error, keeping the text already streamed", () => {
    const { ops, state } = run([
      [chunk("here is the start"), 0],
      [tool("web_search"), 100],
      [{ type: "error", message: "provider refused the request" } as RenderFrame, 200]
    ]);
    expect(kinds(ops)).toEqual([
      "typing",
      "send:stream",
      "send:status",
      "finalize:stream",
      "finalize:status"
    ]);
    expect(ops[4]).toMatchObject({
      text: "⚠️ provider refused the request",
      create: false
    });
    expect(state.ended).toBe(true);
  });

  it("creates a message for an error that arrives before anything is shown", () => {
    const { ops } = run([[{ type: "error", message: "no credits" } as RenderFrame, 0]]);
    expect(ops).toEqual([
      { kind: "finalize", target: "status", text: "⚠️ no credits", parseMode: "html", create: true }
    ]);
  });

  it("renders a stop as a note after finalizing the stream", () => {
    const { ops, state } = run([
      [chunk("half an ans"), 0],
      [{ type: "generation_stopped" } as RenderFrame, 100]
    ]);
    expect(kinds(ops)).toEqual(["typing", "send:stream", "finalize:stream", "stop-note"]);
    expect(state.ended).toBe(true);
  });

  it("renders nothing after the turn has ended", () => {
    const first = run([[finalMessage("done"), 0]]);
    const after = foldFrame(first.state, chunk("late chunk"), 500);
    expect(after.ops).toEqual([]);
  });
});

describe("foldFrame — attachments", () => {
  it("emits an attach op per asset reference in an output_update", () => {
    const frame = {
      type: "output_update",
      node_id: "n1",
      node_name: "Render",
      output_name: "output",
      output_type: "image",
      metadata: {},
      value: {
        images: [
          { uri: "asset://abc", name: "chart.png", content_type: "image/png" },
          "asset://def"
        ]
      }
    } as RenderFrame;
    const { ops } = run([[frame, 0]]);
    expect(ops).toEqual([
      {
        kind: "attach",
        asset: { uri: "asset://abc", name: "chart.png", contentType: "image/png" }
      },
      { kind: "attach", asset: { uri: "asset://def", name: null, contentType: null } }
    ]);
  });

  it("emits nothing for an output_update with no asset reference", () => {
    const frame = {
      type: "output_update",
      node_id: "n1",
      node_name: "Text",
      output_name: "output",
      output_type: "string",
      metadata: {},
      value: "just a string"
    } as RenderFrame;
    expect(run([[frame, 0]]).ops).toEqual([]);
  });
});

describe("foldFrame — replay", () => {
  it("drops a replayed frame whose seq was already applied", () => {
    const script: (readonly [RenderFrame, number])[] = [
      [chunk("one ", { seq: 1 }), 0],
      [tool("web_search"), 10],
      [chunk("two ", { seq: 3 }), 4000]
    ];
    const first = run(script);

    // resume_chat replays from a stale last_seq: seq 1 and 3 come back.
    const replayed = foldFrames(
      first.state,
      [
        { frame: chunk("one ", { seq: 1 }), nowMs: 8000 },
        { frame: chunk("two ", { seq: 3 }), nowMs: 8100 }
      ]
    );
    expect(replayed.ops).toEqual([]);
    expect(replayed.state.carry).toBe(first.state.carry);
  });

  it("applies frames after the last applied seq", () => {
    const first = run([[chunk("one ", { seq: 1 }), 0]]);
    const next = foldFrame(first.state, chunk("two", { seq: 2 }), 5000);
    expect(kinds(next.ops)).toEqual(["edit:stream"]);
    expect(next.state.carry).toBe("one two");
  });

  it("applies unnumbered frames unconditionally", () => {
    const first = run([[chunk("one ", { seq: 5 }), 0]]);
    const next = foldFrame(first.state, chunk("two"), 5000);
    expect(kinds(next.ops)).toEqual(["edit:stream"]);
  });
});
