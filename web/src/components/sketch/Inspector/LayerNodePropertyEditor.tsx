/** @jsxImportSource @emotion/react */
/**
 * LayerNodePropertyEditor
 *
 * Renders editable Input* node fields (backed by the layer binding's
 * `paramOverrides`) or a read-only summary for non-input nodes on the path.
 * Mirrors the Timeline's `NodePropertyEditor`, retargeted from clip → layer.
 *
 * When `selectedNodeId` is null, shows ALL Input* nodes as editable fields.
 * When `selectedNodeId` is set:
 *  - Input* node → editable field for that input.
 *  - Non-input node → read-only summary + "Edit in Node Editor" deep link.
 */

import React, { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Node } from "../../../stores/ApiTypes";

import { useWorkflow } from "../../../serverState/useWorkflow";
import {
  useSketchLayerBindingsStore,
  useLayerBinding
} from "../../../stores/sketch/SketchLayerBindingsStore";

import {
  Caption,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner
} from "../../ui_primitives";
import { InputNodeFieldRenderer } from "../../timeline/Inspector/InputNodeFieldRenderer";

// ── Helpers ────────────────────────────────────────────────────────────────

function isInputNodeType(nodeType: string): boolean {
  return nodeType.startsWith("nodetool.input.");
}

function inputNodeParamName(
  data: Record<string, unknown> | undefined,
  dynamic_properties?: Record<string, unknown>
): string | null {
  return (
    (data?.name as string | undefined) ??
    (dynamic_properties?.name as string | undefined) ??
    null
  );
}

function nodeData(n: Node): Record<string, unknown> | undefined {
  return n.data as Record<string, unknown> | undefined;
}

function nodeDynamic(n: Node): Record<string, unknown> | undefined {
  return n.dynamic_properties as Record<string, unknown> | undefined;
}

function shortNodeType(nodeType: string): string {
  return nodeType.split(".").pop() ?? nodeType;
}

// ── Sub-component: read-only summary for non-input nodes ───────────────────

interface NodeSummaryProps {
  nodeType: string;
  nodeName?: string;
  workflowId: string;
}

const NodeSummary: React.FC<NodeSummaryProps> = memo(
  ({ nodeType, nodeName, workflowId }) => {
    const navigate = useNavigate();
    const displayName = nodeName ?? shortNodeType(nodeType);
    const namespace = nodeType.split(".").slice(0, -1).join(".");

    const handleEdit = useCallback(() => {
      navigate(`/workflows/${workflowId}`);
    }, [navigate, workflowId]);

    return (
      <FlexColumn gap={0.5}>
        <FlexRow align="center" gap={1} sx={{ mb: 0.5 }}>
          <Label>{displayName}</Label>
          <Caption color="secondary">{namespace}</Caption>
        </FlexRow>
        <Caption color="secondary">Type: {shortNodeType(nodeType)}</Caption>
        <EditorButton
          onClick={handleEdit}
          sx={{ mt: 0.5, alignSelf: "flex-start" }}
        >
          Edit in Node Editor
        </EditorButton>
      </FlexColumn>
    );
  }
);
NodeSummary.displayName = "NodeSummary";

// ── Main component ─────────────────────────────────────────────────────────

export interface LayerNodePropertyEditorProps {
  layerId: string;
  workflowId: string;
  selectedNodeId?: string | null;
}

const LayerNodePropertyEditorInner: React.FC<LayerNodePropertyEditorProps> = ({
  layerId,
  workflowId,
  selectedNodeId
}) => {
  const { data: workflow, isLoading, isError } = useWorkflow(workflowId);
  const binding = useLayerBinding(layerId);
  const setParamOverride = useSketchLayerBindingsStore(
    (s) => s.setParamOverride
  );

  const paramOverrides = binding?.paramOverrides ?? {};

  const makeOnChange = useCallback(
    (paramName: string) => (value: unknown) => {
      setParamOverride(layerId, paramName, value);
    },
    [layerId, setParamOverride]
  );

  if (isLoading) {
    return (
      <FlexRow align="center" justify="center" sx={{ py: 2 }}>
        <LoadingSpinner size="small" />
      </FlexRow>
    );
  }

  if (isError || !workflow?.graph) {
    return (
      <EmptyState
        variant="error"
        size="small"
        description="Could not load workflow parameters"
      />
    );
  }

  const nodes: Node[] = (workflow.graph.nodes as Node[] | undefined) ?? [];

  if (selectedNodeId) {
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    if (!selectedNode) {
      return (
        <EmptyState
          variant="empty"
          size="small"
          description="Node not found in workflow"
        />
      );
    }

    if (isInputNodeType(selectedNode.type)) {
      const data = nodeData(selectedNode);
      const paramName = inputNodeParamName(data, nodeDynamic(selectedNode));
      if (!paramName) {
        return (
          <Caption color="secondary">
            Input node has no parameter name configured.
          </Caption>
        );
      }
      const currentValue =
        paramName in paramOverrides ? paramOverrides[paramName] : data?.value;
      return (
        <InputNodeFieldRenderer
          node={{
            id: selectedNode.id,
            type: selectedNode.type,
            data
          }}
          value={currentValue}
          onChange={makeOnChange(paramName)}
        />
      );
    }

    const data = nodeData(selectedNode);
    return (
      <NodeSummary
        nodeType={selectedNode.type}
        nodeName={data?.title as string | undefined}
        workflowId={workflowId}
      />
    );
  }

  const inputNodes = nodes.filter((n) => isInputNodeType(n.type));

  if (inputNodes.length === 0) {
    return (
      <EmptyState
        variant="empty"
        size="small"
        description="This workflow has no editable input parameters."
      />
    );
  }

  return (
    <FlexColumn gap={1}>
      {inputNodes.map((node) => {
        const data = nodeData(node);
        const paramName = inputNodeParamName(data, nodeDynamic(node));
        if (!paramName) return null;
        const currentValue =
          paramName in paramOverrides ? paramOverrides[paramName] : data?.value;
        return (
          <InputNodeFieldRenderer
            key={node.id}
            node={{ id: node.id, type: node.type, data }}
            value={currentValue}
            onChange={makeOnChange(paramName)}
          />
        );
      })}
    </FlexColumn>
  );
};

export const LayerNodePropertyEditor = memo(LayerNodePropertyEditorInner);
LayerNodePropertyEditor.displayName = "LayerNodePropertyEditor";
