/** @jsxImportSource @emotion/react */
/**
 * GeneratedClipPanel
 *
 * Inspector panel for a generated clip. Renders the bound workflow as a
 * black box: only the workflow's `Input*` node properties are exposed,
 * plus the clip header and actions. To edit the workflow's graph, use
 * "Open in Node Editor" from the actions row.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useWorkflow } from "../../../serverState/useWorkflow";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { NodeContext } from "../../../contexts/NodeContext";
import { createNodeStore, type NodeStore } from "../../../stores/NodeStore";
import type { Node } from "../../../stores/ApiTypes";
import {
  CollapsibleSection,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  Panel,
  Box
} from "../../ui_primitives";
import MiniAppInputsForm from "../../miniapps/components/MiniAppInputsForm";
import type {
  InputNodeData,
  MiniAppInputDefinition
} from "../../miniapps/types";
import { getInputKind } from "../../miniapps/utils";
import { GeneratedClipHeader } from "./GeneratedClipHeader";
import { ClipActions } from "./ClipActions";

export interface GeneratedClipPanelProps {
  clipId: string;
}

const panelSx = {
  width: "100%",
  height: "100%",
  maxHeight: "100%",
  minHeight: 0,
  overflow: "auto"
};

const inputsContainerStyles = (theme: Theme) =>
  css({
    ".inputs-card, .application-card": {
      background: "transparent",
      border: "none",
      padding: 0
    },
    ".inputs-shell": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(3)
    },
    ".input-field": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: 0
    },
    ".input-field > .MuiTypography-root": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.disabled,
      lineHeight: 1.35,
      marginTop: theme.spacing(0.5)
    }
  });

export const GeneratedClipPanel: React.FC<GeneratedClipPanelProps> = memo(
  ({ clipId }) => {
    const theme = useTheme();
    const clip = useTimelineStore((s) => s.clips.find((c) => c.id === clipId));
    const setParamOverride = useTimelineStore((s) => s.setParamOverride);

    const workflowId = clip?.workflowId ?? null;
    const { data: workflow, isLoading, isError } = useWorkflow(workflowId);

    // Reuse the WorkflowManager's node store when the bound workflow is
    // open in the editor; otherwise stand up a transient store backed by
    // the fetched workflow data so the input form can render without
    // registering this workflow as "open".
    const managerNodeStore = useWorkflowManager((state) =>
      workflowId ? state.nodeStores[workflowId] : undefined
    );
    const transientNodeStore = useMemo<NodeStore | null>(() => {
      if (managerNodeStore || !workflow) {
        return null;
      }
      return createNodeStore(workflow);
    }, [managerNodeStore, workflow]);
    const nodeStoreForForm = managerNodeStore ?? transientNodeStore;

    const inputDefinitions = useMemo<MiniAppInputDefinition[]>(() => {
      const nodes = (workflow?.graph?.nodes ?? []) as Node[];
      return nodes
        .map((node) => {
          const kind = getInputKind(node.type);
          if (!kind) {
            return null;
          }
          return {
            nodeId: node.id,
            nodeType: node.type,
            kind,
            data: node.data as InputNodeData
          } satisfies MiniAppInputDefinition;
        })
        .filter(
          (definition): definition is MiniAppInputDefinition =>
            definition !== null
        );
    }, [workflow]);

    const handleInputChange = useCallback(
      (name: string, value: unknown) => {
        setParamOverride(clipId, name, value);
      },
      [clipId, setParamOverride]
    );

    if (!clip) {
      return null;
    }

    const paramOverrides = clip.paramOverrides ?? {};

    return (
      <Panel sx={panelSx}>
        <FlexColumn gap={0}>
          <GeneratedClipHeader clip={clip} />

          {!workflowId && (
            <EmptyState
              variant="empty"
              size="small"
              description="No workflow is bound to this clip."
            />
          )}

          {workflowId && (
            <CollapsibleSection title="Inputs" defaultOpen>
              {isLoading && <LoadingSpinner size="small" />}
              {isError && (
                <EmptyState
                  variant="error"
                  size="small"
                  description="Failed to load workflow inputs."
                />
              )}
              {!isLoading && !isError && workflow && (
                <>
                  {inputDefinitions.length === 0 ? (
                    <EmptyState
                      variant="empty"
                      size="small"
                      description="This workflow has no editable input parameters."
                    />
                  ) : nodeStoreForForm ? (
                    <NodeContext.Provider value={nodeStoreForForm}>
                      <Box css={inputsContainerStyles(theme)}>
                        <MiniAppInputsForm
                          workflow={workflow}
                          inputDefinitions={inputDefinitions}
                          inputValues={paramOverrides}
                          onInputChange={handleInputChange}
                        />
                      </Box>
                    </NodeContext.Provider>
                  ) : (
                    <LoadingSpinner size="small" />
                  )}
                </>
              )}
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Actions" defaultOpen>
            <ClipActions clipId={clipId} />
          </CollapsibleSection>
        </FlexColumn>
      </Panel>
    );
  }
);

GeneratedClipPanel.displayName = "GeneratedClipPanel";
