import { handleChatWebSocketMessage } from "../chatProtocol";
import { FrontendToolRegistry } from "../../../lib/tools/frontendTools";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";

jest.mock("../../../lib/tools/frontendTools", () => ({
  FrontendToolRegistry: {
    has: jest.fn(),
    call: jest.fn()
  }
}));

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    send: jest.fn().mockResolvedValue(undefined),
    ensureConnection: jest.fn().mockResolvedValue(undefined)
  }
}));

describe("chatProtocol", () => {
  it("ignores non-critical messages while stopping", async () => {
    const set = jest.fn();
    const get = () =>
      ({
        status: "stopping"
      }) as any;

    await handleChatWebSocketMessage({ type: "chunk", content: "hi" } as any, set, get);

    expect(set).not.toHaveBeenCalled();
  });

  it("returns tool errors for unknown client tools", async () => {
    (FrontendToolRegistry.has as jest.Mock).mockReturnValue(false);
    const set = jest.fn();
    const get = () =>
      ({
        status: "connected",
        wsManager: { send: jest.fn() },
        frontendToolState: {},
        currentThreadId: null,
        threads: {},
        messageCache: {},
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn()
      }) as any;

    await handleChatWebSocketMessage(
      {
        type: "tool_call",
        tool_call_id: "tc1",
        name: "unknown_tool",
        args: {},
        thread_id: "thread-1"
      } as any,
      set,
      get
    );

    expect(globalWebSocketManager.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
        ok: false
      })
    );
  });

  it("returns structured tool_result on tool failure", async () => {
    (FrontendToolRegistry.has as jest.Mock).mockReturnValue(true);
    (FrontendToolRegistry.call as jest.Mock).mockRejectedValue(new Error("nope"));

    const set = jest.fn();
    const get = () =>
      ({
        status: "connected",
        wsManager: { send: jest.fn() },
        workflowId: null,
        threadWorkflowId: {},
        frontendToolState: { fetchWorkflow: jest.fn().mockResolvedValue(undefined) },
        currentThreadId: null,
        threads: {},
        messageCache: {},
        selectedModel: { provider: "", id: "" },
        summarizeThread: jest.fn()
      }) as any;

    await handleChatWebSocketMessage(
      {
        type: "tool_call",
        tool_call_id: "tc_fail",
        name: "ui_fail",
        args: {},
        thread_id: "thread-1"
      } as any,
      set,
      get
    );

    expect(globalWebSocketManager.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
        tool_call_id: "tc_fail",
        ok: false,
        error: "nope",
        result: { error: "nope" }
      })
    );
  });
});
