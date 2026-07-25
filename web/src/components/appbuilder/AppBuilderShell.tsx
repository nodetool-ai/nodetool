import React, { useCallback, useEffect, useState } from "react";
import type { Data } from "@puckeditor/core";
import { type AppDocMeta } from "@nodetool-ai/app-runtime";

import { Box, FlexColumn, FlexRow, BORDER_RADIUS } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import FrontendToolRuntimeSync from "../panels/FrontendToolRuntimeSync";
import { createEmptyData, type AppDocument } from "./appData";
import PuckAppEditor from "./puck/PuckAppEditor";
import AppBuilderAgentPanel from "./AppBuilderAgentPanel";

export interface AppBuilderShellProps {
  /** The document to edit. Seeded once — remount (via `key`) to reseed. */
  document: AppDocument;
  /** The workflow whose inputs, outputs, and nodes bindings may reference. */
  workflow: Workflow;
  /**
   * Workflow the agent panel edits. Omitted when the app has no workflow bound
   * yet, which also hides the panel.
   */
  agentWorkflowId?: string;
  /** Title bar above the canvas. */
  header?: React.ReactNode;
  /** Banner between the header and the canvas (a save conflict, say). */
  banner?: React.ReactNode;
  onSave: (document: AppDocument) => void;
  onClose?: () => void;
}

/**
 * The builder's editing surface, independent of where the document is stored.
 * Puck owns `ui`; operations, resources, and variables live beside it in
 * `meta` (the agent's `ui_app_*` tools edit them). A save always emits the
 * whole document, so no part of it can be dropped by saving another.
 *
 * Two containers supply the storage: `AppBuilderPage` (a workflow's `app_doc`)
 * and `ApplicationAppBuilder` (an `applications` record).
 */
const AppBuilderShell: React.FC<AppBuilderShellProps> = ({
  document,
  workflow,
  agentWorkflowId,
  header,
  banner,
  onSave,
  onClose
}) => {
  const setCurrentWorkflowId = useWorkflowManager((s) => s.setCurrentWorkflowId);
  // Puck owns the layout after mount, so this is the seed only.
  const [data] = useState<Data>(
    () => (document.ui as Data | undefined) ?? createEmptyData()
  );
  const [meta, setMeta] = useState<AppDocMeta>(() => ({
    operations: document.operations,
    resources: document.resources,
    variables: document.variables
  }));
  const [agentOpen, setAgentOpen] = useState(false);
  const toggleAgent = useCallback(() => setAgentOpen((open) => !open), []);

  // Point the agent's workflow tools at the graph this app runs.
  useEffect(() => {
    if (agentWorkflowId) setCurrentWorkflowId(agentWorkflowId);
  }, [agentWorkflowId, setCurrentWorkflowId]);

  const handleSave = useCallback(
    (nextData: Data) => {
      onSave({
        ...document,
        ui: nextData,
        operations: meta.operations,
        resources: meta.resources,
        variables: meta.variables
      });
    },
    [document, meta, onSave]
  );

  return (
    <FlexRow gap={0} sx={{ width: "100%", height: "100%", minHeight: 0 }}>
      {/* Syncs workflow tools to this workflow so the agent can edit the graph. */}
      <FrontendToolRuntimeSync />
      <FlexColumn sx={{ flex: 1, minWidth: 0, height: "100%", minHeight: 0 }}>
        {header}
        {banner}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <PuckAppEditor
            workflow={workflow}
            data={data}
            onPublish={handleSave}
            onClose={onClose}
            agentOpen={agentOpen}
            onToggleAgent={agentWorkflowId ? toggleAgent : undefined}
            meta={meta}
            onMetaChange={setMeta}
          />
        </Box>
      </FlexColumn>
      {agentOpen && agentWorkflowId && (
        <Box
          sx={{
            width: { xs: "min(100vw, 360px)", lg: 420 },
            flexShrink: 0,
            height: "100%",
            borderLeft: "1px solid",
            borderColor: "divider",
            overflow: "hidden",
            borderTopLeftRadius: BORDER_RADIUS.lg
          }}
        >
          <AppBuilderAgentPanel workflowId={agentWorkflowId} />
        </Box>
      )}
    </FlexRow>
  );
};

export default AppBuilderShell;
