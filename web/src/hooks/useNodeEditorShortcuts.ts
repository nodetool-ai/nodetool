import { useCallback, useEffect, useMemo, useState } from "react";
import {
  registerComboCallback,
  unregisterComboCallback
} from "../stores/KeyPressedStore";
import { NODE_EDITOR_SHORTCUTS } from "../config/shortcuts";
import { getIsElectronDetails } from "../utils/browser";
import { getMousePosition } from "../utils/MousePosition";
import { useNodes, useTemporalNodes } from "../contexts/NodeContext";
import { useCopyPaste } from "./handlers/useCopyPaste";
import useAlignNodes from "./useAlignNodes";
import { useSurroundWithGroup } from "./nodes/useSurroundWithGroup";
import { useDuplicateNodes } from "./useDuplicate";
import { useSelectConnected } from "./useSelectConnected";
import { shallow } from "zustand/shallow";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useNavigate } from "react-router-dom";
import { useFitView } from "./useFitView";
import { useMenuHandler } from "./useIpcRenderer";
import { useReactFlow } from "@xyflow/react";
import { useNotificationStore } from "../stores/NotificationStore";
import { useRightPanelStore } from "../stores/RightPanelStore";
import { NodeData } from "../stores/NodeData";
import { Node } from "@xyflow/react";
import { isMac } from "../utils/platform";
import { useFindInWorkflow } from "./useFindInWorkflow";
import { useSelectionActions } from "./useSelectionActions";
import { useNodeFocus } from "./useNodeFocus";
import { COMMENT_NODE_METADATA } from "../utils/nodeUtils";

/**
 * Hook that registers and manages all keyboard shortcuts for the node editor.
 * Provides comprehensive keyboard-based workflow editing including:
 * - Clipboard operations (copy, cut, paste)
 * - Node manipulation (delete, duplicate, align, group)
 * - View navigation (zoom, pan, fit view)
 * - Workflow operations (save, close, create new)
 * - Node search and selection
 * 
 * Shortcuts are registered with KeyPressedStore and respond to configurable
 * keyboard combinations defined in NODE_EDITOR_SHORTCUTS config.
 * 
 * @param active - Whether the hook should register shortcuts (false when editor not active)
 * @param onShowShortcuts - Optional callback to show keyboard shortcuts help dialog
 * 
 * @example
 * ```typescript
 * // Enable shortcuts in active editor
 * useNodeEditorShortcuts(true);
 * 
 * // With shortcuts dialog
 * useNodeEditorShortcuts(true, () => setShowShortcuts(true));
 * ```
 * 
 * @example
 * **Common Shortcuts**:
 * - `Ctrl+C` / `Cmd+C` - Copy selected nodes
 * - `Ctrl+V` / `Cmd+V` - Paste nodes
 * - `Ctrl+S` / `Cmd+S` - Save workflow
 * - `Ctrl+A` / `Cmd+A` - Select all nodes
 * - `Ctrl+F` / `Cmd+F` - Find in workflow
 * - `Ctrl+/-` - Zoom in/out
 * - `Delete/Backspace` - Delete selected nodes
 * - `Alt+Arrows` - Focus navigation
 */
const ControlOrMeta = isMac() ? "Meta" : "Control";

