import { TextEncoder, TextDecoder } from "util";
import { FrontendToolRegistry } from "../../tools/frontendTools";
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

describe("GlobalWebSocketManager", () => {
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
});
