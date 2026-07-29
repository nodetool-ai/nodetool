/** @jsxImportSource @emotion/react */
/** Inspector panel for generated sketch layers — header, inputs form, actions, and version history. */

import React, { memo, useCallback, useEffect, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import type { Layer } from "../types";
import type { Node } from "../../../stores/ApiTypes";
import { useLayerBinding, useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useWorkflow } from "../../../serverState/useWorkflow";
import { NodeContext } from "../../../contexts/NodeContext";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { createNodeStore, type NodeStore } from "../../../stores/NodeStore";
import {
  AlertBanner,
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
import { useSketchGenerationStore } from "../../../stores/sketch/SketchGenerationStore";
import { GeneratedLayerHeader } from "./GeneratedLayerHeader";
import { LayerActions } from "./LayerActions";
import { LayerVersionList } from "./LayerVersionList";

export interface GeneratedLayerPanelProps {
  layer: Layer;
}

const inputsSectionStyles = (theme: Theme) =>
  css({
    padding: theme.spacing(2, 1),
    borderTop: `1px solid ${theme.vars.palette.grey[700]}`
  });

const actionsSectionStyles = (theme: Theme) =>
  css({
    padding: theme.spacing(1, 0.5),
    borderTop: `1px solid ${theme.vars.palette.grey[700]}`
  });

const inputsContainerStyles = (theme: Theme) =>
  css({
    ".inputs-card, .application-card": {
      background: "transparent",
      border: "none",
      padding: 0
    },
    ".inputs-card": {
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
    ".input-field-control": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5)
    },
    // Description Caption rendered below each control by WorkflowInputsForm.
    // Make it smaller and more muted so it reads as helper text, not a label.
    ".input-field > .MuiTypography-root": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.disabled,
      lineHeight: 1.35,
      marginTop: theme.spacing(0.5)
    }
  });

export const GeneratedLayerPanel: React.FC<GeneratedLayerPanelProps> = memo(
  ({ layer }) => {
    const theme = useTheme();
    const binding = useLayerBinding(layer.id);
    const documentId = useSketchSessionStore((s) => s.documentId);
    const setParamOverride = useSketchSessionStore(
      (s) => s.setParamOverride
    );

    const workflowId = binding?.workflowId ?? null;
    const { data: workflow, isLoading, isError } = useWorkflow(workflowId);

    // Property components rendered by WorkflowInputsForm (IntegerProperty,
    // SliderProperty, …) call `useTemporalNodes`, which throws unless a
    // NodeContext is in scope. Reuse the WorkflowManager's node store when
    // the bound workflow is open in the editor; otherwise stand up a
    // transient store backed by the fetched workflow data so the form can
    // render without registering this layer-private workflow as "open".
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

    const jobState = useSketchGenerationStore(
      (s) => s.layerJobs[layer.id]
    );
    const clearJob = useSketchGenerationStore((s) => s.clearJob);
    const jobErrorMessage =
      jobState?.status === "failed" ? jobState.errorMessage : undefined;

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
        setParamOverride(layer.id, name, value);
      },
      [layer.id, setParamOverride]
    );

    if (!binding) {
      return (
        <Panel
          background="default"
          bordered={false}
          sx={{ width: "100%", p: 1 }}
        >
          <EmptyState
            variant="empty"
            size="small"
            title="No workflow binding"
            description="This layer does not have a generated-layer binding yet."
          />
        </Panel>
      );
    }

    const paramOverrides = binding.paramOverrides ?? {};

    return (
      <Panel
        bordered={false}
        sx={{
          width: "100%",
          overflow: "auto",
          backgroundColor: theme.vars.palette.grey[800]
        }}
      >
        <FlexColumn gap={0}>
          <GeneratedLayerHeader layer={layer} binding={binding} />

          {jobErrorMessage && (
            <Box sx={{ px: 1, pb: 1 }}>
              <AlertBanner
                severity="error"
                compact
                title="Generation failed"
                onClose={() => clearJob(layer.id)}
              >
                {jobErrorMessage}
              </AlertBanner>
            </Box>
          )}

          <Box css={inputsSectionStyles(theme)}>
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
          </Box>

          <Box css={actionsSectionStyles(theme)}>
            <LayerActions layerId={layer.id} binding={binding} />
          </Box>

          {documentId && (
            <LayerVersionList documentId={documentId} layerId={layer.id} />
          )}
        </FlexColumn>
      </Panel>
    );
  }
);

GeneratedLayerPanel.displayName = "GeneratedLayerPanel";
