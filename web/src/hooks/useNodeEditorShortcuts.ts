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
import { QUICKNOTE_NODE_METADATA } from "../utils/nodeUtils";

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
  // All hooks above this line

  // Now destructure/store values from the hook results
  const {
    selectedNodes,
    selectAllNodes,
    setNodes,
    toggleBypassSelected,
    createNode,
    addNode
  } = nodesStore;
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
      await saveWorkflow(workflow);
      addNotification({
        content: `Workflow ${workflow.name} saved`,
        type: "success",
        alert: true
      });
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
          reactFlow.setViewport({
            x: 0,
            y: 0,
            zoom: 1
          });
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

  const handleAddQuickNote = useCallback(() => {
    const screenCenter = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    };
    const position = reactFlow.screenToFlowPosition(screenCenter);
    const newNode = createNode(QUICKNOTE_NODE_METADATA, position);
    newNode.width = 200;
    newNode.height = 120;
    newNode.style = { width: 200, height: 120 };
    newNode.data = {
      ...newNode.data,
      properties: {
        quicknote_color: "#FFF9C4",
        quicknote_text: ""
      }
    };
    addNode(newNode);
  }, [reactFlow, createNode, addNode]);

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
      openNodeMenu: { callback: handleOpenNodeMenu },
      groupSelected: { callback: handleGroup },
      toggleInspector: { callback: handleInspectorToggle },
      showKeyboardShortcuts: { callback: handleShowKeyboardShortcuts },
      saveWorkflow: { callback: handleSave },
      saveExample: { callback: handleSaveExample },
      newWorkflow: { callback: handleNewWorkflow },
      closeWorkflow: { callback: closeCurrentWorkflow },
      zoomIn: { callback: handleZoomIn },
      zoomOut: { callback: handleZoomOut },
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
      addQuickNote: { callback: handleAddQuickNote }
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
    handleInspectorToggle,
    handleShowKeyboardShortcuts,
    handleSave,
    handleSaveExample,
    handleNewWorkflow,
    closeCurrentWorkflow,
    handleZoomIn,
    handleZoomOut,
    handleBypassSelected,
    handleFitView,
    handleSwitchTab,
    handleMoveNodes,
    handleSwitchToTab,
    openFind,
     handleSelectConnectedAll,
     handleSelectConnectedInputs,
     handleSelectConnectedOutputs,
     handleAddQuickNote
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
