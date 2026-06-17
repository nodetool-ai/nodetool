const mockClient = {
  on: jest.fn(),
  sendToolsManifestResponse: jest.fn(),
  sendToolCallResponse: jest.fn()
};

jest.mock("../../agent/AgentSocketClient", () => ({
  getAgentSocketClient: () => mockClient
}));

jest.mock("../frontendToolRuntimeState", () => ({
  getFrontendToolRuntimeState: jest.fn(() => ({}))
}));

jest.mock("../builtin/graph", () => {});
jest.mock("../builtin/addNode", () => {});
jest.mock("../builtin/updateNodeData", () => {});
jest.mock("../builtin/connectNodes", () => {});
jest.mock("../builtin/setNodeTitle", () => {});
jest.mock("../builtin/moveNode", () => {});
jest.mock("../builtin/getGraph", () => {});
jest.mock("../builtin/searchNodes", () => {});
jest.mock("../builtin/searchModels", () => {});
jest.mock("../builtin/deleteNode", () => {});
jest.mock("../builtin/deleteEdge", () => {});
jest.mock("../builtin/uiActions", () => {});

import { FrontendToolRegistry } from "../frontendTools";

// Side-effect import triggers initFrontendToolsBridge().
import "../frontendToolsIpc";

type Handler = (...args: unknown[]) => unknown;

const handlers = new Map<string, Handler>();
for (const [eventName, handler] of mockClient.on.mock.calls) {
  handlers.set(eventName as string, handler as Handler);
}

function getHandler(eventName: string): Handler {
  const h = handlers.get(eventName);
  if (!h) {
    throw new Error(`No handler registered for "${eventName}"`);
  }
  return h;
}

describe("frontendToolsIpc", () => {
  beforeEach(() => {
    mockClient.sendToolsManifestResponse.mockClear();
    mockClient.sendToolCallResponse.mockClear();
  });

  it("subscribes to toolsManifestRequest, toolCallRequest, and toolCallAbort", () => {
    expect(handlers.has("toolsManifestRequest")).toBe(true);
    expect(handlers.has("toolCallRequest")).toBe(true);
    expect(handlers.has("toolCallAbort")).toBe(true);
  });

  describe("toolsManifestRequest handler", () => {
    it("responds with current manifest", () => {
      const handler = getHandler("toolsManifestRequest");
      const manifest = FrontendToolRegistry.getManifest();

      handler({ requestId: "r1", sessionId: "s1" });

      expect(mockClient.sendToolsManifestResponse).toHaveBeenCalledWith(
        "r1",
        manifest
      );
    });
  });

  describe("toolCallRequest handler", () => {
    it("responds with error for unknown tool", async () => {
      const handler = getHandler("toolCallRequest");

      await handler({
        requestId: "r2",
        sessionId: "s2",
        toolCallId: "tc2",
        name: "ui_nonexistent",
        args: {}
      });

      expect(mockClient.sendToolCallResponse).toHaveBeenCalledWith("r2", {
        result: null,
        isError: true,
        error: expect.stringContaining("Unknown tool")
      });
    });

    it("calls tool and sends success response", async () => {
      const cleanup = FrontendToolRegistry.register({
        name: "ui_test_ipc_tool",
        description: "test tool for ipc",
        parameters: {},
        async execute() {
          return { status: "done" };
        }
      });

      try {
        const handler = getHandler("toolCallRequest");

        await handler({
          requestId: "r3",
          sessionId: "s3",
          toolCallId: "tc3",
          name: "ui_test_ipc_tool",
          args: {}
        });

        expect(mockClient.sendToolCallResponse).toHaveBeenCalledWith("r3", {
          result: { status: "done" },
          isError: false
        });
      } finally {
        cleanup();
      }
    });

    it("sends error response when tool execution fails", async () => {
      const cleanup = FrontendToolRegistry.register({
        name: "ui_test_ipc_fail",
        description: "test tool that fails",
        parameters: {},
        async execute() {
          throw new Error("deliberate failure");
        }
      });

      try {
        const handler = getHandler("toolCallRequest");

        await handler({
          requestId: "r4",
          sessionId: "s4",
          toolCallId: "tc4",
          name: "ui_test_ipc_fail",
          args: {}
        });

        expect(mockClient.sendToolCallResponse).toHaveBeenCalledWith("r4", {
          result: null,
          isError: true,
          error: "deliberate failure"
        });
      } finally {
        cleanup();
      }
    });
  });

  describe("toolCallAbort handler", () => {
    it("calls FrontendToolRegistry.abortAll()", () => {
      const abortSpy = jest.spyOn(FrontendToolRegistry, "abortAll");
      const handler = getHandler("toolCallAbort");

      handler({ sessionId: "s5" });

      expect(abortSpy).toHaveBeenCalled();
      abortSpy.mockRestore();
    });
  });
});
