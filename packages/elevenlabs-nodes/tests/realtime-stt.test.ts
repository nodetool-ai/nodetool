import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `vi.mock` factories are hoisted above the module body, and the `ws` mock
 * is pulled in while the runtime's python-websocket-bridge is evaluated —
 * before this file's own declarations initialize. So the mock and the state
 * it records live in `vi.hoisted`, which runs first by construction.
 */
const { sentMessages, lifecycleEvents, MockWebSocket } = await vi.hoisted(
  async () => {
    const { EventEmitter } = await import("node:events");

    const sentMessages: Array<Record<string, unknown>> = [];
    const lifecycleEvents: string[] = [];

    class MockWebSocket extends EventEmitter {
      static readonly OPEN = 1;
      static readonly CLOSED = 3;

      readyState = 0;

      constructor(_url: string, _opts?: Record<string, unknown>) {
        super();

        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this.emit("open");
          setTimeout(() => {
            this.emit(
              "message",
              Buffer.from(JSON.stringify({ message_type: "session_started" }))
            );
          }, 0);
        }, 0);
      }

      send(payload: string): void {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        sentMessages.push(parsed);
        if (parsed.commit === true) {
          lifecycleEvents.push("commit");
          setTimeout(() => {
            this.emit(
              "message",
              Buffer.from(
                JSON.stringify({
                  message_type: "committed_transcript",
                  text: "final transcript"
                })
              )
            );
          }, 0);
        }
      }

      close(): void {
        lifecycleEvents.push("close");
        this.readyState = MockWebSocket.CLOSED;
        setTimeout(() => {
          this.emit("close", 1000, Buffer.from(""));
        }, 0);
      }
    }

    return { sentMessages, lifecycleEvents, MockWebSocket };
  }
);

vi.mock("ws", () => ({
  WebSocket: MockWebSocket
}));

import { RealtimeSpeechToTextNode } from "../src/nodes/realtime-stt.js";

describe("RealtimeSpeechToTextNode", () => {
  const originalApiKey = process.env.ELEVENLABS_API_KEY;

  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    sentMessages.length = 0;
    lifecycleEvents.length = 0;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.ELEVENLABS_API_KEY;
    } else {
      process.env.ELEVENLABS_API_KEY = originalApiKey;
    }
  });

  it("flushes the final segment before closing", async () => {
    const node = new RealtimeSpeechToTextNode();
    const emitted: Array<Record<string, unknown>> = [];

    await node.run(
      {
        async *any() {
          yield [
            "chunk",
            { content: "YWJj", content_type: "audio", done: false }
          ] as [string, unknown];
          yield [
            "chunk",
            { content: "", content_type: "audio", done: true }
          ] as [string, unknown];
        },
        async *stream() {},
        async first() {
          return undefined;
        }
      },
      {
        async emit(_slot: string, value: unknown) {
          emitted.push(value as Record<string, unknown>);
        },
        complete() {}
      }
    );

    expect(sentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message_type: "input_audio_chunk",
          audio_base_64: "YWJj",
          commit: false
        }),
        expect.objectContaining({
          message_type: "input_audio_chunk",
          audio_base_64: "",
          commit: true
        })
      ])
    );
    expect(lifecycleEvents).toEqual(["commit", "close"]);
    expect(emitted).toEqual([
      {
        type: "chunk",
        content: "final transcript",
        done: false,
        content_type: "text"
      },
      {
        type: "chunk",
        content: "",
        done: true,
        content_type: "text"
      }
    ]);
  });
});
