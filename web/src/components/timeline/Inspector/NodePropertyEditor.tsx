/** @jsxImportSource @emotion/react */
/**
 * NodePropertyEditor
 *
 * Renders editable Input* node fields (backed by `paramOverrides`) or a
 * read-only summary for non-input nodes on the path.
 *
 * When `selectedNodeId` is null, shows ALL Input* nodes as editable fields —
 * useful as a default before the NodeStack (NOD-308) wires up node selection.
 *
 * When `selectedNodeId` is set:
 *  - If the node is an Input* node → show its editable field.
 *  - If the node is a non-input node → show a read-only summary and an
 *    "Edit in Node Editor" button (NOD-314).
 *
 * The component fetches the workflow graph via TanStack Query so no parent
 * component needs to pass the graph explicitly.
 */

import React, { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Node } from "../../../stores/ApiTypes";

import { useWorkflow } from "../../../serverState/useWorkflow";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";

import {
  Caption,
  CollapsibleSection,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  Text
} from "../../ui_primitives";
import { InputNodeFieldRenderer } from "./InputNodeFieldRenderer";

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

/** Cast a node's `data` field to a typed property map. */
function nodeData(n: Node): Record<string, unknown> | undefined {
  return n.data as Record<string, unknown> | undefined;
}

/** Cast a node's `dynamic_properties` field to a typed property map. */
function nodeDynamic(n: Node): Record<string, unknown> | undefined {
  return n.dynamic_properties as Record<string, unknown> | undefined;
}

/** Short human-readable label for a node type, e.g. "StringInput" from "nodetool.input.StringInput". */
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
        <Caption color="secondary">
          Type: {shortNodeType(nodeType)}
        </Caption>
        <EditorButton onClick={handleEdit} sx={{ mt: 0.5, alignSelf: "flex-start" }}>
          Edit in Node Editor
        </EditorButton>
      </FlexColumn>
    );
  }
);
NodeSummary.displayName = "NodeSummary";

// ── Main component ─────────────────────────────────────────────────────────

export interface NodePropertyEditorProps {
  clipId: string;
  workflowId: string;
  /**
   * The node ID currently selected in the NodeStack.
   * When null/undefined, all Input* nodes are shown as editable fields.
   */
  selectedNodeId?: string | null;
}

const NodePropertyEditorInner: React.FC<NodePropertyEditorProps> = ({
  clipId,
  workflowId,
  selectedNodeId
}) => {
  // ── Data ────────────────────────────────────────────────────────────────

  const { data: workflow, isLoading, isError } = useWorkflow(workflowId);

  const paramOverrides = useTimelineStore(
    (s) => s.clips.find((c) => c.id === clipId)?.paramOverrides ?? {}
  );
  const setParamOverride = useTimelineStore((s) => s.setParamOverride);

  // ── Build a stable onChange for a given input-node param name ────────────

  const makeOnChange = useCallback(
    (paramName: string) => (value: unknown) => {
      setParamOverride(clipId, paramName, value);
    },
    [clipId, setParamOverride]
  );

  // ── Loading / error states ────────────────────────────────────────────────

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

  // ── Single-node mode: a specific node is selected in the NodeStack ────────

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
            data: data
          }}
          value={currentValue}
          onChange={makeOnChange(paramName)}
        />
      );
    }

    // Non-input node → read-only summary
    const data = nodeData(selectedNode);
    return (
      <NodeSummary
        nodeType={selectedNode.type}
        nodeName={data?.title as string | undefined}
        workflowId={workflowId}
      />
    );
  }

  // ── All-inputs mode: no specific node selected, show all Input* nodes ─────

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

export const NodePropertyEditor = memo(NodePropertyEditorInner);
NodePropertyEditor.displayName = "NodePropertyEditor";
