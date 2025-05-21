/** @jsxImportSource @emotion/react */
import { memo } from "react";

import { CircularProgress } from "@mui/material";
// store
import useNodeMenuStore from "../../stores/NodeMenuStore";
//css
import "../../styles/base.css";
import "../../styles/nodes.css";
// import "../../styles/collapsed.css";
import "../../styles/properties.css";
import "../../styles/interactions.css";
import "../../styles/special_nodes.css";
import "../../styles/handle_edge_tooltip.css";

//hooks
import { useAssetUpload } from "../../serverState/useAssetUpload";
// constants
import DraggableNodeDocumentation from "../content/Help/DraggableNodeDocumentation";
import { isEqual } from "lodash";
import ReactFlowWrapper from "../node/ReactFlowWrapper";
import WorkflowChat from "../assistants/WorkflowChat";
import ModelDownloadDialog from "../hugging_face/ModelDownloadDialog";
import { useNodes } from "../../contexts/NodeContext";
import NodeMenu from "../node_menu/NodeMenu";
import { useNodeEditorShortcuts } from "../../hooks/useNodeEditorShortcuts";

declare global {
  interface Window {
    __beforeUnloadListenerAdded?: boolean;
  }
}

// FIT SCREEN

interface NodeEditorProps {
  workflowId: string;
  active: boolean;
}

const NodeEditor: React.FC<NodeEditorProps> = ({ workflowId, active }) => {
  /* USE STORE */
  const { isUploading } = useAssetUpload();
  const { missingModelFiles, missingModelRepos, clearMissingModels } = useNodes(
    (state) => ({
      missingModelFiles: state.missingModelFiles,
      missingModelRepos: state.missingModelRepos,
      clearMissingModels: state.clearMissingModels
    })
  );
  useNodeEditorShortcuts(active);

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
      {missingModelRepos.length > 0 && (
        <ModelDownloadDialog
          open={missingModelRepos.length > 0}
          repos={missingModelRepos}
          repoPaths={missingModelFiles}
          onClose={clearMissingModels}
        />
      )}
      {/* <CommandMenu
        open={openCommandMenu}
        setOpen={setOpenCommandMenu}
        undo={nodeHistory.undo}
        redo={nodeHistory.redo}
        reactFlowWrapper={reactFlowWrapper}
      /> */}
      {showDocumentation && selectedNodeType && (
        <DraggableNodeDocumentation
          nodeType={selectedNodeType}
          position={documentationPosition}
          onClose={closeDocumentation}
        />
      )}
      <div
        className="node-editor"
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {isUploading && (
            <div className="loading-overlay">
              <CircularProgress /> Uploading assets...
            </div>
          )}
          <div
            style={{
              flex: 1,
              position: "relative",
              width: "100%",
              height: "100%",
              minHeight: 0
            }}
          >
            <ReactFlowWrapper workflowId={workflowId} active={active} />
          </div>
          {active && (
            <>
              <WorkflowChat workflow_id="default" />
              <NodeMenu focusSearchInput={true} />
              {/* <WorkflowGenerator /> */}
            </>
          )}
        </div>
      </div>
    </>
  );
};
export default memo(NodeEditor, isEqual);
