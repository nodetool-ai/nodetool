import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Data } from "@puckeditor/core";
import {
  type AppDocMeta,
  type OperationBinding
} from "@nodetool-ai/app-runtime";
import useMediaQuery from "@mui/material/useMediaQuery";

import {
  Box,
  FlexColumn,
  FlexRow,
  BORDER_RADIUS,
  Z_INDEX
} from "../ui_primitives";
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
  onClose?: () => void;
  /**
   * Project whose documents an "all of this kind" resource binding reaches.
   * The App Data form never asks for it.
   */
  projectId?: string;
}

/**
 * Puck folds its header actions — the "App Data" toggle among them — into a
 * chevron menu below 638px. Below that width the App Data panel covers the
 * canvas instead of docking beside it: a 360px column leaves too little of
 * either.
 */
const NARROW_QUERY = "(max-width: 637.98px)";

/** Shared framing for the panels that dock beside the canvas. */
const sidePanelSx = {
  width: { xs: "min(100vw, 360px)", lg: 420 },
  flexShrink: 0,
  height: "100%",
  borderLeft: "1px solid",
  borderColor: "divider",
  overflow: "hidden",
  borderTopLeftRadius: BORDER_RADIUS.lg
} as const;

/** The same panel, covering the canvas instead of docking beside it. */
const overlayPanelSx = {
  ...sidePanelSx,
  position: "absolute",
  inset: 0,
  width: "100%",
  borderLeft: "none",
  borderTopLeftRadius: 0,
  backgroundColor: "background.default",
  zIndex: Z_INDEX.overlay
} as const;

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
  const [meta, setMeta] = useState<AppDocMeta>(() => ({
    operations: document.operations,
    resources: document.resources,
    variables: document.variables
  }));
  const narrow = useMediaQuery(NARROW_QUERY);
  const panelSx = narrow ? overlayPanelSx : sidePanelSx;
  const [dataOpen, setDataOpen] = useState(false);
  const toggleData = useCallback(() => setDataOpen((open) => !open), []);

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
    <FlexRow
      gap={0}
      sx={{ width: "100%", height: "100%", minHeight: 0, position: "relative" }}
    >
      {/* Syncs workflow tools to this workflow so the agent can edit the graph. */}
      <FrontendToolRuntimeSync />
      <FlexColumn sx={{ flex: 1, minWidth: 0, height: "100%", minHeight: 0 }}>
        {header}
        {banner}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <PuckAppEditor
            applicationId={applicationId}
            workflow={workflow}
            data={data}
            onPublish={handleSave}
            onClose={onClose}
            meta={meta}
            onMetaChange={setMeta}
            dataOpen={dataOpen}
            onToggleData={toggleData}
            operationWorkflows={operationWorkflows}
          />
        </Box>
      </FlexColumn>
      {dataOpen && (
        <Box sx={panelSx}>
          <AppDataPanel
            meta={meta}
            onChange={setMeta}
            workflowId={workflow.id}
            workflowName={workflow.name}
            projectId={projectId}
          />
        </Box>
      )}
    </FlexRow>
  );
};

export default AppBuilderShell;
