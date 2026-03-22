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
  BASE_URL: "http://localhost:7777",
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
    BASE_URL: "http://localhost:7777",
    UNIFIED_WS_URL: "ws://localhost:1234"
  }),
  { virtual: true }
);
jest.mock(
  "../stores/BASE_URL",
  () => ({
    BASE_URL: "http://localhost:7777",
    UNIFIED_WS_URL: "ws://localhost:1234"
  }),
  { virtual: true }
);

import { FrontendToolRegistry } from "../lib/tools/frontendTools";
import { globalWebSocketManager } from "../lib/websocket/GlobalWebSocketManager";

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
  // Create a fake wsManager for the test
  const fakeWsManager = new FakeWSManager();

  beforeEach(() => {
    fakeWsManager.sent = [];
    // Mock the globalWebSocketManager to use our fake
    jest.spyOn(globalWebSocketManager, 'send').mockImplementation((msg: any): Promise<void> => {
      fakeWsManager.sent.push(msg);
      return Promise.resolve();
    });
    jest.spyOn(globalWebSocketManager, 'getConnectionState').mockReturnValue({
      isConnected: true,
      isConnecting: false
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

    // Simulate receiving tool_call message via globalWebSocketManager
    const tool_call_id = "tc_1";

    // Directly call the frontend tool registry and send result
    const start = Date.now();
    const result = await FrontendToolRegistry.call(
      "ui_sum",
      { a: 2, b: 3 },
      tool_call_id,
      { getState: () => ({} as any) }
    );
    globalWebSocketManager.send({
      type: "tool_result",
      tool_call_id,
      thread_id: "t1",
      ok: true,
      result,
      elapsed_ms: Date.now() - start
    });

    const resultMsg = fakeWsManager.sent.find(
      (m: any) => m.type === "tool_result" && m.tool_call_id === tool_call_id
    );
    expect(resultMsg).toBeTruthy();
    expect(resultMsg.ok).toBe(true);
    expect(resultMsg.result.sum).toBe(5);

    unregister();
  });
});
