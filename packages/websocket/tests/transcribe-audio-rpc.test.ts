/**
 * Integration tests for the `transcribe_audio` RPC on the unified WebSocket.
 *
 * Drives the runner with a MockWebSocket and a fake ASR provider, asserting
 * that a stored audio asset is transcribed to word-level caption timing
 * (seconds → ms), correlated by `request_id` in a single `rpc_response` frame.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { unpack } from "msgpackr";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";
import type { ASRResult } from "@nodetool-ai/runtime";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Asset: {
      ...actual.Asset,
      find: vi.fn()
    }
  };
});

vi.mock("../src/lib/storage.js", async (orig) => {
  const actual = await orig<typeof import("../src/lib/storage.js")>();
  return {
    ...actual,
    getAssetAdapter: vi.fn(() => ({
      uriForKey: (key: string) => `mem://${key}`,
      retrieve: vi.fn(async () => new Uint8Array([1, 2, 3, 4]))
    }))
  };
});

import { Asset } from "@nodetool-ai/models";

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: Array<WebSocketReceiveFrame> = [];

  async accept(): Promise<void> {
    return;
  }
  async receive(): Promise<WebSocketReceiveFrame> {
    const next = this.queue.shift();
    if (!next) return { type: "websocket.disconnect" };
    return next;
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }
  async sendText(data: string): Promise<void> {
    this.sentText.push(data);
  }
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

interface AsrCall {
  audio: Uint8Array;
  model: string;
  word_timestamps?: boolean;
}

/** Records the args it was called with and returns canned word chunks. */
function makeFakeAsrProvider(opts: {
  result: ASRResult;
  calls: AsrCall[];
}) {
  return {
    provider: "fake",
    async automaticSpeechRecognition(args: AsrCall): Promise<ASRResult> {
      opts.calls.push(args);
      return opts.result;
    }
  };
}

async function makeRunner(
  ws: MockWebSocket,
  resolveProvider: UnifiedWebSocketRunnerOptionsResolveProvider
): Promise<UnifiedWebSocketRunner> {
  const runner = new UnifiedWebSocketRunner({
    resolveExecutor: () => ({
      async process() {
        return {};
      }
    }),
    resolveProvider,
    nodeRegistry: {
      listMetadata: () => [],
      has: () => false,
      resolve: () => ({ async process() { return {}; } }),
      getMetadata: () => undefined,
      createNodeValidator: () => () => undefined
    } as never,
    apiOptions: {
      metadataRoots: [],
      registry: {} as never,
      storage: {}
    } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => true
  });
  await runner.connect(ws);
  return runner;
}

type UnifiedWebSocketRunnerOptionsResolveProvider = ConstructorParameters<
  typeof UnifiedWebSocketRunner
>[0]["resolveProvider"];

function decodeFrame(ws: MockWebSocket, idx: number): Record<string, unknown> {
  if (ws.sentBytes[idx]) {
    return unpack(ws.sentBytes[idx]) as Record<string, unknown>;
  }
  return JSON.parse(ws.sentText[idx]) as Record<string, unknown>;
}

async function runOne(
  ws: MockWebSocket,
  runner: UnifiedWebSocketRunner,
  frame: Record<string, unknown>
): Promise<Record<string, unknown>> {
  ws.queue.push({ type: "websocket.message", text: JSON.stringify(frame) });
  ws.queue.push({ type: "websocket.disconnect" });
  await runner.receiveMessages();
  return decodeFrame(ws, 0);
}

describe("transcribe_audio RPC", () => {
  let ws: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    ws = new MockWebSocket();
    (Asset.find as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "audio-1",
      content_type: "audio/wav"
    });
  });

  afterEach(() => {
    ws.queue.length = 0;
  });

  it("returns word-level timing converted from seconds to ms", async () => {
    const calls: AsrCall[] = [];
    const provider = makeFakeAsrProvider({
      calls,
      result: {
        text: "hello world",
        chunks: [
          { timestamp: [0, 0.5], text: "hello" },
          { timestamp: [0.5, 1.25], text: " world " },
          // Whitespace-only chunk trims to empty and must be dropped.
          { timestamp: [1.25, 1.3], text: "   " }
        ]
      }
    });
    const runner = await makeRunner(ws, async () => provider as never);

    const out = await runOne(ws, runner, {
      command: "transcribe_audio",
      request_id: "t-1",
      data: { provider: "fake", model: "whisper-1", asset_id: "audio-1" }
    });

    expect(out.type).toBe("rpc_response");
    expect(out.request_id).toBe("t-1");
    expect(out.command).toBe("transcribe_audio");
    expect(out.error).toBeUndefined();
    expect(out.result).toEqual({
      text: "hello world",
      words: [
        { word: "hello", startMs: 0, endMs: 500 },
        { word: "world", startMs: 500, endMs: 1250 }
      ]
    });

    await runner.disconnect();
  });

  it("requests word timestamps and forwards the asset bytes", async () => {
    const calls: AsrCall[] = [];
    const provider = makeFakeAsrProvider({
      calls,
      result: { text: "", chunks: [] }
    });
    const runner = await makeRunner(ws, async () => provider as never);

    await runOne(ws, runner, {
      command: "transcribe_audio",
      request_id: "t-2",
      data: { provider: "fake", model: "whisper-1", asset_id: "audio-1" }
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].word_timestamps).toBe(true);
    expect(calls[0].model).toBe("whisper-1");
    expect(Array.from(calls[0].audio)).toEqual([1, 2, 3, 4]);

    await runner.disconnect();
  });

  it("returns an empty word list when the provider finds no words", async () => {
    const provider = makeFakeAsrProvider({
      calls: [],
      result: { text: "" }
    });
    const runner = await makeRunner(ws, async () => provider as never);

    const out = await runOne(ws, runner, {
      command: "transcribe_audio",
      request_id: "t-3",
      data: { provider: "fake", model: "whisper-1", asset_id: "audio-1" }
    });

    expect(out.result).toEqual({ text: "", words: [] });

    await runner.disconnect();
  });

  it("errors when asset_id is missing", async () => {
    const provider = makeFakeAsrProvider({ calls: [], result: { text: "" } });
    const runner = await makeRunner(ws, async () => provider as never);

    const out = await runOne(ws, runner, {
      command: "transcribe_audio",
      request_id: "t-4",
      data: { provider: "fake", model: "whisper-1" }
    });

    expect(out.type).toBe("rpc_response");
    const error = out.error as { message?: string } | undefined;
    expect(error?.message).toMatch(/asset_id is required/);

    await runner.disconnect();
  });

  it("errors when the audio asset cannot be found", async () => {
    (Asset.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const provider = makeFakeAsrProvider({ calls: [], result: { text: "" } });
    const runner = await makeRunner(ws, async () => provider as never);

    const out = await runOne(ws, runner, {
      command: "transcribe_audio",
      request_id: "t-5",
      data: { provider: "fake", model: "whisper-1", asset_id: "missing" }
    });

    const error = out.error as { message?: string } | undefined;
    expect(error?.message).toMatch(/Audio asset not found/);

    await runner.disconnect();
  });
});
