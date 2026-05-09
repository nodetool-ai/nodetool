/** @jsxImportSource @emotion/react */
/**
 * GeneratedLayerPanel
 *
 * Inspector panel shown when a generated sketch layer is selected. Composes:
 *   - GeneratedLayerHeader      — name, status badge, generated timestamp
 *   - LayerNodeStack            — vertical topo-sorted node list w/ selection
 *   - LayerNodePropertyEditor   — editable Input* fields or read-only summary
 *
 * Owns the SelectedLayerNodeStore interaction: resets the selected node
 * whenever the active `layerId` changes, defaulting to
 * `binding.selectedOutputNodeId`.
 *
 * Generation actions are NOT wired in this issue (NOD-321 stops short of
 * execution); a placeholder section explains where the controls will land.
 */

import React, { memo, useCallback, useEffect } from "react";

import type { Layer } from "../types";
import { useLayerBinding } from "../../../stores/sketch/SketchLayerBindingsStore";
import { useSelectedLayerNodeStore } from "../../../stores/sketch/SelectedLayerNodeStore";
import { useWorkflow } from "../../../serverState/useWorkflow";
import {
  Caption,
  CollapsibleSection,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  Panel
} from "../../ui_primitives";
import { GeneratedLayerHeader } from "./GeneratedLayerHeader";
import { LayerNodeStack } from "./LayerNodeStack";
import { LayerNodePropertyEditor } from "./LayerNodePropertyEditor";

export interface GeneratedLayerPanelProps {
  layer: Layer;
}

export const GeneratedLayerPanel: React.FC<GeneratedLayerPanelProps> = memo(
  ({ layer }) => {
    const binding = useLayerBinding(layer.id);

    const selectedLayerNodeId = useSelectedLayerNodeStore(
      (s) => s.selectedLayerNodeId
    );
    const resetForLayer = useSelectedLayerNodeStore((s) => s.resetForLayer);
    const setSelectedLayerNodeId = useSelectedLayerNodeStore(
      (s) => s.setSelectedLayerNodeId
    );

    const selectedOutputNodeId = binding?.selectedOutputNodeId ?? null;

    useEffect(() => {
      resetForLayer(selectedOutputNodeId);
    }, [layer.id, selectedOutputNodeId, resetForLayer]);

    const handleSelectNode = useCallback(
      (nodeId: string) => setSelectedLayerNodeId(nodeId),
      [setSelectedLayerNodeId]
    );

    const workflowId = binding?.workflowId ?? null;
    const { data: workflow, isLoading, isError } = useWorkflow(workflowId);

    if (!binding) {
      return (
        <Panel sx={{ width: "100%", p: 1 }}>
          <EmptyState
            variant="empty"
            size="small"
            title="No workflow binding"
            description="This layer does not have a generated-layer binding yet."
          />
        </Panel>
      );
    }

    const graphNodes = workflow?.graph?.nodes ?? [];
    const graphEdges = workflow?.graph?.edges ?? [];

    return (
      <Panel sx={{ width: "100%", overflow: "auto" }}>
        <FlexColumn gap={0}>
          <GeneratedLayerHeader layer={layer} binding={binding} />

          <CollapsibleSection title="Workflow Nodes" defaultOpen>
            {isLoading && <LoadingSpinner size="small" />}
            {isError && (
              <EmptyState
                variant="error"
                size="small"
                description="Failed to load workflow graph."
              />
            )}
            {!isLoading && !isError && selectedOutputNodeId && (
              <LayerNodeStack
                nodes={graphNodes}
                edges={graphEdges}
                selectedOutputNodeId={selectedOutputNodeId}
                selectedNodeId={selectedLayerNodeId}
                workflowId={binding.workflowId}
                onSelectNode={handleSelectNode}
              />
            )}
            {!isLoading && !isError && !selectedOutputNodeId && (
              <EmptyState
                variant="empty"
                size="small"
                description="No output node configured for this layer."
              />
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Properties" defaultOpen>
            <LayerNodePropertyEditor
              layerId={layer.id}
              workflowId={binding.workflowId}
              selectedNodeId={selectedLayerNodeId}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Actions" defaultOpen>
            <Caption color="secondary">
              Generation, lock, and version controls land in NOD-323.
            </Caption>
          </CollapsibleSection>
        </FlexColumn>
      </Panel>
    );
  }
);

GeneratedLayerPanel.displayName = "GeneratedLayerPanel";
