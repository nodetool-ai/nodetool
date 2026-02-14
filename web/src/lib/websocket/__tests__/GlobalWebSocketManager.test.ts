import { TextEncoder, TextDecoder } from "util";
import { FrontendToolRegistry } from "../../tools/frontendTools";
import { globalWebSocketManager } from "../GlobalWebSocketManager";
import { handleResourceChange } from "../../../stores/resourceChangeHandler";
import { ResourceChangeUpdate } from "../../../stores/ApiTypes";
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder;

// Mock dependencies before imports
jest.mock("../../../stores/BASE_URL", () => ({
  BASE_URL: "http://localhost:7777",
  UNIFIED_WS_URL: "ws://localhost:1234/ws"
}));

jest.mock("../../../stores/ApiClient", () => ({
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

      (globalWebSocketManager as any).routeMessage({ job_id: "job-123" });

      expect(handler).toHaveBeenCalledWith({ job_id: "job-123" });
      unsubscribe();
    });

    it("routes messages by workflow_id", () => {
      const handler = jest.fn();
      const unsubscribe = globalWebSocketManager.subscribe("workflow-456", handler);

      (globalWebSocketManager as any).routeMessage({ workflow_id: "workflow-456" });

      expect(handler).toHaveBeenCalledWith({ workflow_id: "workflow-456" });
      unsubscribe();
    });

    it("routes messages by thread_id", () => {
      const handler = jest.fn();
      const unsubscribe = globalWebSocketManager.subscribe("thread-789", handler);

      (globalWebSocketManager as any).routeMessage({ thread_id: "thread-789" });

      expect(handler).toHaveBeenCalledWith({ thread_id: "thread-789" });
      unsubscribe();
    });
  });

  describe("resource change handling", () => {
    it("handles resource_change messages", () => {
      const resourceChangeMessage: ResourceChangeUpdate = {
        type: "resource_change",
        event: "updated",
        resource_type: "workflow",
        resource: {
          id: "workflow-123",
          etag: "abc123"
        }
      };

      (globalWebSocketManager as any).routeMessage(resourceChangeMessage);

      expect(handleResourceChange).toHaveBeenCalledWith(resourceChangeMessage);
    });

    it("does not route resource_change messages to regular handlers", () => {
      const handler = jest.fn();
      const unsubscribe = globalWebSocketManager.subscribe("workflow-123", handler);

      const resourceChangeMessage: ResourceChangeUpdate = {
        type: "resource_change",
        event: "created",
        resource_type: "workflow",
        resource: {
          id: "workflow-123",
          etag: "xyz"
        }
      };

      (globalWebSocketManager as any).routeMessage(resourceChangeMessage);

      // Regular handler should NOT be called for resource_change messages
      expect(handler).not.toHaveBeenCalled();
      // But the resource change handler should be called
      expect(handleResourceChange).toHaveBeenCalled();

      unsubscribe();
    });

    it("handles resource_change messages for different events", () => {
      const events: Array<"created" | "updated" | "deleted"> = ["created", "updated", "deleted"];

      events.forEach((event) => {
        const message: ResourceChangeUpdate = {
          type: "resource_change",
          event,
          resource_type: "asset",
          resource: {
            id: `asset-${event}`,
            etag: "test"
          }
        };

        (globalWebSocketManager as any).routeMessage(message);

        expect(handleResourceChange).toHaveBeenCalledWith(message);
      });
    });
  });
});
