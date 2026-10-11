/**
 * The `cancel_generation` command: a timeline Cancel reaches the provider call
 * instead of only clearing the clip, so Cancel then Generate bills once.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { unpack } from "msgpackr";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import type { TextToImageParams } from "@nodetool-ai/runtime";

vi.mock("../src/lib/thumbnail.js", () => ({
  storeAssetWithThumbnail: vi.fn(async () => undefined)
}));

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Prediction: Object.assign(actual.Prediction, {
      byRequestIds: vi.fn(async () => [])
    })
  };
});

vi.mock("@nodetool-ai/agents", async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return {
    ...actual,
    cancelGenerationForUser: vi.fn(async () => ({
      status: "not_running",
      durable: false
    }))
  };
});

import { Prediction } from "@nodetool-ai/models";
import * as agents from "@nodetool-ai/agents";

const cancelGenerationForUser = (
  agents as unknown as {
    cancelGenerationForUser: ReturnType<typeof vi.fn>;
  }
).cancelGenerationForUser;
const byRequestIds = Prediction.byRequestIds as unknown as ReturnType<
  typeof vi.fn
>;

/** A socket whose frames are pushed while the receive loop is running. */
class LiveSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sent: Record<string, unknown>[] = [];
  private waiting: Array<(frame: WebSocketReceiveFrame) => void> = [];
  private queue: WebSocketReceiveFrame[] = [];

  push(frame: Record<string, unknown>): void {
    this.deliver({ type: "websocket.message", text: JSON.stringify(frame) });
  }
  hangUp(): void {
    this.deliver({ type: "websocket.disconnect" });
  }
  private deliver(frame: WebSocketReceiveFrame): void {
    const next = this.waiting.shift();
    if (next) next(frame);
    else this.queue.push(frame);
  }
  reply(requestId: string): Record<string, unknown> | undefined {
    return this.sent.find(
      (frame) => frame.type === "rpc_response" && frame.request_id === requestId
    );
  }
  async accept(): Promise<void> {}
  receive(): Promise<WebSocketReceiveFrame> {
    const next = this.queue.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.sent.push(unpack(data) as Record<string, unknown>);
  }
  async sendText(data: string): Promise<void> {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

async function connect(
  ws: LiveSocket,
  provider: Record<string, unknown>
): Promise<WebSocketClientSession> {
  const runner = new WebSocketClientSession({
    resolveExecutor: () => ({
      async process() {
        return {};
      }
    }),
    resolveProvider: async () => provider as never
  } as ConstructorParameters<typeof WebSocketClientSession>[0]);
  await runner.connect(ws);
  return runner;
}

const generate = (requestId: string) => ({
  command: "generate_media",
  request_id: requestId,
  data: { mode: "image", provider: "fake", model: "m", prompt: "a cat" }
});

describe("cancel_generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    byRequestIds.mockResolvedValue([]);
  });

  it("aborts a generate_media call still running on this connection", async () => {
    let seen: AbortSignal | undefined;
    const provider = {
      provider: "fake",
      textToImages: (params: TextToImageParams) =>
        new Promise<Uint8Array[]>((_resolve, reject) => {
          seen = params.signal ?? undefined;
          params.signal?.addEventListener("abort", () =>
            reject(new Error("aborted by provider"))
          );
        })
    };
    const ws = new LiveSocket();
    const runner = await connect(ws, provider);
    const loop = runner.receiveMessages();

    ws.push(generate("g-1"));
    await vi.waitFor(() => expect(seen).toBeDefined());
    ws.push({
      command: "cancel_generation",
      request_id: "c-1",
      data: { request_ids: ["g-1"] }
    });

    await vi.waitFor(() => expect(ws.reply("c-1")).toBeDefined());
    expect(ws.reply("c-1")?.result).toEqual({
      aborted: ["g-1"],
      generations: []
    });
    expect(seen?.aborted).toBe(true);
    await vi.waitFor(() => expect(ws.reply("g-1")?.error).toBeDefined());

    ws.hangUp();
    await loop;
    await runner.disconnect();
  });

  it("cancels the rows a request opened on a connection that is gone", async () => {
    byRequestIds.mockResolvedValue([
      { id: "gen-1", request_id: "g-old" } as never
    ]);
    cancelGenerationForUser.mockResolvedValue({
      status: "cancellation_requested"
    });
    const ws = new LiveSocket();
    const runner = await connect(ws, { provider: "fake" });
    const loop = runner.receiveMessages();

    ws.push({
      command: "cancel_generation",
      request_id: "c-2",
      data: { request_ids: ["g-old"] }
    });
    await vi.waitFor(() => expect(ws.reply("c-2")).toBeDefined());

    expect(byRequestIds).toHaveBeenCalledWith("1", ["g-old"]);
    expect(cancelGenerationForUser).toHaveBeenCalledWith("gen-1", "1");
    expect(ws.reply("c-2")?.result).toEqual({
      aborted: [],
      generations: [
        {
          request_id: "g-old",
          generation_id: "gen-1",
          status: "cancellation_requested"
        }
      ]
    });

    ws.hangUp();
    await loop;
    await runner.disconnect();
  });

  it("answers the generate_media reply before the connection closes", async () => {
    const provider = {
      provider: "fake",
      textToImages: async () => [new Uint8Array([0x89, 0x50, 0x4e, 0x47])]
    };
    const ws = new LiveSocket();
    const runner = await connect(ws, provider);
    const loop = runner.receiveMessages();

    ws.push(generate("g-2"));
    ws.hangUp();
    await loop;

    expect(ws.reply("g-2")).toBeDefined();
    await runner.disconnect();
  });
});
