/**
 * A gated tool called from inside a CodeAct action asks the user, and the
 * program that asked resumes with the answer.
 *
 * The chat turn's action space is sandboxed JavaScript, so a permission prompt
 * is raised from inside a running program. The prompt has to reach the client
 * while that program sits parked, and the program has to pick up where it left
 * off once the answer comes back — otherwise the dialog resolves nothing.
 */
import { describe, it, expect, vi } from "vitest";
import { pack, unpack } from "msgpackr";
import { initTestDb } from "@nodetool-ai/models";
import { BaseProvider } from "@nodetool-ai/runtime";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  private pending: Array<WebSocketReceiveFrame> = [];
  private waiting: Array<(f: WebSocketReceiveFrame) => void> = [];
  async accept() {}
  push(frame: WebSocketReceiveFrame) {
    const next = this.waiting.shift();
    if (next) next(frame);
    else this.pending.push(frame);
  }
  async receive(): Promise<WebSocketReceiveFrame> {
    const queued = this.pending.shift();
    if (queued) return queued;
    return new Promise((resolve) => this.waiting.push(resolve));
  }
  async sendBytes(data: Uint8Array) {
    this.sentBytes.push(data);
  }
  async sendText(data: string) {
    this.sentText.push(data);
  }
  async close() {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const noop = () => ({
  async process() {
    return {};
  }
});

const sentMsgs = (ws: MockWS): Record<string, unknown>[] =>
  ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);

/** Yields one `execute_code` call on the first round, then plain text. */
function codeActProvider(code: string, risk: "low" | "high" = "low") {
  let round = 0;
  return async () =>
    ({
      provider: "mock",
      async *generateMessages() {},
      async *generateMessagesTraced() {
        if (round++ === 0) {
          yield {
            id: "tc1",
            name: "execute_code",
            args: { title: "t", risk, code }
          };
        } else {
          yield { type: "chunk", content: "done", done: true };
        }
      },
      async generateMessageTraced() {
        return {};
      },
      generateMessage: vi.fn(),
      hasToolSupport: async () => true,
      getAvailableLanguageModels: async () => [],
      getAvailableImageModels: async () => [],
      getAvailableVideoModels: async () => [],
      getAvailableTTSModels: async () => [],
      getAvailableASRModels: async () => [],
      getAvailableEmbeddingModels: async () => [],
      getContainerEnv: () => ({}),
      generateLoop: BaseProvider.prototype.generateLoop
    }) as never;
}

