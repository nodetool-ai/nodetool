import { makeNodeStore, nodeStoreRenderers } from "../../test-utils/nodeStore";

import { useNodeEditorShortcuts } from "../useNodeEditorShortcuts";
import {
  registerComboCallback,
  unregisterComboCallback
} from "../../stores/KeyPressedStore";

const mockOpenNodeMenu = jest.fn();
const mockAddNode = jest.fn();
const mockCreateNode = jest.fn(
  (metadata: { node_type: string }, position: { x: number; y: number }) => ({
    id: "new-node",
    type: metadata.node_type,
    position
  })
);
const mockAddRecentNode = jest.fn();

jest.mock("../../stores/MetadataStore", () => ({
  __esModule: true,
  default: {
    getState: () => ({
      getMetadata: (nodeType: string) => ({ node_type: nodeType })
    })
  }
}));

jest.mock("../../stores/RecentNodesStore", () => ({
  useRecentNodesStore: <T,>(
    selector: (state: { addRecentNode: (nodeType: string) => void }) => T
  ) => selector({ addRecentNode: mockAddRecentNode })
}));

jest.mock("../../utils/instantiatePaletteNode", () => ({
  instantiatePaletteNode: (
    metadata: unknown,
    position: unknown,
    createNode: (metadata: unknown, position: unknown) => unknown
  ) => ({ node: createNode(metadata, position) })
}));

jest.mock("../../stores/KeyPressedStore", () => ({
  // registerComboCallback returns a disposer; hand back a no-op so cleanup works
  registerComboCallback: jest.fn(() => jest.fn()),
  unregisterComboCallback: jest.fn()
}));

jest.mock("../../utils/platform", () => ({
  isMac: () => false
}));

jest.mock("../../utils/browser", () => ({
  getIsElectronDetails: () => ({ isElectron: false }),
  isTextInputActive: () => false
}));

jest.mock("../../utils/MousePosition", () => ({
  getMousePosition: () => ({ x: 10, y: 20 })
}));

const { renderHook } = nodeStoreRenderers(
  makeNodeStore(
    {
      getSelectedNodeCount: () => 0,
      selectAllNodes: jest.fn(),
      setNodes: jest.fn(),
      toggleBypassSelected: jest.fn(),
      createNode: mockCreateNode,
      addNode: mockAddNode,
      updateNodeData: jest.fn(),
      edges: [],
      getSelectedNodes: () => []
    },
    { undo: jest.fn(), redo: jest.fn() }
  )
);
jest.mock("../../stores/NodeMenuStore", () => ({
  __esModule: true,
  default: <T,>(selector: (state: { openNodeMenu: () => void }) => T) =>
    selector({
      openNodeMenu: mockOpenNodeMenu
    })
}));

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(
    selector: (state: {
      removeWorkflow: () => void;
      getCurrentWorkflow: () => null;
      openWorkflows: Array<{ id: string }>;
      createNew: () => Promise<{ id: string }>;
      saveWorkflow: () => Promise<void>;
    }) => T
  ) =>
    selector({
      removeWorkflow: jest.fn(),
      getCurrentWorkflow: () => null,
      openWorkflows: [],
      createNew: async () => ({ id: "wf-1" }),
      saveWorkflow: async () => Promise.resolve()
    })
}));

jest.mock("@xyflow/react", () => ({
  useReactFlow: () => ({
    zoomIn: jest.fn(),
    zoomOut: jest.fn(),
    zoomTo: jest.fn(),
    screenToFlowPosition: (p: { x: number; y: number }) => ({
      x: p.x * 2,
      y: p.y * 2
    })
  })
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => jest.fn()
}));

jest.mock("../handlers/useCopyPaste", () => ({
  useCopyPaste: () => ({
    handleCopy: jest.fn(),
    handlePaste: jest.fn(),
    handleCut: jest.fn()
  })
}));

jest.mock("../useAlignNodes", () => ({
  __esModule: true,
  default: () => jest.fn()
}));

jest.mock("../nodes/useSurroundWithGroup", () => ({
  useSurroundWithGroup: () => jest.fn()
}));

jest.mock("../useDuplicate", () => ({
  useDuplicateNodes: () => jest.fn()
}));

jest.mock("../useSelectConnected", () => ({
  useSelectConnected: () => ({
    selectConnected: jest.fn()
  })
}));

