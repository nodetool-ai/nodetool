/** @jsxImportSource @emotion/react */
import { memo, useEffect } from "react";

import { CircularProgress } from "@mui/material";
// store
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useWorkflowRunner from "../../stores/WorkflowRunner";
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
import { WORKER_URL } from "../../stores/ApiClient";
import ThemeNodes from "../themes/ThemeNodes";

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

  // WorkflowRunner connection management
  const { connect, disconnect, state, current_url } = useWorkflowRunner(
    (state) => ({
      connect: state.connect,
      disconnect: state.disconnect,
      state: state.state,
      current_url: state.current_url
    })
  );

  // Handle WorkflowRunner WebSocket connection lifecycle
  useEffect(() => {
    // Only connect when the editor is active
    if (active && (state === "idle" || current_url !== WORKER_URL)) {
      connect(WORKER_URL).catch((error) => {
        console.error("Failed to connect WorkflowRunner:", error);
      });
    }

    return () => {
      // Don't disconnect on unmount - keep connection alive
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Monitor connection state and reconnect when disconnected
  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout | null = null;

    const attemptReconnect = () => {
      if (active && (state === "idle" || state === "error")) {
        console.log(
          "WorkflowRunner: Connection lost, attempting automatic reconnect..."
        );
        connect(WORKER_URL).catch((error) => {
          console.error("WorkflowRunner: Automatic reconnect failed:", error);
        });
      }
    };

    // Check connection state periodically
    if (active && (state === "idle" || state === "error")) {
      // Initial reconnect attempt after 2 seconds
      reconnectTimer = setTimeout(attemptReconnect, 2000);
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [state, active, connect]);

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
      <div
        className="node-editor"
        style={{ backgroundColor: ThemeNodes.palette.c_editor_bg_color }}
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
          </>
        )}
      </div>
    </>
  );
};
export default memo(NodeEditor, isEqual);