/** Poll until `find` returns something, or give up. */
async function waitFor<T>(
  find: () => T | undefined,
  timeoutMs = 20_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = find();
    if (hit !== undefined) return hit;
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("codeact permission prompts", () => {
  it("asks the user from inside a code action and resumes the program", async () => {
    initTestDb();
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: noop,
      resolveProvider: codeActProvider(
        'import { write_file } from "@nodetool-ai/sandbox-nodetool/files";\n' +
          `const r = await write_file({ file_path: "note.txt", content: "hi" });\n` +
          `return { wrote: String(r) };`
      )
    });
    await runner.connect(ws);
    void runner.receiveMessages();
    void runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-approval",
        content: "write a note",
        provider: "mock",
        model: "m",
        permission_mode: "default"
      }
    });

    const request = await waitFor(() =>
      sentMsgs(ws).find((m) => m.type === "tool_approval_request")
    );
    expect(request).toMatchObject({
      thread_id: "t-approval",
      tool_name: "write_file",
      category: "write"
    });

    // Nothing has resumed yet: the program is parked on the answer.
    expect(
      sentMsgs(ws).some((m) => m.type === "message" && m.role === "tool")
    ).toBe(false);

    ws.push({
      type: "websocket.receive",
      bytes: pack({
        type: "tool_approval_response",
        approval_id: request.approval_id,
        decision: "allow"
      })
    } as WebSocketReceiveFrame);

    const observation = await waitFor(() =>
      sentMsgs(ws).find((m) => m.type === "message" && m.role === "tool")
    );
    // The action returned its own value, so the guest picked up after the wait.
    expect(String(observation.content)).toContain('"wrote"');

    await runner.disconnect();
  }, 60_000);

  it("reports a denial to the program as a thrown tool error", async () => {
    initTestDb();
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: noop,
      resolveProvider: codeActProvider(
        'import { write_file } from "@nodetool-ai/sandbox-nodetool/files";\n' +
          `try {\n` +
          `  await write_file({ file_path: "note.txt", content: "hi" });\n` +
          `  return "wrote";\n` +
          `} catch (e) {\n` +
          `  return { denied: e.message };\n` +
          `}`
      )
    });
    await runner.connect(ws);
    void runner.receiveMessages();
    void runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-deny",
        content: "write a note",
        provider: "mock",
        model: "m",
        permission_mode: "default"
      }
    });

    const request = await waitFor(() =>
      sentMsgs(ws).find((m) => m.type === "tool_approval_request")
    );
    ws.push({
      type: "websocket.receive",
      bytes: pack({
        type: "tool_approval_response",
        approval_id: request.approval_id,
        decision: "deny"
      })
    } as WebSocketReceiveFrame);

    const observation = await waitFor(() =>
      sentMsgs(ws).find((m) => m.type === "message" && m.role === "tool")
    );
    expect(String(observation.content)).toContain("denied");

    await runner.disconnect();
  }, 60_000);
  it("asks once for a high-risk action in auto mode, and runs nothing when denied", async () => {
    initTestDb();
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: noop,
      resolveProvider: codeActProvider(
        'import { write_file } from "@nodetool-ai/sandbox-nodetool/files";\n' +
          `await write_file({ file_path: "note.txt", content: "hi" });\n` +
          `return { wrote: true };`,
        "high"
      )
    });
    await runner.connect(ws);
    void runner.receiveMessages();
    void runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-auto-high",
        content: "clean up the notes",
        provider: "mock",
        model: "m",
        permission_mode: "auto"
      }
    });

    // The action itself is what the user is asked about — not the write inside
    // it, which auto mode would wave through.
    const request = await waitFor(() =>
      sentMsgs(ws).find((m) => m.type === "tool_approval_request")
    );
    expect(request).toMatchObject({
      tool_name: "execute_code",
      category: "execute"
    });

    ws.push({
      type: "websocket.receive",
      bytes: pack({
        type: "tool_approval_response",
        approval_id: request.approval_id,
        decision: "deny"
      })
    } as WebSocketReceiveFrame);

    const observation = await waitFor(() =>
      sentMsgs(ws).find((m) => m.type === "message" && m.role === "tool")
    );
    expect(String(observation.content)).toContain("declined");
    expect(String(observation.content)).not.toContain("wrote");
    // The program never ran, so nothing inside it was ever asked about.
    expect(
      sentMsgs(ws).filter((m) => m.type === "tool_approval_request")
    ).toHaveLength(1);

    await runner.disconnect();
  }, 60_000);

  it("runs a low-risk action in auto mode with no prompt", async () => {
    initTestDb();
    const ws = new MockWS();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: noop,
      resolveProvider: codeActProvider(
        'import { write_file } from "@nodetool-ai/sandbox-nodetool/files";\n' +
          `const r = await write_file({ file_path: "note.txt", content: "hi" });\n` +
          `return { wrote: String(r) };`,
        "low"
      )
    });
    await runner.connect(ws);
    void runner.receiveMessages();
    void runner.handleCommand({
      command: "chat_message",
      data: {
        thread_id: "t-auto-low",
        content: "write a note",
        provider: "mock",
        model: "m",
        permission_mode: "auto"
      }
    });

    const observation = await waitFor(() =>
      sentMsgs(ws).find((m) => m.type === "message" && m.role === "tool")
    );
    expect(String(observation.content)).toContain('"wrote"');
    expect(sentMsgs(ws).some((m) => m.type === "tool_approval_request")).toBe(
      false
    );

    await runner.disconnect();
  }, 60_000);
});
