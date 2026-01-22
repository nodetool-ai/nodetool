import { renderHook, cleanup } from "@testing-library/react";
import { useNodeEditorShortcuts } from "../useNodeEditorShortcuts";

jest.mock("@xyflow/react", () => ({
  useReactFlow: jest.fn(() => ({
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    zoomTo: jest.fn(),
    screenToFlowPosition: jest.fn().mockReturnValue({ x: 100, y: 200 })
  }))
}));

jest.mock("../../stores/KeyPressedStore", () => ({
  registerComboCallback: jest.fn(),
  unregisterComboCallback: jest.fn()
}));

jest.mock("../../config/shortcuts", () => ({
  NODE_EDITOR_SHORTCUTS: [
    { combo: "delete", description: "Delete selected nodes" },
    { combo: "backspace", description: "Delete selected nodes" }
  ]
}));

jest.mock("../../utils/browser", () => ({
  getIsElectronDetails: jest.fn(() => false)
}));

jest.mock("../../utils/MousePosition", () => ({
  getMousePosition: jest.fn(() => ({ x: 100, y: 200 }))
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn(() => ({
    getSelectedNodes: () => [],
    selectAllNodes: jest.fn(),
    setNodes: jest.fn(),
    toggleBypassSelected: jest.fn()
  })),
  useTemporalNodes: jest.fn(() => ({
    undo: jest.fn(),
    redo: jest.fn()
  }))
}));

jest.mock("../../stores/NodeMenuStore", () => ({
  default: jest.fn(() => ({
    openNodeMenu: jest.fn()
  }))
}));

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn(() => ({
    saveExample: jest.fn(),
    removeWorkflow: jest.fn(),
    getCurrentWorkflow: jest.fn(() => null),
    openWorkflows: [],
    createNew: jest.fn(),
    saveWorkflow: jest.fn()
  }))
}));

jest.mock("react-router-dom", () => ({
  useNavigate: jest.fn(() => jest.fn())
}));

describe("useNodeEditorShortcuts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("registers shortcuts when active", () => {
    const { registerComboCallback } = require("../../stores/KeyPressedStore");
    
    renderHook(() => useNodeEditorShortcuts(true));
    
    expect(registerComboCallback).toHaveBeenCalled();
  });

  it("does not register shortcuts when inactive", () => {
    const { registerComboCallback } = require("../../stores/KeyPressedStore");
    
    renderHook(() => useNodeEditorShortcuts(false));
    
    expect(registerComboCallback).not.toHaveBeenCalled();
  });

  it("unregisters shortcuts on unmount when active", () => {
    const { unregisterComboCallback } = require("../../stores/KeyPressedStore");
    
    const { unmount } = renderHook(() => useNodeEditorShortcuts(true));
    
    unmount();
    
    expect(unregisterComboCallback).toHaveBeenCalled();
  });

  it("does not unregister shortcuts when inactive", () => {
    const { unregisterComboCallback } = require("../../stores/KeyPressedStore");
    
    const { unmount } = renderHook(() => useNodeEditorShortcuts(false));
    
    unmount();
    
    expect(unregisterComboCallback).not.toHaveBeenCalled();
  });
});
