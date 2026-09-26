import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `vi.mock` factories are hoisted above the module body, so the mock socket
 * and the state it records live in `vi.hoisted`.
 */
const { sockets, MockWebSocket } = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");

  type Reply = (
    sent: Record<string, unknown>
  ) => Array<Record<string, unknown>>;

  class MockWebSocket extends EventEmitter {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    static reply: Reply = () => [];

    readyState = MockWebSocket.CONNECTING;
    readonly sent: Array<Record<string, unknown>> = [];

    constructor(
      readonly url: string,
      readonly opts?: { headers?: Record<string, string> }
    ) {
      super();
      sockets.push(this);
      setTimeout(() => {
        this.readyState = MockWebSocket.OPEN;
        this.emit("open");
      }, 0);
    }

    serverSend(event: Record<string, unknown>): void {
      this.emit("message", Buffer.from(JSON.stringify(event)));
    }

    send(payload: string): void {
      const event = JSON.parse(payload) as Record<string, unknown>;
      this.sent.push(event);
      const replies = MockWebSocket.reply(event);
      if (event.type === "session.close") {
        replies.push({
          type: "session.closed",
          reason: "close_requested",
          usage: { seconds: 4 }
        });
      }
      for (const reply of replies) {
        setTimeout(() => this.serverSend(reply), 0);
      }
    }

    close(): void {
      this.readyState = MockWebSocket.CLOSED;
      setTimeout(() => this.emit("close", 1000, Buffer.from("")), 0);
    }
  }

  const sockets: MockWebSocket[] = [];
  return { sockets, MockWebSocket };
});

vi.mock("ws", () => ({ WebSocket: MockWebSocket }));

import { LiveAgentNode, LIVE_SESSIONS_URL } from "../src/nodes/openai.js";

type Emitted = Array<[string, unknown]>;

function streamOf(items: unknown[]) {
  return {
    async *any() {
      for (const item of items) {
        yield ["chunk", item] as [string, unknown];
      }
    },
    async *stream() {},
    async first() {
      return undefined;
    }
  };
}

function collector(emitted: Emitted) {
  return {
    async emit(slot: string, value: unknown) {
      emitted.push([slot, value]);
    },
    complete() {}
  };
}

