/** @jsxImportSource @emotion/react */
import { memo, useEffect, useState } from "react";
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
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
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
import { isEqual } from "lodash";
import ReactFlowWrapper from "../node/ReactFlowWrapper";
import WorkflowChat from "../chat/containers/WorkflowChat";
import { useNodes } from "../../contexts/NodeContext";
import NodeMenu from "../node_menu/NodeMenu";
import { useNodeEditorShortcuts } from "../../hooks/useNodeEditorShortcuts";
import { WORKER_URL } from "../../stores/BASE_URL";
import { useTheme } from "@mui/material/styles";
import allNodeStyles from "../../node_styles/node-styles";
import KeyboardShortcutsView from "../content/Help/KeyboardShortcutsView";
import { NODE_EDITOR_SHORTCUTS } from "../../config/shortcuts";

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
  const { missingModelFiles, missingModelRepos, clearMissingModels } = useNodes(
    (state) => ({
      missingModelFiles: state.missingModelFiles,
      missingModelRepos: state.missingModelRepos,
      clearMissingModels: state.clearMissingModels
    })
  );
  const [showShortcuts, setShowShortcuts] = useState(false);
  const {
    packageNameDialogOpen,
    packageNameInput,
    setPackageNameInput,
    handleSaveExampleConfirm,
    handleSaveExampleCancel
  } = useNodeEditorShortcuts(active, () => setShowShortcuts((v) => !v));

  // WorkflowRunner connection management
  const { state } = useWebsocketRunner((state) => ({
    state: state.state
  }));

  // OPEN NODE MENU
  const {
    selectedNodeType,
    documentationPosition,
    showDocumentation,
    closeDocumentation
  } = useNodeMenuStore((state) => ({
    selectedNodeType: state.selectedNodeType,
    documentationPosition: state.documentationPosition,
    showDocumentation: state.showDocumentation,
    closeDocumentation: state.closeDocumentation
  }));

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
      <Box
        css={allNodeStyles(theme)}
        className="node-editor"
        style={{ backgroundColor: theme.vars.palette.c_editor_bg_color }}
      >
        {isUploading && (
          <div className="loading-overlay">
            <CircularProgress /> Uploading assets...
          </div>
        )}
        <ReactFlowWrapper workflowId={workflowId} active={active} />
        {active && (
          <>
            <WorkflowChat workflow_id="default" />
            <NodeMenu focusSearchInput={true} />
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
