/** @jsxImportSource @emotion/react */
import { memo, useState, useRef, useEffect } from "react";
import {
  Modal
} from "@mui/material";
import { LoadingSpinner, Dialog, Box, TextInput, BORDER_RADIUS } from "../ui_primitives";
// store
import useNodeMenuStore from "../../stores/NodeMenuStore";
//css
import "../../styles/base.css";
import "../../styles/nodes.css";
import "../../styles/properties.css";
import "../../styles/interactions.css";
import "../../styles/special_nodes.css";
import "../../styles/handle_edge_tooltip.css";

//hooks
import { useAssetUpload } from "../../serverState/useAssetUpload";
// constants
import DraggableNodeDocumentation from "../content/Help/DraggableNodeDocumentation";
import isEqual from "fast-deep-equal";
import { useShallow } from "zustand/react/shallow";
import ReactFlowWrapper from "../node/ReactFlowWrapper";
import { generateCSS } from "../themes/GenerateCSS";
import { useTemporalNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import NodeMenu from "../node_menu/NodeMenu";
import { useNodeEditorShortcuts } from "../../hooks/useNodeEditorShortcuts";
import { useTheme } from "@mui/material/styles";
import KeyboardShortcutsView from "../content/Help/KeyboardShortcutsView";
import { NODE_EDITOR_SHORTCUTS } from "../../config/shortcuts";
import CommandMenu from "../menus/CommandMenu";
import QuickAddNodeDialog from "./QuickAddNodeDialog";
import { useCombo } from "../../stores/KeyPressedStore";
import { isMac } from "../../utils/platform";
import { EditorUiProvider } from "../editor_ui";
import type React from "react";
import FindInWorkflowDialog from "./FindInWorkflowDialog";
import SelectionActionToolbar from "./SelectionActionToolbar";
import NodeInfoPanel from "./NodeInfoPanel";
import { useInspectedNodeStore } from "../../stores/InspectedNodeStore";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowRuntimeCheck } from "../../hooks/useWorkflowRuntimeCheck";
import { useAutoEnableNodePacks } from "../../hooks/useAutoEnableNodePacks";
import { useRightPanelStore } from "../../stores/RightPanelStore";

declare global {
  interface Window {
    __beforeUnloadListenerAdded?: boolean;
  }
}

interface NodeEditorProps {
  workflowId: string;
  active: boolean;
}

