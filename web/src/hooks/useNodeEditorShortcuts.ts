import { useCallback, useState } from "react";
import { useReactFlow, XYPosition } from "@xyflow/react";
import { useCombo } from "../stores/KeyPressedStore";
import { getMousePosition } from "../utils/MousePosition";
import { useNodes, useTemporalNodes } from "../contexts/NodeContext";
import { useCopyPaste } from "./handlers/useCopyPaste";
import useAlignNodes from "./useAlignNodes";
import { useSurroundWithGroup } from "./nodes/useSurroundWithGroup";
import { useDuplicateNodes } from "./useDuplicate";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";

export const useNodeEditorShortcuts = () => {
  const reactFlowInstance = useReactFlow();
  /* USE STORE */
  const nodeHistory = useTemporalNodes((state) => state);
  const { nodes, selectedNodes, setSelectedNodes } = useNodes((state) => ({
    nodes: state.nodes,
    selectedNodes: state.getSelectedNodes(),
    setSelectedNodes: state.setSelectedNodes
  }));

  const saveExample = useWorkflowManager((state) => state.saveExample);

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

  const handleFitView = useCallback(() => {
    if (selectedNodes.length) {
      setTimeout(() => {
        setSelectedNodes([]);
      }, 1000);
      const nodesById = nodes.reduce((acc, node) => {
        const pos = {
          x: node.position.x,
          y: node.position.y
        };
        acc[node.id] = pos;
        return acc;
      }, {} as Record<string, XYPosition>);

      const nodePositions = selectedNodes.map((node) => {
        const parent = node.parentId ? nodesById[node.parentId] : null;
        const parentPos = parent
          ? { x: parent.x, y: parent.y }
          : { x: 0, y: 0 };
        return {
          x: node.position.x + parentPos.x,
          y: node.position.y + parentPos.y,
          width: node.measured?.width || 0,
          height: node.measured?.height || 0
        };
      });

      const xMin = Math.min(...nodePositions.map((pos) => pos.x));
      const xMax = Math.max(...nodePositions.map((pos) => pos.x + pos.width));
      const yMin = Math.min(...nodePositions.map((pos) => pos.y));
      const yMax = Math.max(...nodePositions.map((pos) => pos.y + pos.height));

      const padding = 0;
      const bounds = {
        x: xMin - padding,
        y: yMin - padding,
        width: xMax - xMin + padding * 2,
        height: yMax - yMin + padding * 2
      };

      reactFlowInstance.fitBounds(bounds, { duration: 1000, padding: 0.2 });
    } else {
      reactFlowInstance.fitView({ duration: 1000, padding: 0.1 });
    }
  }, [nodes, selectedNodes, setSelectedNodes, reactFlowInstance]);

  const handleAlign = useCallback(() => {
    alignNodes({ arrangeSpacing: false });
  }, [alignNodes]);

  const handleAlignWithSpacing = useCallback(() => {
    alignNodes({ arrangeSpacing: true });
  }, [alignNodes]);

  useCombo([" "], handleOpenNodeMenu);
  useCombo(["f"], handleFitView);
  useCombo(["a"], handleAlign, selectedNodes.length > 0);
  useCombo(["Control", "a"], handleAlignWithSpacing, selectedNodes.length > 0);
  useCombo(["Meta", "a"], handleAlignWithSpacing, selectedNodes.length > 0);

  useCombo(["Control", "c"], handleCopy, false);
  useCombo(["Control", "v"], handlePaste, false);
  useCombo(["Control", "x"], handleCut);
  useCombo(["Meta", "c"], handleCopy, false);
  useCombo(["Meta", "v"], handlePaste, false);
  useCombo(["Meta", "x"], handleCut);

  useCombo(["Control", "Shift", "e"], saveExample);
  useCombo(["Meta", "Shift", "e"], saveExample);

  useCombo(["Control", "d"], duplicateNodes);
  useCombo(["Control", "Shift", "d"], duplicateNodesVertical);
  useCombo(["Meta", "d"], duplicateNodes);
  useCombo(["Meta", "Shift", "d"], duplicateNodesVertical);

  useCombo(["Control", "g"], handleGroup);
  useCombo(["Meta", "g"], handleGroup);

  useCombo(["Control", "z"], nodeHistory.undo);
  useCombo(["Control", "Shift", "z"], nodeHistory.redo);
  useCombo(["Meta", "z"], nodeHistory.undo);
  useCombo(["Meta", "Shift", "z"], nodeHistory.redo);

  // useCombo(
  //   ["Alt", "k"],
  //   useCallback(() => setOpenCommandMenu(true), [setOpenCommandMenu])
  // );
  // useCombo(
  //   ["Meta", "k"],
  //   useCallback(() => setOpenCommandMenu(true), [setOpenCommandMenu])
  // );
};
