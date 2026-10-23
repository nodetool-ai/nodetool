import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Data } from "@puckeditor/core";
import {
  type AppDocMeta,
  type OperationBinding
} from "@nodetool-ai/app-runtime";

import { Box, FlexColumn } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import FrontendToolRuntimeSync from "../panels/FrontendToolRuntimeSync";
import { createEmptyData, type AppDocument } from "./appData";
import {
  getPuckAgentHandler,
  hasPuckAgentHandler
} from "./puck/puckAgentBridge";
import PuckAppEditor from "./puck/PuckAppEditor";
import AppDataPanel from "./AppDataPanel";
import { isString } from "../../utils/typePredicates";

interface AppBuilderShellProps {
  /**
   * The application being edited. This is the app's identity: the agent's
   * `ui_app_*` tools address this editor by it.
   */
  applicationId: string;
  /** The document to edit. Seeded once — remount (via `key`) to reseed. */
  document: AppDocument;
  /** The workflow whose inputs, outputs, and nodes bindings may reference. */
  workflow: Workflow;
  /**
   * The graph of every workflow the document's operations run, by workflow id,
   * so a binding on the second operation is offered that operation's surface.
   */
  operationWorkflows?: Record<string, Workflow>;
  /**
   * Workflow the agent's graph tools target. Omitted when the app has no
   * workflow bound yet.
   */
  agentWorkflowId?: string;
  /**
   * The operations the canvas holds right now, reported whenever they change.
   * `document` is the saved row, so a parent that derives the workflows to load
   * from it alone loads nothing for an operation the agent bound in this
   * session — and `ui_app_get_binding_targets` answers `ioAvailable: false` for
   * the one operation the author is working on.
   */
  onOperationsChange?: (operations: ReadonlyArray<OperationBinding>) => void;
  /** Title bar above the canvas. */
  header?: React.ReactNode;
  /** Banner between the header and the canvas (a save conflict, say). */
  banner?: React.ReactNode;
  onSave: (document: AppDocument) => void;
  onDraftChange?: (document: AppDocument) => void;
  saving?: boolean;
  onClose?: () => void;
  /**
   * Project whose documents an "all of this kind" resource binding reaches.
   * The App Data form never asks for it.
   */
  projectId?: string;
}

/**
 * The builder's editing surface, independent of where the document is stored.
 * Puck owns `ui`; operations, resources, and variables live beside it in
 * `meta` (the agent's `ui_app_*` tools edit them). A save always emits the
 * whole document, so no part of it can be dropped by saving another.
 *
 * The storage is supplied by `ApplicationAppBuilder` (an `applications`
 * record).
 */
const AppBuilderShell: React.FC<AppBuilderShellProps> = ({
  applicationId,
  document,
  workflow,
  operationWorkflows,
  agentWorkflowId,
  onOperationsChange,
  header,
  banner,
  onSave,
  onDraftChange,
  saving,
  onClose,
  projectId
}) => {
  const setCurrentWorkflowId = useWorkflowManager((s) => s.setCurrentWorkflowId);
  // Puck owns the layout after mount, so this is the seed only. The document's
  // theme is seeded onto the root so the author edits it as a root field, and
  // the save below writes the choice back to `document.theme`.
  const [data] = useState<Data>(() => {
    const seeded = (document.ui as Data | undefined) ?? createEmptyData();
    if (!document.theme) return seeded;
    return {
      ...seeded,
      root: {
        ...seeded.root,
        props: { theme: document.theme.id, ...(seeded.root?.props ?? {}) }
      }
    };
  });
  const [liveData, setLiveData] = useState(data);
  const [meta, setMeta] = useState<AppDocMeta>(() => ({
    operations: document.operations,
    resources: document.resources,
    variables: document.variables,
    recipe: document.recipe
  }));
  // Point the agent's workflow tools at the graph this app runs.
  useEffect(() => {
    if (agentWorkflowId) setCurrentWorkflowId(agentWorkflowId);
  }, [agentWorkflowId, setCurrentWorkflowId]);

  // Report the operations upward on every change, including the seed, so the
  // parent's idea of which workflows to load never lags the canvas. Read
  // through a ref: a caller passing a fresh closure each render must not make
  // this fire again.
  const onOperationsChangeRef = useRef(onOperationsChange);
  onOperationsChangeRef.current = onOperationsChange;
  useEffect(() => {
    onOperationsChangeRef.current?.(meta.operations);
  }, [meta.operations]);

  const draftChangeRef = useRef(onDraftChange);
  draftChangeRef.current = onDraftChange;
  useEffect(() => {
    const rootProps = liveData.root?.props;
    const themeId = rootProps && "theme" in rootProps ? rootProps.theme : null;
    draftChangeRef.current?.({ ...document, ui: liveData, ...meta,
      theme: themeId === null ? document.theme : isString(themeId) && themeId ? { id: themeId } : undefined
    });
  }, [document, liveData, meta]);

  const handleSave = useCallback(
    (nextData: Data) => {
      const rootProps = nextData.root?.props;
      // The author's pick wins; a root that never carried the field at all
      // (a surface that does not edit it) leaves the document's theme alone.
      const themeId = rootProps && "theme" in rootProps ? rootProps.theme : null;
      const live = hasPuckAgentHandler(applicationId)
        ? getPuckAgentHandler(applicationId).document()
        : document;
      onSave({
        ...live,
        ui: nextData,
        operations: meta.operations,
        resources: meta.resources,
        variables: meta.variables,
        theme:
          themeId === null
            ? live.theme
            : isString(themeId) && themeId
              ? { id: themeId }
              : undefined
      });
    },
    [applicationId, document, meta, onSave]
  );

  return (
    <FlexColumn sx={{ width: "100%", height: "100%", minHeight: 0 }}>
      {/* Syncs workflow tools to this workflow so the agent can edit the graph. */}
      <FrontendToolRuntimeSync />
      {header}
      {banner}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <PuckAppEditor
          applicationId={applicationId}
          workflow={workflow}
          data={data}
          onPublish={handleSave}
          onChange={setLiveData}
          saving={saving}
          onClose={onClose}
          meta={meta}
          onMetaChange={setMeta}
          dataPanel={
            <AppDataPanel
              meta={meta}
              onChange={setMeta}
              workflowId={workflow.id}
              workflowName={workflow.name}
              projectId={projectId}
            />
          }
          operationWorkflows={operationWorkflows}
        />
      </Box>
    </FlexColumn>
  );
};

export default AppBuilderShell;
