import { useCallback } from "react";
import { useCombo } from "../stores/KeyPressedStore";
import { getMousePosition } from "../utils/MousePosition";
import { useNodes, useTemporalNodes } from "../contexts/NodeContext";
import { useCopyPaste } from "./handlers/useCopyPaste";
import useAlignNodes from "./useAlignNodes";
import { useSurroundWithGroup } from "./nodes/useSurroundWithGroup";
import { useDuplicateNodes } from "./useDuplicate";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { data, useNavigate } from "react-router-dom";
import { useFitView } from "./useFitView";
import { useMenuHandler } from "./useIpcRenderer";
import { useReactFlow } from "@xyflow/react";
import { useNotificationStore } from "../stores/NotificationStore";
import { useRightPanelStore } from "../stores/RightPanelStore";
import { NodeData } from "../stores/NodeData";
import { Node } from "@xyflow/react";
import { isMac } from "../utils/platform";

const ControlOrMeta = isMac() ? "Meta" : "Control";

export const useNodeEditorShortcuts = (active: boolean) => {
  /* USE STORE */
  const nodeHistory = useTemporalNodes((state) => state);
  const { selectedNodes, selectAllNodes, setNodes } = useNodes((state) => ({
    selectedNodes: state.getSelectedNodes(),
    selectAllNodes: state.selectAllNodes,
    setNodes: state.setNodes
  }));

  const reactFlow = useReactFlow();

  const {
    saveExample,
    removeWorkflow,
    getCurrentWorkflow,
    openWorkflows,
    createNewWorkflow,
    saveWorkflow
  } = useWorkflowManager((state) => ({
    saveExample: state.saveExample,
    removeWorkflow: state.removeWorkflow,
    getCurrentWorkflow: state.getCurrentWorkflow,
    openWorkflows: state.openWorkflows,
    createNewWorkflow: state.createNew,
    saveWorkflow: state.saveWorkflow
  }));

  /* UTILS */
  const { handleCopy, handlePaste, handleCut } = useCopyPaste();
  const alignNodes = useAlignNodes();
  const duplicateNodes = useDuplicateNodes();
  const duplicateNodesVertical = useDuplicateNodes(true);
  const surroundWithGroup = useSurroundWithGroup();

  // OPEN NODE MENU
  const { openNodeMenu } = useNodeMenuStore((state) => ({
    openNodeMenu: state.openNodeMenu
  }));
  const handleOpenNodeMenu = useCallback(() => {
    const mousePos = getMousePosition();
    openNodeMenu({
      x: mousePos.x,
      y: mousePos.y
    });
  }, [openNodeMenu]);

  const handleGroup = useCallback(() => {
    if (selectedNodes.length) {
      surroundWithGroup({ selectedNodes });
    }
  }, [surroundWithGroup, selectedNodes]);

  const handleFitView = useFitView();
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

  const navigate = useNavigate();

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

  const addNotification = useNotificationStore(
    (state) => state.addNotification
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

  const handleSaveExample = useCallback(async () => {
    try {
      await saveExample();
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
  }, [saveExample, addNotification]);

  // Define OS-specific tab switching shortcuts
  const prevTabShortcut = isMac()
    ? [ControlOrMeta, "Shift", "["]
    : [ControlOrMeta, "PageUp"];
  const nextTabShortcut = isMac()
    ? [ControlOrMeta, "Shift", "]"]
    : [ControlOrMeta, "PageDown"];

  // Alternative Mac shortcuts
  const altPrevTabShortcut = [ControlOrMeta, "Alt", "ArrowLeft"];
  const altNextTabShortcut = [ControlOrMeta, "Alt", "ArrowRight"];

  useCombo([" "], handleOpenNodeMenu);
  useCombo(["f"], () => handleFitView({ padding: 0.4 }));
  useCombo([ControlOrMeta, "="], handleZoomIn);
  useCombo([ControlOrMeta, "-"], handleZoomOut);

  useCombo(["a"], handleAlign, selectedNodes.length > 0);
  useCombo(["Shift", "a"], handleAlignWithSpacing, selectedNodes.length > 0);

  useCombo([ControlOrMeta, "t"], handleNewWorkflow);
  useCombo([ControlOrMeta, "w"], closeCurrentWorkflow);

  useCombo([ControlOrMeta, "a"], selectAllNodes);
  useCombo([ControlOrMeta, "c"], handleCopy, false);
  useCombo([ControlOrMeta, "v"], handlePaste, false);
  useCombo([ControlOrMeta, "x"], handleCut);
  useCombo([ControlOrMeta, "s"], handleSave);

  useCombo([ControlOrMeta, "Shift", "e"], handleSaveExample);

  useCombo([ControlOrMeta, "d"], duplicateNodes);
  useCombo([ControlOrMeta, "Shift", "d"], duplicateNodesVertical);

  useCombo([ControlOrMeta, "g"], handleGroup);

  useCombo([ControlOrMeta, "z"], nodeHistory.undo);
  useCombo([ControlOrMeta, "Shift", "z"], nodeHistory.redo);

  // Tab switching shortcuts (primary and alternative)
  useCombo(prevTabShortcut, () => handleSwitchTab("prev"));
  useCombo(nextTabShortcut, () => handleSwitchTab("next"));
  useCombo(altPrevTabShortcut, () => handleSwitchTab("prev"));
  useCombo(altNextTabShortcut, () => handleSwitchTab("next"));

  // Add number key shortcuts (1-9) for direct tab switching
  useCombo([ControlOrMeta, "1"], () => handleSwitchToTab(0));
  useCombo([ControlOrMeta, "2"], () => handleSwitchToTab(1));
  useCombo([ControlOrMeta, "3"], () => handleSwitchToTab(2));
  useCombo([ControlOrMeta, "4"], () => handleSwitchToTab(3));
  useCombo([ControlOrMeta, "5"], () => handleSwitchToTab(4));
  useCombo([ControlOrMeta, "6"], () => handleSwitchToTab(5));
  useCombo([ControlOrMeta, "7"], () => handleSwitchToTab(6));
  useCombo([ControlOrMeta, "8"], () => handleSwitchToTab(7));
  useCombo([ControlOrMeta, "9"], () => handleSwitchToTab(8));

  // useCombo(
  //   ["Alt", "k"],
  //   useCallback(() => setOpenCommandMenu(true), [setOpenCommandMenu])
  // );
  // useCombo(
  //   ["Meta", "k"],
  //   useCallback(() => setOpenCommandMenu(true), [setOpenCommandMenu])
  // );

  const handleMenuEvent = useCallback(
    (data: any) => {
      if (!active) return;
      console.log("menu-event", data);
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

  useMenuHandler(handleMenuEvent);

  const handleMoveNodes = useCallback(
    (direction: { x?: number; y?: number }) => {
      if (selectedNodes.length > 0) {
        const updatedNodes = selectedNodes.map((node) => ({
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

  // Add arrow key shortcuts
  useCombo(["ArrowLeft"], () => handleMoveNodes({ x: -10 }));
  useCombo(["ArrowRight"], () => handleMoveNodes({ x: 10 }));
  useCombo(["ArrowUp"], () => handleMoveNodes({ y: -10 }));
  useCombo(["ArrowDown"], () => handleMoveNodes({ y: 10 }));

  /* INSPECTOR TOGGLE */
  const inspectorToggle = useRightPanelStore((state) => state.handleViewChange);

  const handleInspectorToggle = useCallback(() => {
    inspectorToggle("inspector");
  }, [inspectorToggle]);

  // Open/close Inspector panel
  useCombo(["i"], handleInspectorToggle);
};