export const useNodeEditorShortcuts = (
  active: boolean,
  onShowShortcuts?: () => void
) => {
  const [packageNameDialogOpen, setPackageNameDialogOpen] = useState(false);
  const [packageNameInput, setPackageNameInput] = useState("");

  /* USE STORE */
  const nodeHistory = useTemporalNodes((state) => state);
  const nodesStore = useNodes((state) => ({
    selectedNodes: state.getSelectedNodes(),
    selectAllNodes: state.selectAllNodes,
    setNodes: state.setNodes,
    toggleBypassSelected: state.toggleBypassSelected,
    createNode: state.createNode,
    addNode: state.addNode
  }));
  const reactFlow = useReactFlow();
  const workflowManager = useWorkflowManager((state) => ({
    saveExample: state.saveExample,
    removeWorkflow: state.removeWorkflow,
    getCurrentWorkflow: state.getCurrentWorkflow,
    openWorkflows: state.openWorkflows,
    createNewWorkflow: state.createNew,
    saveWorkflow: state.saveWorkflow
  }));
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
    (state) => ({
      openNodeMenu: state.openNodeMenu
    }),
    shallow
  );
  const handleFitView = useFitView();
  const navigate = useNavigate();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const inspectorToggle = useRightPanelStore((state) => state.handleViewChange);
  const findInWorkflow = useFindInWorkflow();
  const nodeFocus = useNodeFocus();
  // All hooks above this line

  // Now destructure/store values from the hook results
  const { selectedNodes, selectAllNodes, setNodes, toggleBypassSelected, createNode, addNode } =
    nodesStore;
  const {
    saveExample,
    removeWorkflow,
    getCurrentWorkflow,
    openWorkflows,
    createNewWorkflow,
    saveWorkflow
  } = workflowManager;
  const { handleCopy, handlePaste, handleCut } = copyPaste;
  const { openNodeMenu } = nodeMenuStore;
  const { openFind } = findInWorkflow;

  // All useCallback hooks
  const handleOpenNodeMenu = useCallback(() => {
    const mousePos = getMousePosition();
    openNodeMenu({
      x: mousePos.x,
      y: mousePos.y,
      centerOnScreen: true
    });
  }, [openNodeMenu]);

  const handleGroup = useCallback(() => {
    if (selectedNodes.length) {
      surroundWithGroup({ selectedNodes });
    }
  }, [surroundWithGroup, selectedNodes]);

  const handleAddComment = useCallback(() => {
    // Get center of viewport for comment placement
    const { x, y, zoom } = reactFlow.getViewport();
    const centerX = (window.innerWidth / 2 - x) / zoom;
    const centerY = (window.innerHeight / 2 - y) / zoom;

    const newNode = createNode(COMMENT_NODE_METADATA, { x: centerX, y: centerY });
    newNode.width = 150;
    newNode.height = 100;
    newNode.style = { width: 150, height: 100 };
    addNode(newNode);
  }, [createNode, addNode, reactFlow]);

  const handleBypassSelected = useCallback(() => {
    if (selectedNodes.length > 0) {
      toggleBypassSelected();
    }
  }, [selectedNodes.length, toggleBypassSelected]);

  const handleSelectConnectedAll = useCallback(() => {
    if (selectedNodes.length > 0) {
      selectConnectedAll.selectConnected();
    }
  }, [selectedNodes.length, selectConnectedAll]);

  const handleSelectConnectedInputs = useCallback(() => {
    if (selectedNodes.length > 0) {
      selectConnectedInputs.selectConnected();
    }
  }, [selectedNodes.length, selectConnectedInputs]);

  const handleSelectConnectedOutputs = useCallback(() => {
    if (selectedNodes.length > 0) {
      selectConnectedOutputs.selectConnected();
    }
  }, [selectedNodes.length, selectConnectedOutputs]);

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

  const handleAlign = useCallback(() => {
    alignNodes({ arrangeSpacing: false });
  }, [alignNodes]);

  const handleAlignWithSpacing = useCallback(() => {
    alignNodes({ arrangeSpacing: true });
  }, [alignNodes]);

  const closeCurrentWorkflow = useCallback(() => {
    const workflow = getCurrentWorkflow();
    if (workflow) {
      removeWorkflow(workflow.id);
      const remaining = openWorkflows.filter((w) => w.id !== workflow.id);
      if (remaining.length > 0) {
        navigate(`/editor/${remaining[remaining.length - 1].id}`);
      } else {
        navigate("/editor");
      }
    }
  }, [removeWorkflow, getCurrentWorkflow, openWorkflows, navigate]);

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

  const handleSaveExample = useCallback(() => {
    setPackageNameDialogOpen(true);
  }, []);

  const handleSaveExampleConfirm = useCallback(async () => {
    try {
      await saveExample(packageNameInput);
      setPackageNameDialogOpen(false);
      setPackageNameInput("");
      addNotification({
        content: "Example saved successfully",
        type: "success",
        alert: true
      });
    } catch (error) {
      addNotification({
        content:
          error instanceof Error ? error.message : "Failed to save example",
        type: "error",
        alert: true
      });
    }
  }, [saveExample, packageNameInput, addNotification]);

  const handleSaveExampleCancel = useCallback(() => {
    setPackageNameDialogOpen(false);
    setPackageNameInput("");
  }, []);

  const handleShowKeyboardShortcuts = useCallback(() => {
    if (onShowShortcuts) {
      onShowShortcuts();
    }
  }, [onShowShortcuts]);

  const handleMenuEvent = useCallback(
    (data: any) => {
      if (!active) {
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
          nodeHistory.undo();
          break;
        case "redo":
          nodeHistory.redo();
          break;
        case "close":
          closeCurrentWorkflow();
          break;
        case "fitView":
          handleFitView({ padding: 0.5 });
          break;
        case "newTab":
          handleNewWorkflow();
          break;
        case "closeTab":
          closeCurrentWorkflow();
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
          handleSwitchToTab(data.index);
          break;
        default:
          break;
      }
    },
    [
      active,
      handleCopy,
      handlePaste,
      handleCut,
      selectAllNodes,
      nodeHistory,
      closeCurrentWorkflow,
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
      if (selectedNodes.length > 0) {
        selectedNodes.map((node) => ({
          ...node,
          position: {
            x: node.position.x + (direction.x || 0),
            y: node.position.y + (direction.y || 0)
          }
        }));
        setNodes((nodes: Node<NodeData>[]) =>
          nodes.map(
            (node: Node<NodeData>): Node<NodeData> =>
              node.selected
                ? {
                    ...node,
                    position: {
                      x: node.position.x + (direction.x || 0),
                      y: node.position.y + (direction.y || 0)
                    }
                  }
                : node
          )
        );
      }
    },
    [selectedNodes, setNodes]
  );

  const handleInspectorToggle = useCallback(() => {
    inspectorToggle("inspector");
  }, [inspectorToggle]);

  const handleWorkflowSettingsToggle = useCallback(() => {
    inspectorToggle("workflow");
  }, [inspectorToggle]);

  // IPC Menu handler hook
  useMenuHandler(handleMenuEvent);

  // ========================================================================
  // DERIVED VALUES AND CONSTANTS - AFTER ALL HOOKS
  // ========================================================================

  const electronDetails = getIsElectronDetails();

  // Helper to swap Control with Meta on macOS for registration purposes
  const mapComboForOS = (combo: string[]): string[] =>
    combo.map((k) => (k === "Control" ? ControlOrMeta : k));

  // Mapping slug -> registration meta (callback, preventDefault, active)
  const shortcutMeta = useMemo(() => {
    const meta: Record<
      string,
      { callback: () => void; preventDefault?: boolean; active?: boolean }
    > = {
      copy: { callback: handleCopy, preventDefault: false },
      cut: { callback: handleCut },
      paste: { callback: handlePaste, preventDefault: false },
      undo: { callback: nodeHistory.undo },
      redo: { callback: nodeHistory.redo },
      selectAll: { callback: selectAllNodes },
      align: { callback: handleAlign, active: selectedNodes.length > 0 },
      alignWithSpacing: {
        callback: handleAlignWithSpacing,
        active: selectedNodes.length > 0
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
      addComment: { callback: handleAddComment },
      toggleInspector: { callback: handleInspectorToggle },
      toggleWorkflowSettings: { callback: handleWorkflowSettingsToggle },
      showKeyboardShortcuts: { callback: handleShowKeyboardShortcuts },
      saveWorkflow: { callback: handleSave },
      saveExample: { callback: handleSaveExample },
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
        active: selectedNodes.length > 0
      },
      findInWorkflow: { callback: openFind },
      selectConnectedAll: {
        callback: handleSelectConnectedAll,
        active: selectedNodes.length > 0
      },
      selectConnectedInputs: {
        callback: handleSelectConnectedInputs,
        active: selectedNodes.length > 0
      },
      selectConnectedOutputs: {
        callback: handleSelectConnectedOutputs,
        active: selectedNodes.length > 0
      },
      alignLeft: {
        callback: selectionActions.alignLeft,
        active: selectedNodes.length > 1
      },
      alignCenter: {
        callback: selectionActions.alignCenter,
        active: selectedNodes.length > 1
      },
      alignRight: {
        callback: selectionActions.alignRight,
        active: selectedNodes.length > 1
      },
      alignTop: {
        callback: selectionActions.alignTop,
        active: selectedNodes.length > 1
      },
      alignMiddle: {
        callback: selectionActions.alignMiddle,
        active: selectedNodes.length > 1
      },
      alignBottom: {
        callback: selectionActions.alignBottom,
        active: selectedNodes.length > 1
      },
      distributeHorizontal: {
        callback: selectionActions.distributeHorizontal,
        active: selectedNodes.length > 1
      },
      distributeVertical: {
        callback: selectionActions.distributeVertical,
        active: selectedNodes.length > 1
      },
      deleteSelected: {
        callback: selectionActions.deleteSelected,
        active: selectedNodes.length > 0
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
    nodeHistory.undo,
    nodeHistory.redo,
    selectAllNodes,
    handleAlign,
    selectedNodes.length,
    handleAlignWithSpacing,
    duplicateNodes,
    duplicateNodesVertical,
    handleOpenNodeMenu,
    handleGroup,
    handleAddComment,
    handleInspectorToggle,
    handleWorkflowSettingsToggle,
    handleShowKeyboardShortcuts,
    handleSave,
    handleSaveExample,
    handleNewWorkflow,
    closeCurrentWorkflow,
    handleZoomIn,
    handleZoomOut,
    handleZoomToPreset,
    handleBypassSelected,
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
    selectionActions.deleteSelected,
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

  // useEffect for shortcut registration
  useEffect(() => {
    const registered: string[] = [];

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
        registerComboCallback(normalized, {
          callback: meta.callback,
          preventDefault: meta.preventDefault ?? true,
          active: meta.active ?? true
        });
        registered.push(normalized);
      });
    });

    return () => {
      registered.forEach((combo) => unregisterComboCallback(combo));
    };
    // selectedNodes length affects active flags for align shortcuts
  }, [selectedNodes.length, electronDetails, shortcutMeta]);

  // Return dialog state and handlers for external use
  return {
    packageNameDialogOpen,
    packageNameInput,
    setPackageNameInput,
    handleSaveExampleConfirm,
    handleSaveExampleCancel
  };
};
