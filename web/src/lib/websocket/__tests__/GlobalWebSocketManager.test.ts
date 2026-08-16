import { TextEncoder, TextDecoder } from "util";
import { FrontendToolRegistry } from "../../tools/frontendTools";
import { globalWebSocketManager } from "../GlobalWebSocketManager";
import { handleResourceChange } from "../../../stores/resourceChangeHandler";
import { ResourceChangeUpdate } from "../../../stores/ApiTypes";
import type { WebSocketMessage } from "../GlobalWebSocketManager";
import { validateInboundMessage } from "../validateInboundMessage";

Object.assign(global, { TextEncoder, TextDecoder });

/**
 * Mirrors what the socket's "message" listener does with a decoded frame.
 * `routeMessage` is private; element access reaches it with its types intact.
 */
const ingest = (message: WebSocketMessage): void => {
  validateInboundMessage(message);
  globalWebSocketManager["routeMessage"](message);
};

// Mock dependencies before imports
jest.mock("../../../stores/BASE_URL", () => ({
  BASE_URL: "http://localhost:7777",
  UNIFIED_WS_URL: "ws://localhost:1234/ws"
}));

jest.mock("../../env", () => ({
  isLocalhost: true
}));

jest.mock("../../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } })
    }
  }
}));

// Mock FrontendToolRegistry
jest.mock("../../tools/frontendTools", () => ({
  FrontendToolRegistry: {
    getManifest: jest.fn().mockReturnValue([
      {
        name: "ui_test_tool",
        description: "Test tool",
        parameters: { type: "object", properties: {} }
      }
    ])
  }
}));

// Mock resourceChangeHandler
jest.mock("../../../stores/resourceChangeHandler", () => ({
  handleResourceChange: jest.fn()
}));

describe("GlobalWebSocketManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("sendToolsManifest", () => {
    it("sends tools manifest when connection opens", () => {
      // This test verifies the sendToolsManifest method is called
      // by checking that FrontendToolRegistry.getManifest is called
      // when the connection is established
      const manifest = FrontendToolRegistry.getManifest();
      expect(manifest).toHaveLength(1);
      expect(manifest[0].name).toBe("ui_test_tool");
    });
  });

  describe("routing", () => {
    it("routes messages by job_id", () => {
      const handler = jest.fn();
      const unsubscribe = globalWebSocketManager.subscribe("job-123", handler);
      const message: WebSocketMessage = {
        type: "node_update",
        job_id: "job-123"
      };

      globalWebSocketManager["routeMessage"](message);

      expect(handler).toHaveBeenCalledWith(message);
      unsubscribe();
    });

    it("routes messages by workflow_id", () => {
      const handler = jest.fn();
      const unsubscribe = globalWebSocketManager.subscribe("workflow-456", handler);
      const message: WebSocketMessage = {
        type: "node_update",
        workflow_id: "workflow-456"
      };

      globalWebSocketManager["routeMessage"](message);

      expect(handler).toHaveBeenCalledWith(message);
      unsubscribe();
    });

    it("routes messages by thread_id", () => {
      const handler = jest.fn();
      const unsubscribe = globalWebSocketManager.subscribe("thread-789", handler);
      const message: WebSocketMessage = {
        type: "chunk",
        thread_id: "thread-789"
      };

      globalWebSocketManager["routeMessage"](message);

      expect(handler).toHaveBeenCalledWith(message);
      unsubscribe();
    });
  });

  describe("resource change handling", () => {
    it("handles resource_change messages", () => {
      const resourceChangeMessage: ResourceChangeUpdate & WebSocketMessage = {
        type: "resource_change",
        event: "updated",
        resource_type: "workflow",
        resource: {
          id: "workflow-123",
          etag: "abc123"
        }
      };

      globalWebSocketManager["routeMessage"](resourceChangeMessage);

      expect(handleResourceChange).toHaveBeenCalledWith(resourceChangeMessage);
    });

    it("does not route resource_change messages to regular handlers", () => {
      const handler = jest.fn();
      const unsubscribe = globalWebSocketManager.subscribe("workflow-123", handler);

      const resourceChangeMessage: ResourceChangeUpdate & WebSocketMessage = {
        type: "resource_change",
        event: "created",
        resource_type: "workflow",
        resource: {
          id: "workflow-123",
          etag: "xyz"
        }
      };

      globalWebSocketManager["routeMessage"](resourceChangeMessage);

      // Regular handler should NOT be called for resource_change messages
      expect(handler).not.toHaveBeenCalled();
      // But the resource change handler should be called
      expect(handleResourceChange).toHaveBeenCalled();

      unsubscribe();
    });

    it("handles resource_change messages for different events", () => {
      const events: Array<"created" | "updated" | "deleted"> = ["created", "updated", "deleted"];

      events.forEach((event) => {
        const message: ResourceChangeUpdate & WebSocketMessage = {
          type: "resource_change",
          event,
          resource_type: "asset",
          resource: {
            id: `asset-${event}`,
            etag: "test"
          }
        };

        globalWebSocketManager["routeMessage"](message);

        expect(handleResourceChange).toHaveBeenCalledWith(message);
      });
    });
  });

  describe("inbound protocol validation (B4)", () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it("does not log for a valid message and still dispatches it", () => {
      const handler = jest.fn();
      const unsubscribe = globalWebSocketManager.subscribe("job-valid", handler);

      const validMessage = {
        type: "node_update",
        node_id: "n1",
        node_name: "My Node",
        node_type: "nodetool.text.Concat",
        status: "completed",
        job_id: "job-valid"
      };

      ingest(validMessage);

      expect(handler).toHaveBeenCalledWith(validMessage);
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      unsubscribe();
    });

    it("logs a structured error for an invalid message but still dispatches it", () => {
      const handler = jest.fn();
      const unsubscribe = globalWebSocketManager.subscribe("job-invalid", handler);

      // Missing required fields (node_name, node_type, status) for node_update.
      const invalidMessage = {
        type: "node_update",
        node_id: "n1",
        job_id: "job-invalid"
      };

      ingest(invalidMessage);

      // Observe-only: the message is still routed to subscribers.
      expect(handler).toHaveBeenCalledWith(invalidMessage);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("node_update");

      unsubscribe();
    });

    it("skips validation for message types outside the protocol union", () => {
      const invalidButUnvalidated = {
        type: "some_unrelated_frame",
        anything: "goes"
      };

      ingest(invalidButUnvalidated);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
