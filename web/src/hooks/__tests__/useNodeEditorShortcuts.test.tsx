import { makeNodeStore, nodeStoreRenderers } from "../../test-utils/nodeStore";

import { useNodeEditorShortcuts } from "../useNodeEditorShortcuts";
import {
  registerComboCallback,
  unregisterComboCallback
} from "../../stores/KeyPressedStore";

const mockOpenNodeMenu = jest.fn();

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
      saveExample: () => Promise<void>;
      removeWorkflow: () => void;
      getCurrentWorkflow: () => null;
      openWorkflows: Array<{ id: string }>;
      createNew: () => Promise<{ id: string }>;
      saveWorkflow: () => Promise<void>;
    }) => T
  ) =>
    selector({
      saveExample: async () => Promise.resolve(),
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
    zoomTo: jest.fn()
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

    const calls = (registerComboCallback as jest.Mock).mock.calls as Array<
      [string]
    >;
    const hasSpaceShortcut = calls.some(([combo]) => combo === " ");
    expect(hasSpaceShortcut).toBe(true);
  });
});
