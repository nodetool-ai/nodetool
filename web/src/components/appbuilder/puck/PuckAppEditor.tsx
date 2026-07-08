/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo } from "react";
import { Puck, useGetPuck, type Data, type Overrides } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "./puckTheme.css";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SaveIcon from "@mui/icons-material/Save";

import { Workflow } from "../../../stores/ApiTypes";
import { extractWorkflowState } from "../workflowState";
import { useAppRuntime } from "../runtime/useAppRuntime";
import { AppRuntimeContext } from "../runtime/AppRuntimeContext";
import { BuilderWorkflowProvider } from "./BuilderWorkflowContext";
import { appConfig } from "./config";
import PuckAgentBinder from "./PuckAgentBinder";
import { Box, EditorButton } from "../../ui_primitives";

interface PuckAppEditorProps {
  workflow: Workflow;
  data: Data;
  onPublish: (data: Data) => void;
  onChange?: (data: Data) => void;
  onClose: () => void;
  agentOpen?: boolean;
  onToggleAgent?: () => void;
}

/**
 * Replaces Puck's built-in "Publish" button with a "Save" button that reads
 * the current editor data via Puck's store and forwards it to onPublish.
 */
const SaveButton: React.FC<{ onSave: (data: Data) => void }> = ({ onSave }) => {
  const getPuck = useGetPuck();
  const handleClick = useCallback(() => {
    const { appState } = getPuck();
    onSave(appState.data);
  }, [getPuck, onSave]);
  return (
    <EditorButton
      size="small"
      variant="contained"
      color="primary"
      startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
      onClick={handleClick}
    >
      Save
    </EditorButton>
  );
};

/**
 * The WYSIWYG editor: Puck draws the editing chrome (component drawer, canvas,
 * field inspector) while our contexts supply the bindable workflow surface and
 * an inert design-mode runtime so widget previews render without running.
 */
const PuckAppEditor: React.FC<PuckAppEditorProps> = ({
  workflow,
  data,
  onPublish,
  onChange,
  onClose,
  agentOpen = false,
  onToggleAgent
}) => {
  const workflowState = useMemo(
    () => extractWorkflowState(workflow),
    [workflow]
  );
  const designRuntime = useAppRuntime(workflow, true);

  const overrides = useMemo<Partial<Overrides>>(
    () => ({
      headerActions: () => (
        <>
          {/* Lets the agent's ui_app_* tools drive this editor. Renders nothing. */}
          <PuckAgentBinder config={appConfig} />
          {onToggleAgent && (
            <EditorButton
              size="small"
              variant={agentOpen ? "contained" : "text"}
              color="primary"
              startIcon={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
              onClick={onToggleAgent}
              aria-pressed={agentOpen}
            >
              Ask Agent
            </EditorButton>
          )}
          <EditorButton
            size="small"
            variant="text"
            startIcon={<CloseIcon sx={{ fontSize: 16 }} />}
            onClick={onClose}
          >
            Back
          </EditorButton>
          <SaveButton onSave={onPublish} />
        </>
      )
    }),
    [onClose, onPublish, onToggleAgent, agentOpen]
  );

  return (
    <BuilderWorkflowProvider value={workflowState}>
      <AppRuntimeContext.Provider value={designRuntime}>
        <Box className="appbuilder-editor" sx={{ width: "100%", height: "100%" }}>
          <Puck
            config={appConfig}
            data={data}
            onPublish={onPublish}
            onChange={onChange}
            overrides={overrides}
            iframe={{ enabled: false }}
          />
        </Box>
      </AppRuntimeContext.Provider>
    </BuilderWorkflowProvider>
  );
};

export default PuckAppEditor;
