import { useCallback, useEffect, useRef } from "react";

import { ChainEditor } from "../chain_editor/ChainEditor";
import { useChainEditorStore } from "../chain_editor/useChainEditorStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import type { NodeStore } from "../../stores/NodeStore";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import type { Node as GraphNode } from "../../stores/ApiTypes";

interface WorkflowChainSurfaceProps {
  workflowId: string;
  nodeStore: NodeStore;
}

/**
 * The Chain surface for a workflow tab: the same workflow rendered as a linear
 * list of node cards instead of the ReactFlow canvas. Toggled from the floating
 * toolbar's view-mode button.
 *
 * The chain store is the editing surface; every change is mirrored back into
 * the tab's NodeStore so running, saving and switching back to the graph all
 * see the edits. Positions of nodes that already exist are preserved, so
 * round-tripping through the chain view doesn't flatten a hand-made layout.
 */
const WorkflowChainSurface = ({
  workflowId,
  nodeStore
}: WorkflowChainSurfaceProps) => {
  const loadWorkflow = useChainEditorStore((state) => state.loadWorkflow);
  const toWorkflowGraph = useChainEditorStore((state) => state.toWorkflowGraph);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const updateWorkflow = useWorkflowManager((state) => state.updateWorkflow);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  // Metadata arrives asynchronously, and the chain store drops nodes it has no
  // metadata for — so wait for it before loading the graph in.
  const metadataLoaded = useMetadataStore(
    (state) => Object.keys(state.metadata).length > 0
  );

  const loadedRef = useRef<string | null>(null);
  // Nodes the chain view can't represent (comments, groups, anything without
  // metadata). They stay in the NodeStore untouched so a round-trip through the
  // chain view never deletes them.
  const passthroughRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!metadataLoaded || loadedRef.current === workflowId) {
      return;
    }
    loadedRef.current = workflowId;
    loadWorkflow(nodeStore.getState().getWorkflow());
    const chainIds = new Set(
      useChainEditorStore.getState().chain.map((node) => node.id)
    );
    passthroughRef.current = new Set(
      nodeStore
        .getState()
        .nodes.filter((node) => !chainIds.has(node.id))
        .map((node) => node.id)
    );
  }, [metadataLoaded, workflowId, loadWorkflow, nodeStore]);

  const applyToNodeStore = useCallback(() => {
    const graph = toWorkflowGraph();
    const { nodes, edges, workflow, setNodes, setEdges } = nodeStore.getState();
    const passthrough = passthroughRef.current;
    const existingUi = new Map(
      nodes.map((node) => [
        node.id,
        { position: node.position, width: node.width, height: node.height }
      ])
    );

    const merged: GraphNode[] = graph.nodes.map((node) => {
      const existing = existingUi.get(node.id);
      if (!existing) {
        return node;
      }
      const ui_properties = {
        ...(node.ui_properties as Record<string, unknown>)
      };
      ui_properties.position = existing.position;
      if (existing.width) ui_properties.width = existing.width;
      if (existing.height) ui_properties.height = existing.height;
      return { ...node, ui_properties };
    });

    const keptNodes = nodes.filter((node) => passthrough.has(node.id));
    setNodes([
      ...merged.map((node) =>
        graphNodeToReactFlowNode(workflow, node)
      ),
      ...keptNodes
    ]);

    const liveIds = new Set([
      ...graph.nodes.map((node) => node.id),
      ...keptNodes.map((node) => node.id)
    ]);
    const keptEdges = edges.filter(
      (edge) =>
        (passthrough.has(edge.source) || passthrough.has(edge.target)) &&
        liveIds.has(edge.source) &&
        liveIds.has(edge.target)
    );
    setEdges([...graph.edges.map(graphEdgeToReactFlowEdge), ...keptEdges]);
  }, [nodeStore, toWorkflowGraph]);

  // Mirror chain edits into the NodeStore. Subscribing (rather than reacting to
  // rendered state) keeps the write out of the render path; the chain store is
  // never written back from here, so there is no feedback loop.
  useEffect(() => {
    if (!metadataLoaded) {
      return;
    }
    return useChainEditorStore.subscribe((state, prev) => {
      if (state.workflowId !== workflowId) {
        return;
      }
      if (
        state.chain === prev.chain &&
        state.connections === prev.connections
      ) {
        return;
      }
      applyToNodeStore();
    });
  }, [applyToNodeStore, metadataLoaded, workflowId]);

  const handleSave = useCallback(async () => {
    applyToNodeStore();
    const name = useChainEditorStore.getState().workflowName;
    const current = nodeStore.getState().workflow;
    if (name && name !== current.name) {
      updateWorkflow({ ...current, name });
    }
    try {
      await saveWorkflow(nodeStore.getState().getWorkflow());
      nodeStore.getState().setWorkflowDirty(false);
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content:
          error instanceof Error ? error.message : "Failed to save workflow"
      });
    }
  }, [
    applyToNodeStore,
    addNotification,
    nodeStore,
    saveWorkflow,
    updateWorkflow
  ]);

  return <ChainEditor onSave={handleSave} />;
};

export default WorkflowChainSurface;
