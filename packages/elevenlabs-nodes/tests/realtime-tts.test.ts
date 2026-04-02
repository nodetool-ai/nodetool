import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    }, 0);
  }

  send(payload: string): void {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    sentMessages.push(parsed);

    // Respond to EOS (empty text) with isFinal
    if (parsed.text === "") {
      lifecycleEvents.push("eos");
      setTimeout(() => {
        this.emit("message", Buffer.from(JSON.stringify({ isFinal: true })));
      }, 0);
      return;
    }

    // Respond to non-init text with an audio chunk
    const text = parsed.text as string | undefined;
    if (text && text.trim() && text !== " ") {
      setTimeout(() => {
        this.emit(
          "message",
          Buffer.from(
            JSON.stringify({
              audio: "ZmFrZS1hdWRpbw==", // base64: "fake-audio"
              isFinal: false
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

vi.mock("ws", () => ({
  WebSocket: MockWebSocket
}));

import { RealtimeTextToSpeechNode } from "../src/nodes/realtime-tts.js";

describe("RealtimeTextToSpeechNode", () => {
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

  it("sends text input and receives audio chunks", async () => {
    const node = new RealtimeTextToSpeechNode();
    const emitted: Array<Record<string, unknown>> = [];

    await node.run(
      {
        async *any() {
          yield [
            "chunk",
            {
              content: "Hello world",
              content_type: "text",
              done: false
            }
          ] as [string, unknown];
          yield [
            "chunk",
            {
              content: "",
              content_type: "text",
              done: true
            }
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

    // Should have sent init message, text content, and EOS
    expect(sentMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: " " }), // init
        expect.objectContaining({ text: "Hello world " }), // content + trailing space
        expect.objectContaining({ text: "" }) // EOS
      ])
    );

    const audioChunks = emitted.filter((c) => !c.done);
    const finalChunk = emitted.find((c) => c.done === true);

    expect(audioChunks.length).toBeGreaterThan(0);
    expect(audioChunks[0]).toMatchObject({
      type: "chunk",
      done: false,
      content_type: "audio"
    });
    expect(finalChunk).toMatchObject({
      type: "chunk",
      content: "",
      done: true,
      content_type: "audio"
    });
  });

  it("throws when API key is missing", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const node = new RealtimeTextToSpeechNode();

    await expect(
      node.run(
        {
          async *any() {},
          async *stream() {},
          async first() {
            return undefined;
          }
        },
        {
          async emit() {},
          complete() {}
        }
      )
    ).rejects.toThrow("ELEVENLABS_API_KEY");
  });

  it("throws when voice is unknown", async () => {
    const node = new RealtimeTextToSpeechNode();
    node.voice = "UnknownVoice";

    await expect(
      node.run(
        {
          async *any() {},
          async *stream() {},
          async first() {
            return undefined;
          }
        },
        {
          async emit() {},
          complete() {}
        }
      )
    ).rejects.toThrow("Unknown voice");
  });

  it("includes voice_settings in the init message", async () => {
    const node = new RealtimeTextToSpeechNode();
    node.stability = 0.9;
    node.similarity_boost = 0.6;

    await node.run(
      {
        async *any() {
          yield ["chunk", { content: "", done: true }] as [string, unknown];
        },
        async *stream() {},
        async first() {
          return undefined;
        }
      },
      {
        async emit() {},
        complete() {}
      }
    );

    const initMsg = sentMessages[0];
    expect(initMsg).toMatchObject({
      text: " ",
      voice_settings: expect.objectContaining({
        stability: 0.9,
        similarity_boost: 0.6
      })
    });
  });
});