const NodeEditor: React.FC<NodeEditorProps> = ({ workflowId, active }) => {
  const theme = useTheme();
  /* USE STORE */
  const { isUploading } = useAssetUpload();
  // Use getSelectedNodeCount to avoid re-renders when nodes are moved (getSelectedNodes returns new array reference on move)
  const selectedNodeCount = useNodes((state) => state.getSelectedNodeCount());
  const store = useNodeStoreRef();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [quickAddNodeOpen, setQuickAddNodeOpen] = useState(false);
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  const {
    packageNameDialogOpen,
    packageNameInput,
    setPackageNameInput,
    handleSaveExampleConfirm,
    handleSaveExampleCancel
  } = useNodeEditorShortcuts(active, () => setShowShortcuts((v) => !v));

  useWorkflowRuntimeCheck(workflowId);

  // Enable provider packs whose API key is set, and packs used by the loaded
  // workflow, so their nodes register without a manual step.
  useAutoEnableNodePacks(active);

  // Subscribe only to undo/redo functions to prevent re-renders on history changes
  const undo = useTemporalNodes((state) => state.undo);
  const redo = useTemporalNodes((state) => state.redo);
  const toggleInspectedNode = useInspectedNodeStore((state) => state.toggleInspectedNode);

  // Auto-reveal the Inspector whenever a node becomes selected.
  const setActiveView = useRightPanelStore((state) => state.setActiveView);
  const setPanelVisibility = useRightPanelStore((state) => state.setVisibility);
  useEffect(() => {
    if (active && selectedNodeCount > 0) {
      setActiveView("inspector");
      setPanelVisibility(true);
    }
  }, [active, selectedNodeCount, setActiveView, setPanelVisibility]);

  // Keyboard shortcut for CommandMenu (Meta+K on Mac, Ctrl+K on Windows/Linux).
  // Global scope: must work even when an input/editor is focused.
  const commandMenuCombo = isMac() ? ["meta", "k"] : ["control", "k"];
  useCombo(
    commandMenuCombo,
    () => {
      if (active) {
        setCommandMenuOpen(true);
      }
    },
    true,
    active,
    { scope: "global" }
  );

  // Keyboard shortcut for Quick Add Node (Ctrl+Shift+A on all platforms)
  const quickAddNodeCombo = isMac()
    ? ["meta", "shift", "a"]
    : ["control", "shift", "a"];
  useCombo(
    quickAddNodeCombo,
    () => {
      if (active) {
        setQuickAddNodeOpen(true);
      }
    },
    true,
    active
  );

  // Keyboard shortcut for Node Info Panel (Ctrl+I / Meta+I)
  const nodeInfoCombo = isMac() ? ["meta", "i"] : ["control", "i"];
  useCombo(
    nodeInfoCombo,
    () => {
      if (active) {
        const selectedIds = store.getState().getSelectedNodeIds();
        if (selectedIds.length > 0) {
          toggleInspectedNode(selectedIds[0]);
        }
      }
    },
    true,
    active
  );

  // OPEN NODE MENU
  const {
    selectedNodeType,
    documentationPosition,
    showDocumentation,
    closeDocumentation
  } = useNodeMenuStore(
    useShallow((state) => ({
      selectedNodeType: state.selectedNodeType,
      documentationPosition: state.documentationPosition,
      showDocumentation: state.showDocumentation,
      closeDocumentation: state.closeDocumentation
    }))
  );

  return (
    <>
      {showDocumentation && selectedNodeType && (
        <DraggableNodeDocumentation
          nodeType={selectedNodeType}
          position={documentationPosition}
          onClose={closeDocumentation}
        />
      )}
      <EditorUiProvider scope="node">
        <Box
          ref={reactFlowWrapperRef}
          className="node-editor"
          css={generateCSS}
          style={{
            backgroundColor: theme.vars.palette.c_editor_bg_color
          }}
        >
          {isUploading && (
            <div className="loading-overlay">
              <LoadingSpinner variant="circular" size="medium" /> Uploading assets…
            </div>
          )}
          <ReactFlowWrapper workflowId={workflowId} active={active} />
          {active && (
            <>
              <SelectionActionToolbar
                visible={selectedNodeCount >= 2}
              />
              <NodeInfoPanel />
              <NodeMenu focusSearchInput={true} />
              <CommandMenu
                open={commandMenuOpen}
                setOpen={setCommandMenuOpen}
                undo={undo}
                redo={redo}
                reactFlowWrapper={reactFlowWrapperRef}
              />
              <QuickAddNodeDialog
                open={quickAddNodeOpen}
                setOpen={setQuickAddNodeOpen}
                reactFlowWrapper={reactFlowWrapperRef}
              />
              <FindInWorkflowDialog workflowId={workflowId} />
              <Modal
                open={showShortcuts}
                onClose={(event, reason) => {
                  if (reason === "backdropClick") {
                    setShowShortcuts(false);
                  }
                }}
                closeAfterTransition
              >
                <Box
                  sx={{
                    position: "absolute",
                    top: "250px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "80vw",
                    maxWidth: "1400px",
                    padding: 4,
                    backgroundColor: theme.vars.palette.grey[800],
                    boxShadow: 24,
                    borderRadius: BORDER_RADIUS.lg,
                    border: 0,
                    outline: 0,
                    overflow: "hidden"
                  }}
                >
                  <KeyboardShortcutsView shortcuts={NODE_EDITOR_SHORTCUTS} />
                </Box>
              </Modal>
            </>
          )}
        </Box>
      </EditorUiProvider>

      {/* Package Name Dialog */}
      <Dialog
        open={packageNameDialogOpen}
        onClose={handleSaveExampleCancel}
        maxWidth="sm"
        fullWidth
        title="Save Example"
        onConfirm={handleSaveExampleConfirm}
        onCancel={handleSaveExampleCancel}
        confirmText="Save"
        cancelText="Cancel"
      >
        <TextInput
          autoFocus
          margin="dense"
          label="Package Name"
          fullWidth
          variant="outlined"
          value={packageNameInput}
          onChange={(e) => setPackageNameInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              handleSaveExampleConfirm();
            }
          }}
        />
      </Dialog>
    </>
  );
};
export default memo(NodeEditor, isEqual);
