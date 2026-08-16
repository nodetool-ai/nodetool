import { FrontendToolRegistry } from "../../tools/frontendTools";
import { getFrontendToolRuntimeState } from "../../tools/frontendToolRuntimeState";
import { globalWebSocketManager } from "../GlobalWebSocketManager";

jest.mock("../../../stores/BASE_URL", () => ({
  BASE_URL: "http://localhost:7777",
  UNIFIED_WS_URL: "ws://localhost:1234/ws"
}));

jest.mock("../../env", () => ({ isLocalhost: true }));

jest.mock("../../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

jest.mock("../../tools/frontendTools", () => ({
  FrontendToolRegistry: {
    getManifest: jest.fn().mockReturnValue([]),
    get: jest.fn(),
    call: jest.fn()
  }
}));

jest.mock("../../tools/frontendToolRuntimeState", () => ({
  getFrontendToolRuntimeState: jest.fn()
}));

/**
 * The manager's renderer-tool path is private; element access reaches it
 * without discarding its types, which is what these tests drive.
 */
const executeRendererToolCall =
  globalWebSocketManager["executeRendererToolCall"].bind(
    globalWebSocketManager
  );

const setRendererId = (id: string | null): void => {
  globalWebSocketManager["rendererId"] = id;
};

describe("GlobalWebSocketManager renderer tool calls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setRendererId(null);
    jest.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns a structured error for an unknown tool", async () => {
    const sendSpy = jest
      .spyOn(globalWebSocketManager, "send")
      .mockResolvedValue(undefined);
    (FrontendToolRegistry.get as jest.Mock).mockReturnValue(undefined);
    setRendererId("renderer-1");

    await executeRendererToolCall({
      type: "renderer_tool_call",
      renderer_id: "renderer-1",
      tool_call_id: "call-1",
      name: "ui_missing",
      args: {}
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "renderer_tool_result",
        renderer_id: "renderer-1",
        tool_call_id: "call-1",
        ok: false,
        error: "Unsupported tool: ui_missing"
      })
    );
    expect(FrontendToolRegistry.call).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it("rejects a call addressed to another registered renderer", async () => {
    const sendSpy = jest
      .spyOn(globalWebSocketManager, "send")
      .mockResolvedValue(undefined);
    setRendererId("renderer-1");

    await executeRendererToolCall({
      type: "renderer_tool_call",
      renderer_id: "renderer-2",
      tool_call_id: "call-mismatch",
      name: "ui_get_graph",
      args: {}
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "renderer_tool_result",
        ok: false,
        error: "Renderer id mismatch: this connection is renderer-1"
      })
    );
    expect(FrontendToolRegistry.get).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it("does not execute a consent-gated tool when the user denies it", async () => {
    const sendSpy = jest
      .spyOn(globalWebSocketManager, "send")
      .mockResolvedValue(undefined);
    (FrontendToolRegistry.get as jest.Mock).mockReturnValue({
      requireUserConsent: true
    });
    setRendererId("renderer-1");

    await executeRendererToolCall({
      type: "renderer_tool_call",
      renderer_id: "renderer-1",
      tool_call_id: "call-2",
      name: "ui_delete_node",
      args: {}
    });

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "renderer_tool_result",
        ok: false,
        error: "User denied consent for tool: ui_delete_node"
      })
    );
    expect(FrontendToolRegistry.call).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it("executes a tool and returns its result when the user consents", async () => {
    const sendSpy = jest
      .spyOn(globalWebSocketManager, "send")
      .mockResolvedValue(undefined);
    const runtimeState = { fetchWorkflow: jest.fn() };
    (FrontendToolRegistry.get as jest.Mock).mockReturnValue({
      requireUserConsent: true
    });
    (FrontendToolRegistry.call as jest.Mock).mockResolvedValue({ ok: true });
    (getFrontendToolRuntimeState as jest.Mock).mockReturnValue(runtimeState);
    (window.confirm as jest.Mock).mockReturnValue(true);
    setRendererId("renderer-1");

    await executeRendererToolCall({
      type: "renderer_tool_call",
      renderer_id: "renderer-1",
      tool_call_id: "call-3",
      name: "ui_delete_node",
      args: { workflow_id: "workflow-1" }
    });

    expect(runtimeState.fetchWorkflow).not.toHaveBeenCalled();
    expect(FrontendToolRegistry.call).toHaveBeenCalledWith(
      "ui_delete_node",
      { workflow_id: "workflow-1" },
      "call-3",
      expect.objectContaining({ getState: expect.any(Function) })
    );
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "renderer_tool_result",
        renderer_id: "renderer-1",
        tool_call_id: "call-3",
        ok: true,
        result: { ok: true }
      })
    );
    sendSpy.mockRestore();
  });
});
