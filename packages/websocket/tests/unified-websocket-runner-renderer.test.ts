import { describe, expect, it } from "vitest";
import { unpack } from "msgpackr";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/unified-websocket-runner.js";
import { FrontendRendererRegistry } from "../src/frontend-renderer-registry.js";

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sent: Uint8Array[] = [];
  queue: WebSocketReceiveFrame[] = [];
  failSend = false;
  async accept(): Promise<void> {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    if (this.failSend) throw new Error("send failed");
    this.sent.push(data);
  }
  async sendText(): Promise<void> {}
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

describe("UnifiedWebSocketRunner renderer transport", () => {
  it("registers, receives renderer results, and unregisters on disconnect", async () => {
    const registry = new FrontendRendererRegistry();
    const socket = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ process: async () => ({}) }),
      frontendRendererRegistry: registry
    });

    await runner.connect(socket, "alice");
    const registered = unpack(socket.sent[0]) as Record<string, unknown>;
    const rendererId = registered.renderer_id as string;
    expect(registered.type).toBe("renderer_registered");

    socket.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "client_tools_manifest",
        tools: [{ name: "ui_ping" }]
      })
    });
    await runner.receiveMessages();
    expect(registry.list("alice")[0].renderer_id).toBe(rendererId);

    const call = runner.executeRendererTool(rendererId, {
      tool_call_id: "call-1",
      name: "ui_ping",
      args: { value: 1 }
    });
    await Promise.resolve();
    const outbound = unpack(socket.sent[1]) as Record<string, unknown>;
    expect(outbound).toMatchObject({
      type: "renderer_tool_call",
      renderer_id: rendererId,
      tool_call_id: "call-1",
      name: "ui_ping"
    });

    socket.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "renderer_tool_result",
        renderer_id: rendererId,
        tool_call_id: "call-1",
        ok: true,
        result: { value: 2 }
      })
    });
    await runner.receiveMessages();
    await expect(call).resolves.toMatchObject({
      ok: true,
      result: { value: 2 }
    });

    await runner.disconnect();
    expect(registry.list("alice")).toEqual([]);
  });

  it("unregisters when the registration response cannot be sent", async () => {
    const registry = new FrontendRendererRegistry();
    const socket = new MockWebSocket();
    socket.failSend = true;
    const runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ process: async () => ({}) }),
      frontendRendererRegistry: registry
    });

    await expect(runner.run(socket)).rejects.toThrow("send failed");
    expect(registry.size).toBe(0);
  });

  it("does not select a renderer because it sent a heartbeat", async () => {
    const registry = new FrontendRendererRegistry();
    const firstSocket = new MockWebSocket();
    const secondSocket = new MockWebSocket();
    const firstRunner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ process: async () => ({}) }),
      frontendRendererRegistry: registry
    });
    const secondRunner = new UnifiedWebSocketRunner({
      resolveExecutor: () => ({ process: async () => ({}) }),
      frontendRendererRegistry: registry
    });

    await firstRunner.connect(firstSocket, "alice");
    firstSocket.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "client_tools_manifest",
        tools: [{ name: "ui_ping" }]
      })
    });
    await firstRunner.receiveMessages();

    await secondRunner.connect(secondSocket, "alice");
    secondSocket.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "client_tools_manifest",
        tools: [{ name: "ui_ping" }]
      })
    });
    await secondRunner.receiveMessages();
    const secondRendererId = registry.list("alice")[0].renderer_id;

    firstSocket.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ type: "pong", ts: Date.now() / 1000 })
    });
    await firstRunner.receiveMessages();

    expect(registry.list("alice")[0].renderer_id).toBe(secondRendererId);
    await firstRunner.disconnect();
    await secondRunner.disconnect();
  });
});