jest.mock("../useFitView", () => ({
  useFitView: () => jest.fn()
}));

jest.mock("../useIpcRenderer", () => ({
  useMenuHandler: jest.fn()
}));

jest.mock("../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (state: { addNotification: () => void }) => T
  ) =>
    selector({
      addNotification: jest.fn()
    })
}));

jest.mock("../../stores/RightPanelStore", () => ({
  useRightPanelStore: <T,>(
    selector: (state: { handleViewChange: () => void }) => T
  ) =>
    selector({
      handleViewChange: jest.fn()
    })
}));

jest.mock("../../stores/BottomPanelStore", () => ({
  useBottomPanelStore: <T,>(
    selector: (state: { handleViewChange: () => void }) => T
  ) =>
    selector({
      handleViewChange: jest.fn()
    })
}));

jest.mock("../useFindInWorkflow", () => ({
  useFindInWorkflow: () => ({
    openFind: jest.fn()
  })
}));

jest.mock("../useSelectionActions", () => ({
  useSelectionActions: () => ({
    alignLeft: jest.fn(),
    alignCenter: jest.fn(),
    alignRight: jest.fn(),
    alignTop: jest.fn(),
    alignMiddle: jest.fn(),
    alignBottom: jest.fn(),
    distributeHorizontal: jest.fn(),
    distributeVertical: jest.fn(),
    stackSelected: jest.fn(),
    arrangeGrid: jest.fn(),
    deleteSelected: jest.fn()
  })
}));

jest.mock("../useNodeFocus", () => ({
  useNodeFocus: () => ({
    focusNext: jest.fn(),
    focusPrev: jest.fn(),
    focusedNodeId: null,
    selectFocused: jest.fn(),
    isNavigationMode: false,
    exitNavigationMode: jest.fn(),
    focusUp: jest.fn(),
    focusDown: jest.fn(),
    focusLeft: jest.fn(),
    focusRight: jest.fn(),
    goBack: jest.fn(),
    focusHistory: []
  })
}));

describe("useNodeEditorShortcuts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not register keyboard shortcuts when editor is inactive", () => {
    renderHook(() => useNodeEditorShortcuts(false));

    expect(registerComboCallback).not.toHaveBeenCalled();
    expect(unregisterComboCallback).not.toHaveBeenCalled();
  });

  it("registers space shortcut when editor is active", () => {
    renderHook(() => useNodeEditorShortcuts(true));

    const calls = jest.mocked(registerComboCallback).mock.calls as Array<
      [string]
    >;
    const hasSpaceShortcut = calls.some(([combo]) => combo === " ");
    expect(hasSpaceShortcut).toBe(true);
  });

  it("registers graph mutations in the canvas scope", () => {
    renderHook(() => useNodeEditorShortcuts(true));

    const calls = jest.mocked(registerComboCallback).mock.calls;
    const mutationCombos = new Set(["b", "delete", "backspace"]);
    const registrations = calls.filter(([combo]) => mutationCombos.has(combo));

    expect(registrations.map(([combo]) => combo)).toEqual(
      expect.arrayContaining(["b", "delete", "backspace"])
    );
    for (const [, options] of registrations) {
      expect(options).toEqual(expect.objectContaining({ scope: "canvas" }));
    }
  });

  it("registers stack, grid and add-node hotkeys", () => {
    renderHook(() => useNodeEditorShortcuts(true));

    const combos = jest
      .mocked(registerComboCallback)
      .mock.calls.map(([combo]) => combo);
    expect(combos).toEqual(
      expect.arrayContaining(["v", "g", "p+shift", "g+shift", "shift+v", "l+shift"])
    );
  });

  it("adds a Prompt node at the cursor on Shift+P", () => {
    renderHook(() => useNodeEditorShortcuts(true));

    const registration = jest
      .mocked(registerComboCallback)
      .mock.calls.find(([combo]) => combo === "p+shift");
    const callback = registration?.[1]?.callback;
    if (!callback) {
      throw new Error("Shift+P callback was not registered");
    }
    callback();

    expect(mockCreateNode).toHaveBeenCalledWith(
      { node_type: "nodetool.text.Prompt" },
      { x: 20, y: 40 }
    );
    expect(mockAddNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new-node", position: { x: 20, y: 40 } })
    );
    expect(mockAddRecentNode).toHaveBeenCalledWith("nodetool.text.Prompt");
  });
});
