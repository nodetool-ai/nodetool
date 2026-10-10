import { useCallback, useEffect, useMemo } from "react";
import { registerComboCallback } from "../stores/KeyPressedStore";
import { ADD_NODE_HOTKEYS, NODE_EDITOR_SHORTCUTS } from "../config/shortcuts";
import {
  canTakeFocus,
  getIsElectronDetails,
  isTextInputActive
} from "../utils/browser";
import { getMousePosition } from "../utils/MousePosition";
import { useNodes, useTemporalNodes, useNodeStoreRef } from "../contexts/NodeContext";
import { useCopyPaste } from "./handlers/useCopyPaste";
import useAlignNodes from "./useAlignNodes";
import { useSurroundWithGroup } from "./nodes/useSurroundWithGroup";
import { useDuplicateNodes } from "./useDuplicate";
import { useSelectConnected } from "./useSelectConnected";
import { useShallow } from "zustand/react/shallow";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useWorkspaceTabsStore } from "../stores/WorkspaceTabsStore";
import { useNavigate } from "react-router-dom";
import { openSettingsTab } from "../components/workspace/openPageTab";
import { useFitView } from "./useFitView";
import { useMenuHandler } from "./useIpcRenderer";
import { useReactFlow } from "@xyflow/react";
import { useNotificationStore } from "../stores/NotificationStore";
import { useRightPanelStore } from "../stores/RightPanelStore";
import { usePanelStore } from "../stores/PanelStore";
import { NodeData } from "../stores/NodeData";
import { useToggleCollapse } from "./nodes/useToggleCollapse";
import { Node, type Edge } from "@xyflow/react";
import type { NodeStoreState } from "../stores/NodeStore";
import { isMac } from "../utils/platform";
import { useFindInWorkflowStore } from "../stores/FindInWorkflowStore";
import { useSubgraphTabsStore } from "../stores/SubgraphTabsStore";
import { useSelectionActions } from "./useSelectionActions";
import { hasSelectedAncestor } from "../utils/selectionLayout";
import { useNodeFocus } from "./useNodeFocus";
import type { MenuEventData } from "../window";
import { useSketchCanvasRefStore } from "../stores/sketch/SketchCanvasRefStore";
import useMetadataStore from "../stores/MetadataStore";
import { useRecentNodesStore } from "../stores/RecentNodesStore";
import { instantiatePaletteNode } from "../utils/instantiatePaletteNode";

/**
 * Registers the node editor's keyboard shortcuts with KeyPressedStore, using the
 * combinations defined in NODE_EDITOR_SHORTCUTS. `active` gates registration;
 * `onShowShortcuts` opens the shortcuts help dialog; `getRoot` returns this
 * editor's root element so a shortcut only fires while that editor is
 * reachable — several editors bind the same keys (Space opens the node menu
 * here and plays/pauses in the timeline), and every open workspace tab stays
 * mounted with inactive ones `inert`.
 */
const ControlOrMeta = isMac() ? "Meta" : "Control";

/** Menu events that change the graph; ignored while a text field has focus. */
const GRAPH_EDIT_MENU_EVENTS: ReadonlySet<MenuEventData["type"]> = new Set([
  "copy",
  "cut",
  "paste",
  "selectAll",
  "undo",
  "redo",
  "align",
  "alignWithSpacing",
  "duplicate",
  "duplicateVertical",
  "group"
]);

/** Menu events that act on one canvas: only the editor on screen takes them. */
const CANVAS_MENU_EVENTS: ReadonlySet<MenuEventData["type"]> = new Set([
  ...GRAPH_EDIT_MENU_EVENTS,
  "fitView",
  "resetZoom",
  "zoomIn",
  "zoomOut"
]);

