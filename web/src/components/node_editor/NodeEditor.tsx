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
import WorkflowChat from "../chat/containers/WorkflowChat";
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
      {showDocumentation && selectedNodeType && (
        <DraggableNodeDocumentation
          nodeType={selectedNodeType}
          position={documentationPosition}
          onClose={closeDocumentation}
        />
      )}
      <div className="node-editor">
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
          </>
        )}
      </div>
    </>
  );
};
export default memo(NodeEditor, isEqual);
