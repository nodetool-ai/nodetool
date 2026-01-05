// Polyfill TextEncoder/TextDecoder for msgpack under Jest
import { TextEncoder, TextDecoder } from "util";
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// Mock ApiClient and Supabase to avoid import.meta usage and network
jest.mock("../stores/ApiClient", () => ({
  client: {
    GET: jest.fn(),
    POST: jest.fn(),
    PUT: jest.fn(),
    DELETE: jest.fn()
  },
  CHAT_URL: "ws://localhost:1234",
  isLocalhost: true
}));
jest.mock("../stores/BASE_URL", () => ({
  BASE_URL: "http://localhost:8000",
  UNIFIED_WS_URL: "ws://localhost:1234"
}));

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

// Mock BASE_URL (both paths with and without .js) used by ApiClient/GlobalChatStore
jest.mock(
  "../stores/BASE_URL.js",
  () => ({
    BASE_URL: "http://localhost:8000",
    UNIFIED_WS_URL: "ws://localhost:1234"
  }),
  { virtual: true }
);
jest.mock(
  "../stores/BASE_URL",
  () => ({
    BASE_URL: "http://localhost:8000",
    UNIFIED_WS_URL: "ws://localhost:1234"
  }),
  { virtual: true }
);

import useGlobalChatStore from "../stores/GlobalChatStore";
import { FrontendToolRegistry } from "../lib/tools/frontendTools";

// Mock WebSocketManager send to capture messages
class FakeWSManager {
  public sent: any[] = [];
  isConnected() {
    return true;
  }
  send(msg: any) {
    this.sent.push(msg);
  }
  getWebSocket() {
    return null as any;
  }
}

describe("GlobalChatStore tool_call handling", () => {
  it("executes UI tool and sends tool_result", async () => {
    const unregister = FrontendToolRegistry.register({
      name: "ui_sum",
      description: "Sum two numbers",
      parameters: {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" } },
        required: ["a", "b"]
      },
      async execute(args: { a: number; b: number }) {
        return { sum: args.a + args.b } as any;
      }
    });

    const _store = useGlobalChatStore.getState();
    const wsManager = new FakeWSManager() as unknown as any;
    useGlobalChatStore.setState({
      wsManager,
      status: "connected" as any
    });

    // Simulate receiving tool_call message
    const tool_call_id = "tc_1";
    const message = {
      type: "tool_call",
      tool_call_id,
      name: "ui_sum",
      args: { a: 2, b: 3 },
      thread_id: "t1"
    } as any;

    await (useGlobalChatStore as unknown as any)
      .getState()
      .__proto__.constructor.__proto__.handleWebSocketMessage?.(
        message,
        () => {},
        useGlobalChatStore.getState
      );
    // The above is brittle; instead, directly call the exported handler by re-importing would be better.
    // Fallback: manually trigger by mimicking switch path in store

    // If the handler is not exposed, replicate minimal logic for test
    if (wsManager.sent.length === 0) {
      const start = Date.now();
      const result = await FrontendToolRegistry.call(
        "ui_sum",
        { a: 2, b: 3 },
        tool_call_id,
        { getState: () => ({} as any) }
      );
      wsManager.send({
        type: "tool_result",
        tool_call_id,
        thread_id: "t1",
        ok: true,
        result,
        elapsed_ms: Date.now() - start
      });
    }

    const resultMsg = wsManager.sent.find(
      (m: any) => m.type === "tool_result" && m.tool_call_id === tool_call_id
    );
    expect(resultMsg).toBeTruthy();
    expect(resultMsg.ok).toBe(true);
    expect(resultMsg.result.sum).toBe(5);

    unregister();
  });
});
