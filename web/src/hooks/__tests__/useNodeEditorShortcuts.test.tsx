import type { Node } from "@xyflow/react";
import { makeNodeStore, nodeStoreRenderers } from "../../test-utils/nodeStore";
import { useMenuHandler } from "../useIpcRenderer";
import { useSubgraphTabsStore } from "../../stores/SubgraphTabsStore";
import type { NodeData } from "../../stores/NodeData";

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
const mockCreateNew = jest.fn(async () => ({ id: "wf-2" }));

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

let mockIsElectron = false;
let mockTextInputActive = false;
let mockCanTakeFocus = true;
jest.mock("../../utils/browser", () => ({
  getIsElectronDetails: () => ({ isElectron: mockIsElectron }),
  isTextInputActive: () => mockTextInputActive,
  canTakeFocus: () => mockCanTakeFocus
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
      getSelectedNodes: () => [],
      workflow: { id: "wf-1" }
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
      createNew: mockCreateNew,
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

const mockHandlePaste = jest.fn();
jest.mock("../handlers/useCopyPaste", () => ({
  useCopyPaste: () => ({
    handleCopy: jest.fn(),
    handlePaste: mockHandlePaste,
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

const mockDuplicateNodes = jest.fn();
jest.mock("../useDuplicate", () => ({
  useDuplicateNodes: () => mockDuplicateNodes
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
    mockIsElectron = false;
    mockTextInputActive = false;
    mockCanTakeFocus = true;
  });

  const lastMenuHandler = () => {
    const calls = jest.mocked(useMenuHandler).mock.calls;
    const handler = calls[calls.length - 1]?.[0];
    if (!handler) {
      throw new Error("No menu handler was registered");
    }
    return handler;
  };

  it("registers node copy, cut and paste in the desktop app", () => {
    mockIsElectron = true;
    renderHook(() => useNodeEditorShortcuts(true));

    const combos = jest
      .mocked(registerComboCallback)
      .mock.calls.map(([combo]) => combo);
    expect(combos).toEqual(expect.arrayContaining(["c+control", "control+x", "control+v"]));
  });

  it("ignores canvas menu events while its editor is hidden", () => {
    mockCanTakeFocus = false;
    renderHook(() => useNodeEditorShortcuts(true, undefined, () => null));

    lastMenuHandler()({ type: "duplicate" });
    lastMenuHandler()({ type: "paste" });
    expect(mockDuplicateNodes).not.toHaveBeenCalled();
    expect(mockHandlePaste).not.toHaveBeenCalled();
  });

  it("ignores graph-editing menu events while a text field has focus", () => {
    mockTextInputActive = true;
    renderHook(() => useNodeEditorShortcuts(true, undefined, () => null));

    lastMenuHandler()({ type: "duplicate" });
    expect(mockDuplicateNodes).not.toHaveBeenCalled();

    mockTextInputActive = false;
    lastMenuHandler()({ type: "duplicate" });
    expect(mockDuplicateNodes).toHaveBeenCalledTimes(1);
  });

  it("leaves workspace menu events to the workflow editor, not its subgraph editors", () => {
    const tabKey = "wf-1:sub";
    useSubgraphTabsStore.setState({
      tabs: [
        {
          key: tabKey,
          workflowId: "wf-1",
          nodeId: "sub",
          label: "Sub",
          store: makeNodeStore()
        }
      ]
    });
    const subgraph = nodeStoreRenderers(
      makeNodeStore({
        getSelectedNodeCount: () => 0,
        edges: [],
        workflow: { id: tabKey }
      })
    );
    subgraph.renderHook(() => useNodeEditorShortcuts(true));
    lastMenuHandler()({ type: "newTab" });
    expect(mockCreateNew).not.toHaveBeenCalled();
    useSubgraphTabsStore.setState({ tabs: [] });

    renderHook(() => useNodeEditorShortcuts(true));
    lastMenuHandler()({ type: "newTab" });
    expect(mockCreateNew).toHaveBeenCalledTimes(1);
  });

  it("nudges a selected group without also moving its selected children", () => {
    const nodes = [
      { id: "group", position: { x: 100, y: 100 }, selected: true },
      { id: "child", parentId: "group", position: { x: 10, y: 10 }, selected: true },
      { id: "loose", position: { x: 0, y: 0 }, selected: true }
    ] as Node<NodeData>[];
    let written: Node<NodeData>[] = [];
    const setNodes = jest.fn(
      (update: Node<NodeData>[] | ((nodes: Node<NodeData>[]) => Node<NodeData>[])) => {
        written = typeof update === "function" ? update(nodes) : update;
      }
    );
    const store = nodeStoreRenderers(
      makeNodeStore({
        getSelectedNodeCount: () => 3,
        getSelectedNodes: () => nodes,
        setNodes,
        edges: [],
        workflow: { id: "wf-1" }
      })
    );
    store.renderHook(() => useNodeEditorShortcuts(true));

    const registration = jest
      .mocked(registerComboCallback)
      .mock.calls.find(([combo]) => combo === "arrowleft");
    registration?.[1]?.callback?.();

    expect(written.map((n) => [n.id, n.position.x])).toEqual([
      ["group", 90],
      ["child", 10],
      ["loose", -10]
    ]);
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
