jest.mock("../../../stores/BASE_URL", () => ({
  AGENT_WS_URL: "ws://localhost:7777/ws/agent"
}));

jest.mock("../../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

import { AgentSocketClient, getAgentSocketClient } from "../AgentSocketClient";

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });
}

const OriginalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  (globalThis as Record<string, unknown>).WebSocket = MockWebSocket;
});

afterEach(() => {
  globalThis.WebSocket = OriginalWebSocket;
  jest.restoreAllMocks();
});

function flushMicrotasks(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function connectClient(
  client: AgentSocketClient
): Promise<MockWebSocket> {
  const p = client.connect();
  // buildAuthenticatedUrl is async (dynamic import + getSession), so we need
  // to flush multiple microtask rounds before the WebSocket constructor runs.
  await flushMicrotasks();
  const ws = (client as unknown as { socket: MockWebSocket }).socket;
  if (!ws) throw new Error("Socket not created after flush");
  ws.onopen?.();
  await p;
  return ws;
}

describe("AgentSocketClient", () => {
  describe("construction and state", () => {
    it("starts disconnected", () => {
      const client = new AgentSocketClient("ws://test");
      expect(client.isConnected()).toBe(false);
    });

    it("uses default URL when none is provided", () => {
      const client = new AgentSocketClient();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe("disconnect", () => {
    it("closes socket and rejects pending requests", async () => {
      const client = new AgentSocketClient("ws://test");
      const ws = await connectClient(client);

      client.disconnect();
      expect(ws.close).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it("is a no-op when already disconnected", () => {
      const client = new AgentSocketClient("ws://test");
      expect(() => client.disconnect()).not.toThrow();
    });
  });

  describe("event emission", () => {
    it("emits open when socket connects", async () => {
      const client = new AgentSocketClient("ws://test");
      const openSpy = jest.fn();
      client.on("open", openSpy);
      await connectClient(client);
      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it("emits close when socket closes after connect", async () => {
      jest.useFakeTimers();
      const client = new AgentSocketClient("ws://test");
      const closeSpy = jest.fn();
      client.on("close", closeSpy);

      const p = client.connect();
      // Advance so the async import chain resolves
      await jest.advanceTimersByTimeAsync(10);
      const ws = (client as unknown as { socket: MockWebSocket }).socket;
      ws?.onopen?.();
      await p;

      client.disconnect();
      ws?.onclose?.();

      expect(closeSpy).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });

  describe("handleMessage", () => {
    let client: AgentSocketClient;
    let ws: MockWebSocket;

    beforeEach(async () => {
      client = new AgentSocketClient("ws://test");
      ws = await connectClient(client);
    });

    afterEach(() => {
      client.disconnect();
    });

    it("emits stream for agent_stream_message", () => {
      const spy = jest.fn();
      client.on("stream", spy);

      ws.onmessage?.({
        data: JSON.stringify({
          type: "agent_stream_message",
          session_id: "s1",
          message: { text: "hello" },
          done: false
        })
      });

      expect(spy).toHaveBeenCalledWith({
        sessionId: "s1",
        message: { text: "hello" },
        done: false
      });
    });

    it("emits toolsManifestRequest for manifest requests", () => {
      const spy = jest.fn();
      client.on("toolsManifestRequest", spy);

      ws.onmessage?.({
        data: JSON.stringify({
          type: "tools_manifest_request",
          request_id: "r1",
          session_id: "s1"
        })
      });

      expect(spy).toHaveBeenCalledWith({
        requestId: "r1",
        sessionId: "s1"
      });
    });

    it("emits toolCallRequest for tool call requests", () => {
      const spy = jest.fn();
      client.on("toolCallRequest", spy);

      ws.onmessage?.({
        data: JSON.stringify({
          type: "tool_call_request",
          request_id: "r2",
          session_id: "s2",
          tool_call_id: "tc1",
          name: "ui_copy",
          args: { text: "hello" }
        })
      });

      expect(spy).toHaveBeenCalledWith({
        requestId: "r2",
        sessionId: "s2",
        toolCallId: "tc1",
        name: "ui_copy",
        args: { text: "hello" }
      });
    });

    it("emits toolCallAbort for abort messages", () => {
      const spy = jest.fn();
      client.on("toolCallAbort", spy);

      ws.onmessage?.({
        data: JSON.stringify({
          type: "tool_call_abort",
          session_id: "s3"
        })
      });

      expect(spy).toHaveBeenCalledWith({ sessionId: "s3" });
    });

    it("resolves pending request on response message", () => {
      const pending = (
        client as unknown as { pending: Map<string, unknown> }
      ).pending;
      const resolve = jest.fn();
      const timer = setTimeout(() => {}, 30000);
      pending.set("req-1", { resolve, reject: jest.fn(), timer });

      ws.onmessage?.({
        data: JSON.stringify({
          type: "response",
          request_id: "req-1",
          data: { result: "ok" }
        })
      });

      expect(resolve).toHaveBeenCalledWith({ result: "ok" });
      expect(pending.has("req-1")).toBe(false);
      clearTimeout(timer);
    });

    it("rejects pending request on error response", () => {
      const pending = (
        client as unknown as { pending: Map<string, unknown> }
      ).pending;
      const reject = jest.fn();
      const timer = setTimeout(() => {}, 30000);
      pending.set("req-2", { resolve: jest.fn(), reject, timer });

      ws.onmessage?.({
        data: JSON.stringify({
          type: "response",
          request_id: "req-2",
          error: "something failed"
        })
      });

      expect(reject).toHaveBeenCalledWith(expect.any(Error));
      expect(reject.mock.calls[0][0].message).toBe("something failed");
      clearTimeout(timer);
    });

    it("ignores non-string messages", () => {
      const spy = jest.fn();
      client.on("stream", spy);
      ws.onmessage?.({ data: 12345 });
      expect(spy).not.toHaveBeenCalled();
    });

    it("ignores malformed JSON", () => {
      const spy = jest.fn();
      client.on("stream", spy);
      ws.onmessage?.({ data: "not json{{{" });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("sendToolsManifestResponse", () => {
    it("sends manifest envelope over socket", async () => {
      const client = new AgentSocketClient("ws://test");
      const ws = await connectClient(client);

      client.sendToolsManifestResponse("r1", [
        { name: "ui_copy", description: "copy", parameters: {} }
      ]);

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.command).toBe("tools_manifest_response");
      expect(sent.request_id).toBe("r1");
      expect(sent.manifest).toHaveLength(1);
      client.disconnect();
    });
  });

  describe("sendToolCallResponse", () => {
    it("sends tool call response over socket", async () => {
      const client = new AgentSocketClient("ws://test");
      const ws = await connectClient(client);

      client.sendToolCallResponse("r2", {
        result: { ok: true },
        isError: false
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.command).toBe("tool_call_response");
      expect(sent.request_id).toBe("r2");
      expect(sent.result.isError).toBe(false);
      client.disconnect();
    });
  });

  describe("failAllPending", () => {
    it("rejects all queued requests on disconnect", async () => {
      const client = new AgentSocketClient("ws://test");
      await connectClient(client);

      const pending = (
        client as unknown as { pending: Map<string, unknown> }
      ).pending;
      const reject1 = jest.fn();
      const reject2 = jest.fn();
      const t1 = setTimeout(() => {}, 30000);
      const t2 = setTimeout(() => {}, 30000);
      pending.set("a", { resolve: jest.fn(), reject: reject1, timer: t1 });
      pending.set("b", { resolve: jest.fn(), reject: reject2, timer: t2 });

      client.disconnect();

      expect(reject1).toHaveBeenCalledWith(expect.any(Error));
      expect(reject2).toHaveBeenCalledWith(expect.any(Error));
      expect(pending.size).toBe(0);
    });
  });
});

describe("getAgentSocketClient", () => {
  it("returns the same instance on repeated calls", () => {
    const a = getAgentSocketClient();
    const b = getAgentSocketClient();
    expect(a).toBe(b);
  });
});