export const useNodeEditorShortcuts = (
  active: boolean,
  onShowShortcuts?: () => void,
  getRoot?: () => HTMLElement | null
): void => {
  // Subscribe to undo/redo functions only (stable) to prevent re-renders on history changes
  const undoHistory = useTemporalNodes((state) => state.undo);
  const redoHistory = useTemporalNodes((state) => state.redo);

  // Subscribe to selectedNodeCount instead of selectedNodes to prevent re-renders during drag
  const selectedNodeCount = useNodes((state) => state.getSelectedNodeCount());
  const selectAllNodes = useNodes((state) => state.selectAllNodes);
  const setNodes = useNodes((state) => state.setNodes);
  const toggleBypassSelected = useNodes((state) => state.toggleBypassSelected);
  const createNode = useNodes((state) => state.createNode);
  const addNode = useNodes((state) => state.addNode);
  const updateNodeData = useNodes((state) => state.updateNodeData);
  const addRecentNode = useRecentNodesStore((state) => state.addRecentNode);

  // Get store ref to access nodes imperatively without subscribing
  const nodeStore = useNodeStoreRef();
  const reactFlow = useReactFlow();
  const removeWorkflow = useWorkflowManager((state) => state.removeWorkflow);
  const getCurrentWorkflow = useWorkflowManager((state) => state.getCurrentWorkflow);
  const openWorkflows = useWorkflowManager((state) => state.openWorkflows);
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const copyPaste = useCopyPaste();
  const alignNodes = useAlignNodes();
  const duplicateNodes = useDuplicateNodes();
  const duplicateNodesVertical = useDuplicateNodes(true);
  const surroundWithGroup = useSurroundWithGroup();
  const selectConnectedAll = useSelectConnected({ direction: "both" });
  const selectConnectedInputs = useSelectConnected({ direction: "upstream" });
  const selectConnectedOutputs = useSelectConnected({ direction: "downstream" });
  const selectionActions = useSelectionActions();

  const nodeMenuStore = useNodeMenuStore(
    useShallow((state) => ({
      openNodeMenu: state.openNodeMenu,
      closeNodeMenu: state.closeNodeMenu,
      isMenuOpen: state.isMenuOpen
    }))
  );
  const handleFitView = useFitView();
  const navigate = useNavigate();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const inspectorToggle = useRightPanelStore((state) => state.toggleInspector);
  const leftPanelToggle = usePanelStore((state) => state.handleViewChange);
  const openFind = useFindInWorkflowStore((state) => state.openFind);
  const nodeFocus = useNodeFocus();

  // Cached on the `edges` array identity. A node drag pushes a fresh `nodes`
  // array ~60x/s and re-runs every NodeStore selector, so counting inline walked
  // every edge each frame even though edge selection cannot change during a drag.
  const selectedEdgeCountSelector = useMemo(() => {
    let lastEdges: Edge[] | null = null;
    let lastCount = 0;
    return (state: NodeStoreState) => {
      if (state.edges === lastEdges) {
        return lastCount;
      }
      lastEdges = state.edges;
      let count = 0;
      for (const edge of state.edges) {
        if (edge.selected) count++;
      }
      lastCount = count;
      return count;
    };
  }, []);
  const selectedEdgeCount = useNodes(selectedEdgeCountSelector);

  const { handleCopy, handlePaste, handleCut } = copyPaste;
  const { openNodeMenu, closeNodeMenu, isMenuOpen } = nodeMenuStore;

  const handleOpenNodeMenu = useCallback(() => {
    // Space toggles: close when already open. (When the menu is open its search
    // input usually has focus, so the close-on-space-in-empty-search path in
    // SearchInput handles that case; this covers a focused canvas.)
    if (isMenuOpen) {
      closeNodeMenu();
      return;
    }
    if (!active || isTextInputActive()) {
      return;
    }

    const mousePos = getMousePosition();
    openNodeMenu({
      x: mousePos.x,
      y: mousePos.y,
      centerOnScreen: true
    });
  }, [active, isMenuOpen, openNodeMenu, closeNodeMenu]);

  const handleGroup = useCallback(() => {
    const selectedNodes = nodeStore.getState().getSelectedNodes();
    if (selectedNodes.length) {
      surroundWithGroup({ selectedNodes });
    }
  }, [surroundWithGroup, nodeStore]);

  const handleBypassSelected = useCallback(() => {
    const selectedNodeCount = nodeStore.getState().getSelectedNodeCount();
    if (selectedNodeCount > 0) {
      toggleBypassSelected();
    }
  }, [toggleBypassSelected, nodeStore]);

  const handleSelectConnectedAll = useCallback(() => {
    const selectedNodeCount = nodeStore.getState().getSelectedNodeCount();
    if (selectedNodeCount > 0) {
      selectConnectedAll.selectConnected();
    }
  }, [selectConnectedAll, nodeStore]);

  const handleSelectConnectedInputs = useCallback(() => {
    const selectedNodeCount = nodeStore.getState().getSelectedNodeCount();
    if (selectedNodeCount > 0) {
      selectConnectedInputs.selectConnected();
    }
  }, [selectConnectedInputs, nodeStore]);

  const handleSelectConnectedOutputs = useCallback(() => {
    const selectedNodeCount = nodeStore.getState().getSelectedNodeCount();
    if (selectedNodeCount > 0) {
      selectConnectedOutputs.selectConnected();
    }
  }, [selectConnectedOutputs, nodeStore]);

  const handleZoomIn = useCallback(() => {
    reactFlow.zoomIn({ duration: 200 });
  }, [reactFlow]);

  const handleZoomOut = useCallback(() => {
    reactFlow.zoomOut({ duration: 200 });
  }, [reactFlow]);

  const handleZoomToPreset = useCallback(
    (preset: number) => {
      reactFlow.zoomTo(preset, { duration: 200 });
    },
    [reactFlow]
  );

  const handleAddNodeAtCursor = useCallback(
    (nodeType: string) => {
      const metadata = useMetadataStore.getState().getMetadata(nodeType);
      if (!metadata) {
        addNotification({
          content: `Node type ${nodeType} is not available`,
          type: "warning"
        });
        return;
      }
      const position = reactFlow.screenToFlowPosition(getMousePosition());
      const { node, afterAdd, onAdded } = instantiatePaletteNode(
        metadata,
        position,
        createNode
      );
      addNode(node);
      if (afterAdd) {
        updateNodeData(node.id, afterAdd);
      }
      onAdded?.(node.id);
      addRecentNode(nodeType);
    },
    [reactFlow, createNode, addNode, updateNodeData, addRecentNode, addNotification]
  );

  const handleAlign = useCallback(() => {
    alignNodes({ arrangeSpacing: false });
  }, [alignNodes]);

  const handleAlignWithSpacing = useCallback(() => {
    alignNodes({ arrangeSpacing: true });
  }, [alignNodes]);

  const closeCurrentWorkflow = useCallback(() => {
    // Close the active workspace tab — mirrors WorkspaceTabBar's × button.
    // The legacy WorkflowManager-only close removed the workflow and navigated
    // /editor (which now just re-opens a tab), leaving the visible tab in place.
    const { activeTabId, tabs, closeTab } = useWorkspaceTabsStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    closeTab(tab.id);
    if (tab.type === "workflow") {
      removeWorkflow(tab.ref);
    }
  }, [removeWorkflow]);

  const handleNewWorkflow = useCallback(async () => {
    const newWorkflow = await createNewWorkflow();
    navigate(`/editor/${newWorkflow.id}`);
  }, [createNewWorkflow, navigate]);

  const handleSwitchTab = useCallback(
    (direction: "prev" | "next") => {
      const workflow = getCurrentWorkflow();
      if (workflow) {
        const currentIndex = openWorkflows.findIndex(
          (w) => w.id === workflow.id
        );
        let newIndex;
        if (direction === "prev") {
          newIndex =
            currentIndex <= 0 ? openWorkflows.length - 1 : currentIndex - 1;
        } else {
          newIndex =
            currentIndex >= openWorkflows.length - 1 ? 0 : currentIndex + 1;
        }
        navigate(`/editor/${openWorkflows[newIndex].id}`);
      }
    },
    [getCurrentWorkflow, openWorkflows, navigate]
  );

  const handleSwitchToTab = useCallback(
    (index: number) => {
      if (index < openWorkflows.length) {
        navigate(`/editor/${openWorkflows[index].id}`);
      }
    },
    [openWorkflows, navigate]
  );

  const handleSave = useCallback(async () => {
    const workflow = getCurrentWorkflow();
    if (workflow) {
      try {
        await saveWorkflow(workflow);
        addNotification({
          content: `Workflow ${workflow.name} saved`,
          type: "success",
          alert: true
        });
      } catch (error) {
        console.error("Failed to save workflow:", error);
        addNotification({
          content: `Failed to save workflow: ${error instanceof Error ? error.message : "Server unreachable"}`,
          type: "error",
          alert: true
        });
      }
    }
  }, [saveWorkflow, getCurrentWorkflow, addNotification]);

  const handleShowKeyboardShortcuts = useCallback(() => {
    if (onShowShortcuts) {
      onShowShortcuts();
    }
  }, [onShowShortcuts]);

  const handleMenuEvent = useCallback(
    (data: MenuEventData) => {
      if (!active) {
        return;
      }
      // Every mounted editor receives each menu event, and the parent editor
      // stays active behind an open subgraph. Canvas actions go to the editor
      // on screen; workspace actions go to the workflow's own editor, never
      // also to its subgraph editors.
      if (CANVAS_MENU_EVENTS.has(data.type)) {
        if (getRoot && !canTakeFocus(getRoot())) {
          return;
        }
        if (GRAPH_EDIT_MENU_EVENTS.has(data.type) && isTextInputActive()) {
          return;
        }
      } else if (
        useSubgraphTabsStore.getState().getTab(nodeStore.getState().workflow.id)
      ) {
        return;
      }
      // When the sketch editor is mounted it owns selectAll/duplicate;
      // these are routed there via its own menu handler. Avoid double-firing
      // node-editor actions on top.
      const isSketchActive =
        useSketchCanvasRefStore.getState().flattenToDataUrl !== null;
      if (
        isSketchActive &&
        (data.type === "selectAll" || data.type === "duplicate")
      ) {
        return;
      }
      switch (data.type) {
        case "copy":
          handleCopy();
          break;
        case "paste":
          handlePaste();
          break;
        case "cut":
          handleCut();
          break;
        case "selectAll":
          selectAllNodes();
          break;
        case "undo":
          undoHistory();
          break;
        case "redo":
          redoHistory();
          break;
        // "close" / "closeTab" (Cmd+W) are handled at the workspace level
        // (useWorkspaceMenuShortcuts) so they close the active tab for every
        // surface, not just the node editor.
        case "fitView":
          handleFitView({ padding: 0.5 });
          break;
        case "newTab":
          handleNewWorkflow();
          break;
        case "resetZoom":
          reactFlow.zoomTo(0.5, { duration: 200 });
          break;
        case "zoomIn":
          reactFlow.zoomIn();
          break;
        case "zoomOut":
          reactFlow.zoomOut();
          break;
        case "prevTab":
          handleSwitchTab("prev");
          break;
        case "nextTab":
          handleSwitchTab("next");
          break;
        case "align":
          alignNodes({ arrangeSpacing: false });
          break;
        case "alignWithSpacing":
          alignNodes({ arrangeSpacing: true });
          break;
        case "saveWorkflow":
          handleSave();
          break;
        case "duplicate":
          duplicateNodes();
          break;
        case "duplicateVertical":
          duplicateNodesVertical();
          break;
        case "group":
          handleGroup();
          break;
        case "switchToTab":
          if (data.index !== undefined) {
            handleSwitchToTab(data.index);
          }
          break;
        default:
          break;
      }
    },
    [
      active,
      getRoot,
      nodeStore,
      handleCopy,
      handlePaste,
      handleCut,
      selectAllNodes,
      undoHistory,
      redoHistory,
      handleFitView,
      handleNewWorkflow,
      reactFlow,
      handleSwitchTab,
      alignNodes,
      handleSave,
      duplicateNodes,
      duplicateNodesVertical,
      handleGroup,
      handleSwitchToTab
    ]
  );

  const handleMoveNodes = useCallback(
    (direction: { x?: number; y?: number }) => {
      const selectedNodes = nodeStore.getState().getSelectedNodes();
      if (selectedNodes.length > 0) {
        setNodes((nodes: Node<NodeData>[]) => {
          const byId = new Map(nodes.map((node) => [node.id, node]));
          // A child of a selected group already moves with the group; moving
          // it as well would shift it inside the group on every press.
          return nodes.map(
            (node: Node<NodeData>): Node<NodeData> =>
              node.selected && !hasSelectedAncestor(node, byId)
                ? {
                    ...node,
                    position: {
                      x: node.position.x + (direction.x || 0),
                      y: node.position.y + (direction.y || 0)
                    }
                  }
                : node
          );
        });
      }
    },
    [nodeStore, setNodes]
  );

  const handleInspectorToggle = useCallback(() => {
    inspectorToggle();
  }, [inspectorToggle]);

  const handleWorkflowSettingsToggle = useCallback(() => {
    leftPanelToggle("settings");
  }, [leftPanelToggle]);

  const toggleCollapse = useToggleCollapse();
  const handleToggleSelectedNodesCollapsed = useCallback(() => {
    toggleCollapse();
  }, [toggleCollapse]);

  useMenuHandler(handleMenuEvent);

  // getIsElectronDetails() returns a fresh object literal on every call. Left
  // unmemoized it invalidates the registration effect below on every render,
  // tearing down and rebuilding ~60 shortcut combos per frame during drags.
  const electronDetails = useMemo(getIsElectronDetails, []);

  // Helper to swap Control with Meta on macOS for registration purposes
  // Also maps Delete to Backspace on macOS since Mac keyboards send "Backspace" for the delete key
  const mapComboForOS = (combo: string[]): string[] =>
    combo.map((k) => {
      if (k === "Control") {
        return ControlOrMeta;
      }
      if (isMac() && k === "Delete") {
        return "Backspace";
      }
      return k;
    });

  // Mapping slug -> registration meta (callback, preventDefault, active)
  const shortcutMeta = useMemo(() => {
    const meta: Record<
      string,
      { callback: () => void; preventDefault?: boolean; active?: boolean }
    > = {
      copy: { callback: handleCopy, preventDefault: false },
      cut: { callback: handleCut },
      paste: { callback: handlePaste, preventDefault: false },
      undo: { callback: undoHistory },
      redo: { callback: redoHistory },
      selectAll: { callback: selectAllNodes },
      align: { callback: handleAlign, active: selectedNodeCount > 0 },
      alignWithSpacing: {
        callback: handleAlignWithSpacing,
        active: selectedNodeCount > 0
      },
      duplicate: { callback: duplicateNodes },
      duplicateVertical: { callback: duplicateNodesVertical },
      fitView: { callback: () => handleFitView({ padding: 0.4 }) },
      resetZoom: {
        callback: () => {
          reactFlow.zoomTo(0.5, { duration: 200 });
        }
      },
      openNodeMenu: { callback: handleOpenNodeMenu },
      groupSelected: { callback: handleGroup },
      toggleInspector: { callback: handleInspectorToggle },
      toggleWorkflowSettings: { callback: handleWorkflowSettingsToggle },
      showKeyboardShortcuts: { callback: handleShowKeyboardShortcuts },
      openSettings: {
        callback: () => openSettingsTab()
      },
      saveWorkflow: { callback: handleSave },
      newWorkflow: { callback: handleNewWorkflow },
      closeWorkflow: { callback: closeCurrentWorkflow },
      zoomIn: { callback: handleZoomIn },
      zoomOut: { callback: handleZoomOut },
      zoom50: { callback: () => handleZoomToPreset(0.5) },
      zoom100: { callback: () => handleZoomToPreset(1) },
      zoom200: { callback: () => handleZoomToPreset(2) },
      prevTab: { callback: () => handleSwitchTab("prev") },
      nextTab: { callback: () => handleSwitchTab("next") },
      moveLeft: { callback: () => handleMoveNodes({ x: -10 }) },
      moveRight: { callback: () => handleMoveNodes({ x: 10 }) },
      moveUp: { callback: () => handleMoveNodes({ y: -10 }) },
      moveDown: { callback: () => handleMoveNodes({ y: 10 }) },
      bypassNode: {
        callback: handleBypassSelected,
        active: selectedNodeCount > 0
      },
      toggleNodeCollapsed: {
        callback: handleToggleSelectedNodesCollapsed,
        active: selectedNodeCount > 0
      },
      findInWorkflow: { callback: openFind },
      selectConnectedAll: {
        callback: handleSelectConnectedAll,
        active: selectedNodeCount > 0
      },
      selectConnectedInputs: {
        callback: handleSelectConnectedInputs,
        active: selectedNodeCount > 0
      },
      selectConnectedOutputs: {
        callback: handleSelectConnectedOutputs,
        active: selectedNodeCount > 0
      },
      alignLeft: {
        callback: selectionActions.alignLeft,
        active: selectedNodeCount > 1
      },
      alignCenter: {
        callback: selectionActions.alignCenter,
        active: selectedNodeCount > 1
      },
      alignRight: {
        callback: selectionActions.alignRight,
        active: selectedNodeCount > 1
      },
      alignTop: {
        callback: selectionActions.alignTop,
        active: selectedNodeCount > 1
      },
      alignMiddle: {
        callback: selectionActions.alignMiddle,
        active: selectedNodeCount > 1
      },
      alignBottom: {
        callback: selectionActions.alignBottom,
        active: selectedNodeCount > 1
      },
      distributeHorizontal: {
        callback: selectionActions.distributeHorizontal,
        active: selectedNodeCount > 1
      },
      distributeVertical: {
        callback: selectionActions.distributeVertical,
        active: selectedNodeCount > 1
      },
      stackSelected: {
        callback: selectionActions.stackSelected,
        active: selectedNodeCount > 1
      },
      arrangeGrid: {
        callback: selectionActions.arrangeGrid,
        active: selectedNodeCount > 1
      },
      deleteSelected: {
        callback: selectionActions.deleteSelected,
        active: selectedNodeCount > 0 || selectedEdgeCount > 0
      },
      navigateNextNode: { callback: nodeFocus.focusNext },
      navigatePrevNode: { callback: nodeFocus.focusPrev },
      selectFocusedNode: {
        callback: nodeFocus.selectFocused,
        active: nodeFocus.focusedNodeId !== null
      },
      exitNavigationMode: {
        callback: nodeFocus.exitNavigationMode,
        active: nodeFocus.isNavigationMode
      },
      focusNodeUp: { callback: nodeFocus.focusUp },
      focusNodeDown: { callback: nodeFocus.focusDown },
      focusNodeLeft: { callback: nodeFocus.focusLeft },
      focusNodeRight: { callback: nodeFocus.focusRight },
      goBack: {
        callback: nodeFocus.goBack,
        active: nodeFocus.focusHistory.length > 1
      }
    };

    for (const { slug, nodeType } of ADD_NODE_HOTKEYS) {
      meta[slug] = { callback: () => handleAddNodeAtCursor(nodeType) };
    }

    // Switch-to-tab (1-9)
    for (let i = 1; i <= 9; i++) {
      meta[`switchToTab${i}`] = {
        callback: () => handleSwitchToTab(i - 1)
      };
    }
    return meta;
  }, [
    handleCopy,
    handleCut,
    handlePaste,
    undoHistory,
    redoHistory,
    selectAllNodes,
    handleAlign,
    selectedNodeCount,
    selectedEdgeCount,
    handleAlignWithSpacing,
    duplicateNodes,
    duplicateNodesVertical,
    handleOpenNodeMenu,
    handleGroup,
    handleInspectorToggle,
    handleWorkflowSettingsToggle,
    handleShowKeyboardShortcuts,
    handleSave,
    handleNewWorkflow,
    closeCurrentWorkflow,
    handleZoomIn,
    handleZoomOut,
    handleZoomToPreset,
    handleBypassSelected,
    handleToggleSelectedNodesCollapsed,
    handleFitView,
    handleSwitchTab,
    handleMoveNodes,
    handleSwitchToTab,
    openFind,
    handleSelectConnectedAll,
    handleSelectConnectedInputs,
    handleSelectConnectedOutputs,
    selectionActions.alignLeft,
    selectionActions.alignCenter,
    selectionActions.alignRight,
    selectionActions.alignTop,
    selectionActions.alignMiddle,
    selectionActions.alignBottom,
    selectionActions.distributeHorizontal,
    selectionActions.distributeVertical,
    selectionActions.stackSelected,
    selectionActions.arrangeGrid,
    selectionActions.deleteSelected,
    handleAddNodeAtCursor,
    reactFlow,
    nodeFocus.focusNext,
    nodeFocus.focusPrev,
    nodeFocus.focusedNodeId,
    nodeFocus.selectFocused,
    nodeFocus.isNavigationMode,
    nodeFocus.exitNavigationMode,
    nodeFocus.focusUp,
    nodeFocus.focusDown,
    nodeFocus.focusLeft,
    nodeFocus.focusRight,
    nodeFocus.goBack,
    nodeFocus.focusHistory.length
  ]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const disposers: Array<() => void> = [];

    NODE_EDITOR_SHORTCUTS.forEach((sc) => {
      if (!sc.registerCombo) {
        return;
      }
      if (sc.electronOnly && !electronDetails.isElectron) {
        return;
      }

      const meta = shortcutMeta[sc.slug];
      if (!meta) {
        return;
      }

      const combos = [sc.keyCombo, ...(sc.altKeyCombos ?? [])];

      combos.forEach((cmb) => {
        const normalized = mapComboForOS(cmb)
          .map((k) => k.toLowerCase())
          .sort()
          .join("+");
        disposers.push(
          registerComboCallback(normalized, {
            callback: meta.callback,
            preventDefault: meta.preventDefault ?? true,
            active: meta.active ?? true,
            scope: "canvas",
            target: getRoot
          })
        );
      });
    });

    return () => {
      disposers.forEach((dispose) => dispose());
    };
    // selectedNodeCount affects active flags for align shortcuts
  }, [active, selectedNodeCount, electronDetails, shortcutMeta, getRoot]);

};