/** Advance fake timers until the run settles. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  let result: { ok: true; value: T } | { ok: false; error: unknown } = {
    ok: false,
    error: new Error("unsettled")
  };
  promise.then(
    (value) => {
      done = true;
      result = { ok: true, value };
    },
    (error: unknown) => {
      done = true;
      result = { ok: false, error };
    }
  );
  for (let i = 0; i < 5000 && !done; i++) {
    await vi.advanceTimersByTimeAsync(50);
  }
  if (!done) throw new Error("run did not settle");
  if (!result.ok) throw result.error;
  return result.value;
}

const audioChunk = (content: string, sampleRate = 24000) => ({
  type: "chunk",
  content,
  content_type: "audio",
  content_metadata: { sample_rate: sampleRate },
  done: false
});

describe("LiveAgentNode", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.OPENAI_API_KEY = "test-key";
    sockets.length = 0;
    MockWebSocket.reply = (event) =>
      event.type === "session.start"
        ? [{ type: "session.started", session: { id: "sess_1" } }]
        : [];
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it("is registered with the documented metadata", () => {
    expect(LiveAgentNode.nodeType).toBe("openai.agents.LiveAgent");
    expect(LiveAgentNode.isStreamingInput).toBe(true);
    const node = new LiveAgentNode();
    expect(node.model).toBe("gpt-live-1");
    expect(node.voice).toBe("marin");
  });

  it("starts a session, streams audio and text, and closes gracefully", async () => {
    MockWebSocket.reply = (event) => {
      if (event.type === "session.start") {
        return [{ type: "session.started", session: { id: "sess_1" } }];
      }
      if (
        event.type === "session.input_audio.append" &&
        event.audio === "AAAA"
      ) {
        return [
          { type: "session.input_transcript.delta", delta: "Hi there" },
          { type: "session.output_audio.delta", delta: "AQACAA==" },
          { type: "session.output_transcript.delta", delta: "Hello" },
          { type: "session.output_transcript.delta", delta: " back" }
        ];
      }
      return [];
    };

    const node = new LiveAgentNode();
    node.backend_instructions = "Answer briefly.";
    const emitted: Emitted = [];
    await settle(
      node.run(
        streamOf([
          audioChunk("AAAA"),
          { type: "chunk", content: "Order A0042", content_type: "text" },
          { type: "chunk", content: "", content_type: "audio", done: true }
        ]),
        collector(emitted)
      )
    );

    const ws = sockets[0];
    expect(ws.url).toBe(LIVE_SESSIONS_URL);
    expect(ws.opts?.headers?.Authorization).toBe("Bearer test-key");

    expect(ws.sent[0]).toEqual({
      type: "session.start",
      event_id: "event_start",
      session: {
        model: "gpt-live-1",
        instructions: node.instructions,
        audio: {
          format: { type: "audio/pcm", rate: 24000 },
          output: { voice: "marin" }
        },
        delegation: {
          type: "responses",
          responses: {
            model: "gpt-5.6-luna",
            instructions: "Answer briefly.",
            tools: [{ type: "web_search" }],
            tool_choice: "auto"
          }
        }
      }
    });
    expect(ws.sent[1]).toEqual({
      type: "session.input_audio.append",
      audio: "AAAA"
    });
    expect(ws.sent[2]).toEqual({
      type: "response.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Order A0042" }]
      }
    });
    expect(ws.sent[3]).toEqual({ type: "response.create" });
    // Silence keeps the session timeline moving while the reply drains.
    expect(
      ws.sent.filter((e) => e.type === "session.input_audio.append").length
    ).toBeGreaterThan(2);
    expect(ws.sent.at(-1)).toEqual({ type: "session.close" });

    const chunks = emitted
      .filter(([slot]) => slot === "chunk")
      .map(([, value]) => value as Record<string, unknown>);
    expect(chunks.map((c) => [c.content_type, c.content, c.done])).toEqual([
      ["audio", "AQACAA==", false],
      ["text", "Hello", false],
      ["text", " back", false],
      ["text", "", true]
    ]);
    expect(chunks[0].content_metadata).toMatchObject({ sample_rate: 24000 });

    const outputs = Object.fromEntries(emitted.filter(([s]) => s !== "chunk"));
    expect(outputs.text).toBe("Hello back");
    expect(outputs.input_transcript).toBe("Hi there");
    const audio = outputs.audio as Record<string, unknown>;
    expect(audio.type).toBe("audio");
    expect(audio.content_type).toBe("audio/wav");
    const wav = Buffer.from(String(audio.data), "base64");
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect([...wav.subarray(44)]).toEqual([1, 0, 2, 0]);

    // Every emitted slot is a declared output.
    const declared = Object.keys(LiveAgentNode.metadataOutputTypes);
    for (const [slot] of emitted) expect(declared).toContain(slot);
  });

  it("omits backend tools when web search is off", async () => {
    const node = new LiveAgentNode();
    node.web_search = false;
    await settle(node.run(streamOf([]), collector([])));
    const start = sockets[0].sent[0] as {
      session: { delegation: { responses: Record<string, unknown> } };
    };
    expect(start.session.delegation.responses).toEqual({
      model: "gpt-5.6-luna"
    });
  });

  it("keeps the session open while a delegation is running", async () => {
    MockWebSocket.reply = (event) => {
      if (event.type === "session.start") {
        return [
          { type: "session.started", session: { id: "sess_1" } },
          {
            type: "session.delegation.created",
            delegation: {
              id: "item_1",
              type: "delegation",
              target: "responses"
            }
          }
        ];
      }
      return [];
    };

    const node = new LiveAgentNode();
    const run = node.run(streamOf([]), collector([]));
    await vi.advanceTimersByTimeAsync(10_000);
    const ws = sockets[0];
    expect(ws.sent.some((e) => e.type === "session.close")).toBe(false);

    ws.serverSend({
      type: "response.event",
      delegation_id: "item_1",
      event: { type: "response.completed" }
    });
    await settle(run);
    expect(ws.sent.at(-1)).toEqual({ type: "session.close" });
  });

  it("rejects when the session fails to start", async () => {
    MockWebSocket.reply = (event) =>
      event.type === "session.start"
        ? [{ type: "error", error: { message: "model not found" } }]
        : [];

    const node = new LiveAgentNode();
    await expect(settle(node.run(streamOf([]), collector([])))).rejects.toThrow(
      "OpenAI GPT-Live error: model not found"
    );
  });

  it("rejects audio at a sample rate the session was not started with", async () => {
    const node = new LiveAgentNode();
    await expect(
      settle(node.run(streamOf([audioChunk("AAAA", 16000)]), collector([])))
    ).rejects.toThrow("GPT-Live expects 24000 Hz PCM16 audio, got 16000 Hz");
  });

  it("requires a backend model", async () => {
    const node = new LiveAgentNode();
    node.backend_model = "  ";
    await expect(node.run(streamOf([]), collector([]))).rejects.toThrow(
      "Backend Model is required"
    );
  });
});
