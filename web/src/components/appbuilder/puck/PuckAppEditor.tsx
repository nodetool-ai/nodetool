/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useState } from "react";
import { Puck, useGetPuck, type Data, type Overrides } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "./puckTheme.css";
import CloseIcon from "@mui/icons-material/Close";
import SaveIcon from "@mui/icons-material/Save";
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphone";
import TabletMacIcon from "@mui/icons-material/TabletMac";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";
import TuneIcon from "@mui/icons-material/Tune";

import { Workflow } from "../../../stores/ApiTypes";
import { NodeContext } from "../../../contexts/NodeContext";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { extractWorkflowState, type WorkflowState } from "../workflowState";
import { useAppRuntime } from "../runtime/useAppRuntime";
import { AppRuntimeContext } from "../runtime/AppRuntimeContext";
import { BuilderWorkflowProvider } from "./BuilderWorkflowContext";
import { appConfig } from "./config";
import PuckAgentBinder from "./PuckAgentBinder";
import {
  APP_SCHEMA_VERSION,
  EMPTY_DOC_META,
  type AppDocMeta,
  type ApplicationDocument
} from "@nodetool-ai/app-runtime";
import {
  Box,
  EditorButton,
  ToggleGroup,
  ToggleOption
} from "../../ui_primitives";

interface PuckAppEditorProps {
  /** The application being edited — the id the agent's `ui_app_*` tools take. */
  applicationId: string;
  workflow: Workflow;
  data: Data;
  onPublish: (data: Data) => void;
  onChange?: (data: Data) => void;
  /** Omitted when the builder is embedded and there is nowhere to go back to. */
  onClose?: () => void;
  /**
   * The document's operations, variables, and resources. Puck does not own
   * them, so the page holds them and the agent tools edit them through
   * `onMetaChange`.
   */
  meta?: AppDocMeta;
  onMetaChange?: (next: AppDocMeta) => void;
  dataOpen?: boolean;
  onToggleData?: () => void;
  /**
   * The graph of every workflow the document's operations run, by workflow id.
   * An operation whose workflow is missing binds against nothing — the host
   * workflow's surface is not another operation's.
   */
  operationWorkflows?: Record<string, Workflow>;
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

type PreviewWidth = "phone" | "tablet" | "fit";

/** Puck sidebars start closed. Header buttons still toggle them. */
const INITIAL_UI = {
  leftSideBarVisible: false,
  rightSideBarVisible: false
};

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
  applicationId,
  workflow,
  data,
  onPublish,
  onChange,
  onClose,
  meta = EMPTY_DOC_META,
  onMetaChange,
  dataOpen = false,
  onToggleData,
  operationWorkflows
}) => {
  const workflowState = useMemo(
    () => extractWorkflowState(workflow, meta.resources),
    [workflow, meta.resources]
  );

  // One bindable surface per declared operation, so a widget bound to the
  // second operation is offered that workflow's inputs and outputs.
  const operationStates = useMemo(() => {
    const states = new Map<string, WorkflowState>();
    for (const operation of meta.operations) {
      const target =
        operation.workflowId === workflow.id
          ? workflow
          : operationWorkflows?.[operation.workflowId];
      states.set(operation.id, extractWorkflowState(target, meta.resources));
    }
    return states;
  }, [meta.operations, meta.resources, operationWorkflows, workflow]);

  // The same surfaces keyed by workflow id, which is what the agent's
  // `ui_app_get_binding_targets` resolves an operation against.
  const workflowStates = useMemo(() => {
    const states = new Map<string, WorkflowState>();
    for (const [id, graph] of Object.entries(operationWorkflows ?? {})) {
      if (id === workflow.id) continue;
      states.set(id, extractWorkflowState(graph, meta.resources));
    }
    return states;
  }, [meta.resources, operationWorkflows, workflow.id]);

  // The design canvas resolves bindings against the document's real operations,
  // not an implicit one — otherwise a widget bound to `operation_1` renders as
  // unbound in the builder.
  const designDocument = useMemo<ApplicationDocument>(
    () => ({
      schemaVersion: APP_SCHEMA_VERSION,
      ui: data as ApplicationDocument["ui"],
      operations: meta.operations,
      resources: meta.resources,
      variables: meta.variables
    }),
    [data, meta]
  );
  const handleMetaChange = useCallback(
    (next: AppDocMeta) => onMetaChange?.(next),
    [onMetaChange]
  );
  const designRuntime = useAppRuntime(workflow, true, {
    document: designDocument,
    workflowOverrides: operationWorkflows
  });
  // Property components resolved by WorkflowInputWidget (AudioProperty) read
  // the workflow's node store via NodeContext — same wrap as the runtime view.
  const nodeStore = useWorkflowManager((s) => s.nodeStores[workflow.id]);
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("fit");

  const overrides = useMemo<Partial<Overrides>>(
    () => ({
      headerActions: () => (
        <>
          {/* Lets the agent's ui_app_* tools drive this editor. Renders nothing. */}
          <PuckAgentBinder
            config={appConfig}
            applicationId={applicationId}
            workflowId={workflow.id}
            meta={meta}
            onMetaChange={handleMetaChange}
            workflowState={workflowState}
            workflowStates={workflowStates}
          />
          <PreviewWidthToggle value={previewWidth} onChange={setPreviewWidth} />
          {onToggleData && (
            <EditorButton
              size="small"
              variant={dataOpen ? "contained" : "text"}
              startIcon={<TuneIcon sx={{ fontSize: 16 }} />}
              onClick={onToggleData}
              aria-pressed={dataOpen}
            >
              App Data
            </EditorButton>
          )}
          {onClose && (
            <EditorButton
              size="small"
              variant="text"
              startIcon={<CloseIcon sx={{ fontSize: 16 }} />}
              onClick={onClose}
            >
              Back
            </EditorButton>
          )}
          <SaveButton onSave={onPublish} />
        </>
      )
    }),
    [
      applicationId,
      onClose,
      onPublish,
      workflow,
      previewWidth,
      meta,
      handleMetaChange,
      workflowState,
      workflowStates,
      dataOpen,
      onToggleData
    ]
  );

  return (
    <NodeContext.Provider value={nodeStore ?? null}>
      <BuilderWorkflowProvider
        value={workflowState}
        operations={meta.operations}
        states={operationStates}
      >
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
              ui={INITIAL_UI}
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
