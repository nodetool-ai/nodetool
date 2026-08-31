/**
 * A chat turn needs a model. Without one the runner used to fall back to a
 * built-in default and die in provider resolution — after persisting the user's
 * message. It now rejects the turn with guidance instead.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { unpack } from "msgpackr";
import { initTestDb, Message } from "@nodetool-ai/models";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  async accept() {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array) {
    this.sentBytes.push(data);
  }
  async sendText() {}
  async close() {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const noopExecutor = () => ({
  async process() {
    return {};
  }
});

function sentMsgs(ws: MockWS): Record<string, unknown>[] {
  return ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
}

async function sendChat(
  data: Record<string, unknown>
): Promise<{ ws: MockWS; resolveProvider: ReturnType<typeof vi.fn> }> {
  const resolveProvider = vi.fn();
  const runner = new WebSocketClientSession({
    resolveExecutor: noopExecutor,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolveProvider: resolveProvider as any
  });
  const ws = new MockWS();
  await runner.connect(ws);
  await runner.handleCommand({ command: "chat_message", data });
  await vi.waitFor(() => {
    expect(sentMsgs(ws).some((m) => m.type === "error")).toBe(true);
  });
  return { ws, resolveProvider };
}

describe("chat_message without a selected model", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("rejects a chat turn whose provider is the unset sentinel", async () => {
    const threadId = `t-nomodel-${Date.now()}-${Math.random()}`;
    const { ws, resolveProvider } = await sendChat({
      thread_id: threadId,
      content: "hi",
      provider: "empty",
      model: "gpt-oss:20b"
    });

    const error = sentMsgs(ws).find((m) => m.type === "error")!;
    expect(error.message).toMatch(/No model selected/i);
    expect(error.message).toMatch(/model menu/i);
    expect(error.thread_id).toBe(threadId);
    expect(resolveProvider).not.toHaveBeenCalled();

    // The turn never happened, so the user message is not persisted.
    const [rows] = await Message.paginate(threadId, { limit: 10 });
    expect(rows).toHaveLength(0);
  });

  it("rejects a chat turn with no model at all", async () => {
    const threadId = `t-nomodel2-${Date.now()}-${Math.random()}`;
    const { ws } = await sendChat({ thread_id: threadId, content: "hi" });
    const error = sentMsgs(ws).find((m) => m.type === "error")!;
    expect(error.message).toMatch(/No model selected/i);
  });

  it("rejects a media generation with no model picked", async () => {
    const threadId = `t-nomedia-${Date.now()}-${Math.random()}`;
    const { ws } = await sendChat({
      thread_id: threadId,
      content: "a red fox",
      provider: "empty",
      model: "gpt-oss:20b",
      media_generation: { mode: "image", provider: null, model: null }
    });
    const error = sentMsgs(ws).find((m) => m.type === "error")!;
    expect(error.message).toMatch(/No image model selected/i);
  });
});
