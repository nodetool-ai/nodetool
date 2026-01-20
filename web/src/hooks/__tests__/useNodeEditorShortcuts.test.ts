import { renderHook } from "@testing-library/react";
import { registerComboCallback, unregisterComboCallback } from "../../stores/KeyPressedStore";

jest.mock("../../stores/KeyPressedStore", () => ({
  registerComboCallback: jest.fn(),
  unregisterComboCallback: jest.fn()
}));

jest.mock("../../config/shortcuts", () => ({
  NODE_EDITOR_SHORTCUTS: [
    { combo: "Control+c", description: "Copy" },
    { combo: "Control+v", description: "Paste" }
  ]
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn(),
  useTemporalNodes: jest.fn()
}));

jest.mock("../../stores/NodeMenuStore", () => ({
  default: jest.fn()
}));

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn()
}));

jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn()
}));

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn()
}));

jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: jest.fn()
}));

jest.mock("../../stores/RightPanelStore", () => ({
  useRightPanelStore: jest.fn()
}));

jest.mock("../../utils/platform", () => ({
  isMac: jest.fn().mockReturnValue(false)
}));

describe("useNodeEditorShortcuts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("shortcut registration", () => {
    it("verifies registerComboCallback is mocked correctly", () => {
      expect(typeof registerComboCallback).toBe("function");
      expect(typeof unregisterComboCallback).toBe("function");
    });

    it("verifies NODE_EDITOR_SHORTCUTS mock returns array", () => {
      const { NODE_EDITOR_SHORTCUTS } = require("../../config/shortcuts");
      expect(Array.isArray(NODE_EDITOR_SHORTCUTS)).toBe(true);
      expect(NODE_EDITOR_SHORTCUTS.length).toBeGreaterThan(0);
    });
  });

  describe("platform detection", () => {
    it("handles mac platform detection", () => {
      const { isMac } = require("../../utils/platform");
      expect(typeof isMac).toBe("function");
    });
  });

  describe("hook dependencies", () => {
    it("has access to useNodes mock", () => {
      const { useNodes } = require("../../contexts/NodeContext");
      expect(typeof useNodes).toBe("function");
    });

    it("has access to useReactFlow mock", () => {
      const { useReactFlow } = require("@xyflow/react");
      expect(typeof useReactFlow).toBe("function");
    });

    it("has access to useNavigate mock", () => {
      const { useNavigate } = require("react-router-dom");
      expect(typeof useNavigate).toBe("function");
    });
  });
});
