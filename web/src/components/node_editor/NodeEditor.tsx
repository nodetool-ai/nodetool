/** @jsxImportSource @emotion/react */
import { memo, useState, useRef } from "react";
import {
  Box,
  CircularProgress,
  Modal,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField
} from "@mui/material";
// store
import useNodeMenuStore from "../../stores/NodeMenuStore";
//css
import "../../styles/base.css";
import "../../styles/nodes.css";
import "../../styles/properties.css";
import "../../styles/interactions.css";
import "../../styles/special_nodes.css";
import "../../styles/handle_edge_tooltip.css";
// import "../../styles/collapsed.css";

//hooks
import { useAssetUpload } from "../../serverState/useAssetUpload";
// constants
import DraggableNodeDocumentation from "../content/Help/DraggableNodeDocumentation";
import isEqual from "lodash/isEqual";
import { shallow } from "zustand/shallow";
import ReactFlowWrapper from "../node/ReactFlowWrapper";
import { useTemporalNodes } from "../../contexts/NodeContext";
import NodeMenu from "../node_menu/NodeMenu";
import RunAsAppFab from "./RunAsAppFab";
import { useNodeEditorShortcuts } from "../../hooks/useNodeEditorShortcuts";
import { useTheme } from "@mui/material/styles";
import KeyboardShortcutsView from "../content/Help/KeyboardShortcutsView";
import { NODE_EDITOR_SHORTCUTS } from "../../config/shortcuts";
import CommandMenu from "../menus/CommandMenu";
import { useCombo } from "../../stores/KeyPressedStore";
import { isMac } from "../../utils/platform";
import { EditorUiProvider } from "../editor_ui";
import type React from "react";
import FindInWorkflowDialog from "./FindInWorkflowDialog";
import SelectionActionToolbar from "./SelectionActionToolbar";
import NodeInfoPanel from "./NodeInfoPanel";
import { useInspectedNodeStore } from "../../stores/InspectedNodeStore";
import { useNodes } from "../../contexts/NodeContext";
import WorkflowStatsPanel from "./WorkflowStatsPanel";

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
  const selectedNodes = useNodes((state) => state.getSelectedNodes());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const reactFlowWrapperRef = useRef<HTMLDivElement>(null);
  const {
    packageNameDialogOpen,
    packageNameInput,
    setPackageNameInput,
    handleSaveExampleConfirm,
    handleSaveExampleCancel
  } = useNodeEditorShortcuts(active, () => setShowShortcuts((v) => !v));

  // Undo/Redo for CommandMenu
  const nodeHistory = useTemporalNodes((state) => state);
  const toggleInspectedNode = useInspectedNodeStore((state) => state.toggleInspectedNode);

  // Keyboard shortcut for CommandMenu (Meta+K on Mac, Ctrl+K on Windows/Linux)
  const commandMenuCombo = isMac() ? ["meta", "k"] : ["control", "k"];
  useCombo(
    commandMenuCombo,
    () => {
      if (active) {
        setCommandMenuOpen(true);
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
      if (active && selectedNodes.length > 0) {
        toggleInspectedNode(selectedNodes[0].id);
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
    (state) => ({
      selectedNodeType: state.selectedNodeType,
      documentationPosition: state.documentationPosition,
      showDocumentation: state.showDocumentation,
      closeDocumentation: state.closeDocumentation
    }),
    shallow
  );

  return (
    <>
      {/* {missingModelRepos.length > 0 && (
        <ModelDownloadDialog
          open={missingModelRepos.length > 0}
          repos={missingModelRepos}
          repoPaths={missingModelFiles}
          onClose={clearMissingModels}
        />
      )} */}
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
          style={
            {
              backgroundColor: theme.vars.palette.c_editor_bg_color,
              // Used by structural CSS / node components (e.g. `nodes.base.css`, `BaseNode.tsx`)
              // Keep it defined even if ThemeNodetool changes.
              ["--rounded-node" as any]: theme.rounded?.node ?? "8px"
            } as React.CSSProperties
          }
        >
          {isUploading && (
            <div className="loading-overlay">
              <CircularProgress /> Uploading assets...
            </div>
          )}
          <ReactFlowWrapper workflowId={workflowId} active={active} />
          {active && (
            <>
              <RunAsAppFab workflowId={workflowId} />
              <SelectionActionToolbar
                visible={selectedNodes.length >= 2}
              />
              <NodeInfoPanel />
              <WorkflowStatsPanel />
              <NodeMenu focusSearchInput={true} />
              <CommandMenu
                open={commandMenuOpen}
                setOpen={setCommandMenuOpen}
                undo={() => nodeHistory.undo()}
                redo={() => nodeHistory.redo()}
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
                    borderRadius: 2,
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
      >
        <DialogTitle>Save Example</DialogTitle>
        <DialogContent>
          <TextField
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
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSaveExampleCancel}>Cancel</Button>
          <Button onClick={handleSaveExampleConfirm} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
export default memo(NodeEditor, isEqual);
