/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useState } from "react";
import { Puck, useGetPuck, type Data, type Overrides } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "./puckTheme.css";
import CloseIcon from "@mui/icons-material/Close";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import SaveIcon from "@mui/icons-material/Save";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import TabletMacIcon from "@mui/icons-material/TabletMac";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";

import { Workflow } from "../../../stores/ApiTypes";
import { NodeContext } from "../../../contexts/NodeContext";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { extractWorkflowState } from "../workflowState";
import { useAppRuntime } from "../runtime/useAppRuntime";
import { AppRuntimeContext } from "../runtime/AppRuntimeContext";
import { BuilderWorkflowProvider } from "./BuilderWorkflowContext";
import { appConfig } from "./config";
import PuckAgentBinder from "./PuckAgentBinder";
import { generateAppData } from "../generateAppDoc";
import { isRenderableData } from "../appData";
import {
  Box,
  Dialog,
  EditorButton,
  ToggleGroup,
  ToggleOption
} from "../../ui_primitives";

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
 * Replaces the editor document with a layout generated from the workflow's
 * inputs/outputs. Goes through Puck's setData action so undo/redo works;
 * confirms first when the current document has placed components.
 */
const GenerateFromWorkflowButton: React.FC<{ workflow: Workflow }> = ({
  workflow
}) => {
  const getPuck = useGetPuck();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const applyGenerated = useCallback(() => {
    const { dispatch } = getPuck();
    dispatch({ type: "setData", data: generateAppData(workflow) });
    setConfirmOpen(false);
  }, [getPuck, workflow]);

  const handleClick = useCallback(() => {
    const { appState } = getPuck();
    if (isRenderableData(appState.data)) {
      setConfirmOpen(true);
    } else {
      applyGenerated();
    }
  }, [getPuck, applyGenerated]);

  return (
    <>
      <EditorButton
        size="small"
        variant="text"
        startIcon={<AutoFixHighIcon sx={{ fontSize: 16 }} />}
        onClick={handleClick}
      >
        Generate
      </EditorButton>
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Replace app layout?"
        content="Generating from the workflow replaces the current layout with widgets for every workflow input and output. You can undo afterwards."
        onConfirm={applyGenerated}
        confirmText="Replace"
      />
    </>
  );
};

type PreviewWidth = "phone" | "tablet" | "fit";

/**
 * Constrains the canvas preview width so container-query-driven widgets
 * (e.g. Columns) can be checked at narrow/wide breakpoints deliberately. The
 * chosen width becomes a class on `.appbuilder-editor`; puckTheme.css caps
 * `[data-puck-preview]` accordingly. "Fit" leaves the canvas unconstrained.
 */
const PreviewWidthToggle: React.FC<{
  value: PreviewWidth;
  onChange: (value: PreviewWidth) => void;
}> = ({ value, onChange }) => (
  <ToggleGroup
    segmented
    exclusive
    value={value}
    onChange={(_event, next: PreviewWidth | null) => {
      if (next) onChange(next);
    }}
  >
    <ToggleOption value="phone" icon={<PhoneIphoneIcon sx={{ fontSize: 16 }} />} />
    <ToggleOption value="tablet" icon={<TabletMacIcon sx={{ fontSize: 16 }} />} />
    <ToggleOption value="fit" icon={<AspectRatioIcon sx={{ fontSize: 16 }} />} />
  </ToggleGroup>
);

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
  // Property components resolved by WorkflowInputWidget (AudioProperty) read
  // the workflow's node store via NodeContext — same wrap as WorkflowAppView.
  const nodeStore = useWorkflowManager((s) => s.nodeStores[workflow.id]);
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("fit");

  const overrides = useMemo<Partial<Overrides>>(
    () => ({
      headerActions: () => (
        <>
          {/* Lets the agent's ui_app_* tools drive this editor. Renders nothing. */}
          <PuckAgentBinder config={appConfig} workflowId={workflow.id} />
          <PreviewWidthToggle value={previewWidth} onChange={setPreviewWidth} />
          <GenerateFromWorkflowButton workflow={workflow} />
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
    [onClose, onPublish, onToggleAgent, agentOpen, workflow, previewWidth]
  );

  return (
    <NodeContext.Provider value={nodeStore ?? null}>
      <BuilderWorkflowProvider value={workflowState}>
        <AppRuntimeContext.Provider value={designRuntime}>
          <Box
            className={`appbuilder-editor${
              previewWidth !== "fit" ? ` preview-${previewWidth}` : ""
            }`}
            sx={{ width: "100%", height: "100%" }}
          >
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
    </NodeContext.Provider>
  );
};

export default PuckAppEditor;
