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
import "../../styles/collapsed.css";
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

  /* USE STORE */
  const { isUploading } = useAssetUpload();
  const nodeHistory: HistoryManager = useTemporalStore((state) => state);

  /* STATE */
  const [openCommandMenu, setOpenCommandMenu] = useState(false);

  /* UTILS */
  const { handleCopy, handlePaste, handleCut } = useCopyPaste();
  const alignNodes = useAlignNodes();
  const getSelectedNodeIds = useNodeStore((state) => state.getSelectedNodeIds);
  const duplicateNodes = useDuplicateNodes();
  const surroundWithGroup = useSurroundWithGroup();

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

  useCombo(
    ["Space", "a"],
    useCallback(() => {
      alignNodes({ arrangeSpacing: true });
    }, [alignNodes])
  );

  useCombo(["Meta", "a"], () => alignNodes({ arrangeSpacing: true }));

  useCombo(["Control", "c"], handleCopy);
  useCombo(["Control", "v"], handlePaste);
  useCombo(["Control", "x"], handleCut);
  useCombo(["Meta", "c"], handleCopy); // for mac
  useCombo(["Meta", "v"], handlePaste); // for mac
  useCombo(["Meta", "x"], handleCut); // for mac

  useCombo(["Meta", "d"], duplicateNodes);
  useCombo(["Alt", "d"], duplicateNodes);
  useCombo(["Control", "d"], duplicateNodes);

  useCombo(
    ["Space", "g"],
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
    ["Control", " "],
    useCallback(
      () => openNodeMenu(getMousePosition().x, getMousePosition().y),
      [openNodeMenu]
    )
  );

  return (
    <>
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
          spacing={2}
          margin={2}
          sx={{
            margin: "8px",
            height: "calc(100vh - 80px)",
            width: "calc(100vw - 10px)",
            overflow: "hidden"
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
        </Grid>
      </div>
    </>
  );
};
export default memo(NodeEditor, isEqual);
