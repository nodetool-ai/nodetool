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
 * The storage is supplied by `ApplicationAppBuilder` (an `applications`
 * record).
 */
const AppBuilderShell: React.FC<AppBuilderShellProps> = ({
  applicationId,
  document,
  workflow,
  agentWorkflowId,
  header,
  banner,
  onSave,
  onClose
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
  const [agentOpen, setAgentOpen] = useState(false);
  const toggleAgent = useCallback(() => setAgentOpen((open) => !open), []);

  // Point the agent's workflow tools at the graph this app runs.
  useEffect(() => {
    if (agentWorkflowId) setCurrentWorkflowId(agentWorkflowId);
  }, [agentWorkflowId, setCurrentWorkflowId]);

  const handleSave = useCallback(
    (nextData: Data) => {
      const rootProps = nextData.root?.props as
        | Record<string, unknown>
        | undefined;
      // The author's pick wins; a root that never carried the field at all
      // (a surface that does not edit it) leaves the document's theme alone.
      const themeId = rootProps && "theme" in rootProps ? rootProps.theme : null;
      onSave({
        ...document,
        ui: nextData,
        operations: meta.operations,
        resources: meta.resources,
        variables: meta.variables,
        theme:
          themeId === null
            ? document.theme
            : typeof themeId === "string" && themeId
              ? { id: themeId }
              : undefined
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
            applicationId={applicationId}
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
          <AppBuilderAgentPanel
            applicationId={applicationId}
            workflowId={agentWorkflowId}
          />
        </Box>
      )}
    </FlexRow>
  );
};

export default AppBuilderShell;
