/** @jsxImportSource @emotion/react */
import { useCallback, useState, useRef, memo } from "react";

import { CircularProgress, Grid } from "@mui/material";
// store
import { useNodeStore, useTemporalStore } from "../../stores/NodeStore";
import { HistoryManager } from "../../HistoryManager";
// store
import useNodeMenuStore from "../../stores/NodeMenuStore";
// components
import CommandMenu from "../menus/CommandMenu";
//utils
import { getMousePosition } from "../../utils/MousePosition";
//css
import { generateCSS } from "../themes/GenerateCSS";
import "../../styles/base.css";
import "../../styles/nodes.css";
// import "../../styles/collapsed.css";
import "../../styles/properties.css";
import "../../styles/interactions.css";
import "../../styles/special_nodes.css";
import "../../styles/handle_edge_tooltip.css";

//hooks
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useAlignNodes from "../../hooks/useAlignNodes";
// constants
import DraggableNodeDocumentation from "../content/Help/DraggableNodeDocumentation";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import ReactFlowWrapper from "../node/ReactFlowWrapper";
import { useReactFlow, XYPosition } from "@xyflow/react";
import WorkflowChat from "../assistants/WorkflowChat";
import ModelDownloadDialog from "../hugging_face/ModelDownloadDialog";

declare global {
  interface Window {
    __beforeUnloadListenerAdded?: boolean;
  }
}

// FIT SCREEN

interface NodeEditorProps {
  isMinZoom?: boolean;
}

const NodeEditor: React.FC<NodeEditorProps> = ({ isMinZoom }) => {
  /* REACTFLOW */
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const reactFlowInstance = useReactFlow();

  /* USE STORE */
  const { isUploading } = useAssetUpload();
  const nodeHistory: HistoryManager = useTemporalStore((state) => state);
  const setSelectedNodes = useNodeStore((state) => state.setSelectedNodes);

  /* STATE */
  const [openCommandMenu, setOpenCommandMenu] = useState(false);
  const selectedNodes = useNodeStore((state) => state.getSelectedNodes());

  /* UTILS */
  const { handleCopy, handlePaste, handleCut } = useCopyPaste();
  const alignNodes = useAlignNodes();
  const getSelectedNodeIds = useNodeStore((state) => state.getSelectedNodeIds);
  const duplicateNodes = useDuplicateNodes();
  const duplicateNodesVertical = useDuplicateNodes(true);
  const surroundWithGroup = useSurroundWithGroup();
  const nodes = useNodeStore((state) => state.nodes);
  const missingModelFiles = useNodeStore((state) => state.missingModelFiles);
  const clearMissingModels = useNodeStore((state) => state.clearMissingModels);

  // OPEN NODE MENU
  const {
    openNodeMenu,
    selectedNodeType,
    documentationPosition,
    showDocumentation,
    closeDocumentation
  } = useNodeMenuStore((state) => ({
    openNodeMenu: state.openNodeMenu,
    closeNodeMenu: state.closeNodeMenu,
    isMenuOpen: state.isMenuOpen,
    selectedNodeType: state.selectedNodeType,
    documentationPosition: state.documentationPosition,
    showDocumentation: state.showDocumentation,
    closeDocumentation: state.closeDocumentation
  }));

  useCombo(["f"], () => {
    // fit view bounds to selected nodes, fitView when no nodes are selected
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
  });

  useCombo(
    ["a"],
    () => {
      alignNodes({ arrangeSpacing: false });
    },
    selectedNodes.length > 0
  );

  useCombo(
    ["Control", "a"],
    () => alignNodes({ arrangeSpacing: true }),
    selectedNodes.length > 0
  );
  useCombo(
    ["Meta", "a"],
    () => alignNodes({ arrangeSpacing: true }),
    selectedNodes.length > 0
  );

  useCombo(["Control", "c"], handleCopy, false);
  useCombo(["Control", "v"], handlePaste, false);
  useCombo(["Control", "x"], handleCut);
  useCombo(["Meta", "c"], handleCopy, false);
  useCombo(["Meta", "v"], handlePaste, false);
  useCombo(["Meta", "x"], handleCut);

  useCombo(["Control", "d"], duplicateNodes);
  useCombo(["Control", "Shift", "d"], duplicateNodesVertical);
  useCombo(["Meta", "d"], duplicateNodes);
  useCombo(["Meta", "Shift", "d"], duplicateNodesVertical);

  useCombo(
    ["Control", "g"],
    useCallback(() => {
      const selectedNodeIds = getSelectedNodeIds();
      if (selectedNodeIds.length) {
        surroundWithGroup({ selectedNodeIds });
      }
    }, [surroundWithGroup, getSelectedNodeIds])
  );
  useCombo(
    ["Meta", "g"],
    useCallback(() => {
      const selectedNodeIds = getSelectedNodeIds();
      if (selectedNodeIds.length) {
        surroundWithGroup({ selectedNodeIds });
      }
    }, [surroundWithGroup, getSelectedNodeIds])
  );

  useCombo(["Control", "z"], nodeHistory.undo);
  useCombo(["Control", "Shift", "z"], nodeHistory.redo);
  useCombo(["Meta", "z"], nodeHistory.undo);
  useCombo(["Meta", "Shift", "z"], nodeHistory.redo);

  useCombo(
    ["Alt", "k"],
    useCallback(() => setOpenCommandMenu(true), [setOpenCommandMenu])
  );
  useCombo(
    ["Meta", "k"],
    useCallback(() => setOpenCommandMenu(true), [setOpenCommandMenu])
  );

  useCombo(
    [" "],
    useCallback(() => {
      const mousePos = getMousePosition();
      openNodeMenu(mousePos.x, mousePos.y);
    }, [openNodeMenu])
  );

  return (
    <>
      {missingModelFiles.length > 0 && (
        <ModelDownloadDialog
          open={missingModelFiles.length > 0}
          repoPaths={missingModelFiles}
          onClose={clearMissingModels}
        />
      )}
      <CommandMenu
        open={openCommandMenu}
        setOpen={setOpenCommandMenu}
        undo={nodeHistory.undo}
        redo={nodeHistory.redo}
        reactFlowWrapper={reactFlowWrapper}
      />
      {showDocumentation && selectedNodeType && (
        <DraggableNodeDocumentation
          nodeType={selectedNodeType}
          position={documentationPosition}
          onClose={closeDocumentation}
        />
      )}
      <div className="node-editor" css={generateCSS}>
        <Grid
          container
          spacing={0}
          margin={0}
          sx={{
            margin: "0px",
            height: "calc(100vh - 20px)",
            width: "100%",
            overflow: "hidden",
            position: "relative"
          }}
        >
          {isUploading && (
            <div className="loading-overlay">
              <CircularProgress />
            </div>
          )}
          <ReactFlowWrapper
            isMinZoom={isMinZoom}
            reactFlowWrapper={reactFlowWrapper}
          />

          <WorkflowChat workflow_id="default" />
        </Grid>
      </div>
    </>
  );
};
export default memo(NodeEditor, isEqual);
