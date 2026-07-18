/** @jsxImportSource @emotion/react */
/**
 * GeneratedClipPanel
 *
 * Inspector panel for a generated clip. Renders the bound workflow as a
 * black box: only the workflow's `Input*` node properties are exposed,
 * plus the clip header and actions. To edit the workflow's graph, use
 * "Open in Node Editor" from the actions row.
 */

import React, { memo, useCallback, useEffect, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useWorkflow } from "../../../serverState/useWorkflow";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { NodeContext } from "../../../contexts/NodeContext";
import { createNodeStore, type NodeStore } from "../../../stores/NodeStore";
import type { Node } from "../../../stores/ApiTypes";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  Panel,
  Box
} from "../../ui_primitives";
import WorkflowInputsForm from "../../appbuilder/WorkflowInputsForm";
import type {
  InputNodeData,
  WorkflowInputDefinition
} from "../../appbuilder/workflowInputForm";
import { getWorkflowInputKind } from "../../appbuilder/inputKinds";
import { useGenerateClip } from "../../../hooks/timeline/useGenerateClip";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import { GeneratedClipTopBar } from "./GeneratedClipTopBar";
import { InspectorSectionTitle } from "./InspectorPrimitives";
import { ClipAdjustments } from "./ClipAdjustments";
import { ClipVersionHistory } from "./ClipVersionHistory";

export interface GeneratedClipPanelProps {
  clipId: string;
}

// Stable identity so `clip.paramOverrides ?? EMPTY_PARAM_OVERRIDES` doesn't
// hand WorkflowInputsForm a fresh object every render, which would defeat its
// memoization for clips with no overrides.
const EMPTY_PARAM_OVERRIDES: Record<string, unknown> = {};

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
    const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
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
    // Release the transient store's metadata subscription when it is
    // replaced (workflow refetch) or the panel unmounts — otherwise every
    // refetch leaks a NodeStore. cleanup() is idempotent.
    useEffect(() => {
      if (!transientNodeStore) {
        return undefined;
      }
      return () => transientNodeStore.getState().cleanup();
    }, [transientNodeStore]);
    const nodeStoreForForm = managerNodeStore ?? transientNodeStore;

    const inputDefinitions = useMemo<WorkflowInputDefinition[]>(() => {
      const nodes = (workflow?.graph?.nodes ?? []) as Node[];
      return nodes
        .map((node) => {
          const kind = getWorkflowInputKind(node.type);
          if (!kind) {
            return null;
          }
          return {
            nodeId: node.id,
            nodeType: node.type,
            kind,
            data: node.data as InputNodeData
          } satisfies WorkflowInputDefinition;
        })
        .filter(
          (definition): definition is WorkflowInputDefinition =>
            definition !== null
        );
    }, [workflow]);

    const handleInputChange = useCallback(
      (name: string, value: unknown) => {
        setParamOverride(clipId, name, value);
      },
      [clipId, setParamOverride]
    );

    const { generateClip, cancelClipGeneration, isActive, isFailed, canGenerate } =
      useGenerateClip(clipId);
    const handleGenerateClick = useCallback(() => {
      const action = isActive ? cancelClipGeneration() : generateClip();
      // Errors surface via the clip's status badge / generation store.
      action.catch(() => undefined);
    }, [isActive, cancelClipGeneration, generateClip]);

    if (!clip) {
      return null;
    }

    const paramOverrides = clip.paramOverrides ?? EMPTY_PARAM_OVERRIDES;
    const generateLabel = clip.currentAssetId ? "Regenerate" : "Generate";

    return (
      <Panel sx={panelSx}>
        <FlexColumn gap={0}>
          <GeneratedClipTopBar clip={clip} />

          {!workflowId && (
            <EmptyState
              variant="empty"
              size="small"
              description="No workflow is bound to this clip."
            />
          )}

          {workflowId && (
            <CollapsibleSection
              title={
                <InspectorSectionTitle
                  title="Inputs"
                  icon={<TuneOutlinedIcon />}
                />
              }
              defaultOpen
            >
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
                        <WorkflowInputsForm
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

          {workflowId && (
            <FlexColumn gap={0.5} sx={{ px: 1, pb: 1 }}>
              <EditorButton
                fullWidth
                variant={isActive ? "outlined" : "contained"}
                color={isActive ? "warning" : "primary"}
                startIcon={
                  isActive ? <StopRoundedIcon /> : <AutoAwesomeOutlinedIcon />
                }
                disabled={!isActive && !canGenerate}
                onClick={handleGenerateClick}
                data-testid="generated-clip-generate"
              >
                {isActive ? "Cancel" : generateLabel}
              </EditorButton>
              {isFailed && (
                <Caption sx={{ color: "error.main", textAlign: "center" }}>
                  Generation failed.
                </Caption>
              )}
            </FlexColumn>
          )}

          <ClipVersionHistory clipId={clipId} />

          <ClipAdjustments clip={clip} />
        </FlexColumn>
      </Panel>
    );
  }
);

GeneratedClipPanel.displayName = "GeneratedClipPanel";
