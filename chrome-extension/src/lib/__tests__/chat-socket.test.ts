import { unpack } from "msgpackr";
import { describe, expect, it } from "vitest";

import { ChatSocket } from "../chat-socket.js";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instance: FakeWebSocket | null = null;

  readonly sent: Array<string | Uint8Array> = [];
  readyState = FakeWebSocket.CONNECTING;
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instance = this;
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  receive(data: string | Uint8Array): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe("ChatSocket", () => {
  it("sends Chrome page context on an agent-enabled turn", () => {
    const chat = new ChatSocket({
      url: "ws://localhost:7777/ws",
      WebSocket: FakeWebSocket as unknown as typeof WebSocket
    });
    chat.connect();
    const socket = FakeWebSocket.instance;
    if (!socket) throw new Error("WebSocket was not constructed");
    socket.open();

    chat.send({
      threadId: "thread-1",
      text: "What page am I viewing?",
      agentMode: true,
      systemPrompt: "Use the extension browser transport."
    });

    const raw = socket.sent[0];
    const command = unpack(raw as Uint8Array) as {
      data: { agent_mode: boolean; system_prompt: string };
    };
    expect(command.data.agent_mode).toBe(true);
    expect(command.data.system_prompt).toBe(
      "Use the extension browser transport."
    );
  });

  it("dispatches approval requests and sends each response shape", () => {
    const chat = new ChatSocket({
      url: "ws://localhost:7777/ws",
      WebSocket: FakeWebSocket as unknown as typeof WebSocket
    });
    const received: string[] = [];
    chat.on("tool_approval_request", (event) =>
      received.push(event.approval_id)
    );
    chat.on("plan_approval_request", (event) =>
      received.push(event.approval_id)
    );
    chat.on("secret_request", (event) => received.push(event.approval_id));
    chat.connect();
    const socket = FakeWebSocket.instance;
    if (!socket) throw new Error("WebSocket was not constructed");
    socket.open();

    socket.receive(
      JSON.stringify({
        type: "tool_approval_request",
        thread_id: "thread-1",
        approval_id: "tool-1",
        tool_name: "write_file",
        category: "write",
        message: "Write the file",
        args: {}
      })
    );
    socket.onmessage?.({
      data: JSON.stringify({
        type: "plan_approval_request",
        thread_id: "thread-1",
        approval_id: "plan-1",
        plan: { title: "Ship it", tasks: [] }
      })
    } as MessageEvent);
    socket.onmessage?.({
      data: JSON.stringify({
        type: "secret_request",
        thread_id: "thread-1",
        approval_id: "secret-1",
        key: "API_KEY",
        description: null,
        reason: null,
        help_url: null
      })
    } as MessageEvent);

    chat.respondToToolApproval("tool-1", "allow");
    chat.respondToPlanApproval("plan-1", "reject", "Revise it");
    chat.respondToSecretRequest("secret-1", "declined");

    expect(received).toEqual(["tool-1", "plan-1", "secret-1"]);
    expect(
      socket.sent.slice(-3).map((frame) => unpack(frame as Uint8Array))
    ).toEqual([
      {
        type: "tool_approval_response",
        approval_id: "tool-1",
        decision: "allow"
      },
      {
        type: "plan_approval_response",
        approval_id: "plan-1",
        decision: "reject",
        feedback: "Revise it"
      },
      {
        type: "secret_request_response",
        approval_id: "secret-1",
        status: "declined"
      }
    ]);
  });
});
