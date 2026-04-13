/**
 * Zustand store for the mobile chain-based graph editor.
 *
 * Manages:
 * - Available node metadata (fetched from API)
 * - The ordered chain of nodes
 * - Property values, output selection, input mapping
 * - Workflow conversion and persistence
 */

import { create } from "zustand";
import { apiService } from "../services/api";
import type { NodeMetadata, Workflow } from "../types/ApiTypes";
import type {
  ChainNode,
  ChainConnection,
} from "../types/graphEditor";
import {
  buildConnections,
  chainToGraph,
  findBestInput,
} from "../types/graphEditor";

// ── Helpers ──────────────────────────────────────────────────────────

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function defaultProperties(metadata: NodeMetadata): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const p of metadata.properties) {
    if (p.default !== undefined && p.default !== null) {
      props[p.name] = p.default;
    }
  }
  return props;
}

function isInputNode(nodeType: string): boolean {
  return nodeType.includes(".input.");
}

function isOutputNode(nodeType: string): boolean {
  return nodeType.includes(".output.");
}

// ── Store interface ──────────────────────────────────────────────────

interface GraphEditorState {
  // ---- Node metadata catalog ----
  allMetadata: NodeMetadata[];
  metadataByType: Map<string, NodeMetadata>;
  metadataLoading: boolean;
  metadataError: string | null;

  // ---- Chain state ----
  chain: ChainNode[];
  connections: ChainConnection[];

  // ---- Workflow info ----
  workflowId: string | null;
  workflowName: string;

  // ---- UI state ----
  nodePickerVisible: boolean;
  /** Index in chain where the next node will be inserted (-1 = append). */
  insertAtIndex: number;

  // ---- Actions: metadata ----
  fetchMetadata: () => Promise<void>;

  // ---- Actions: chain manipulation ----
  addNode: (metadata: NodeMetadata, atIndex?: number) => void;
  removeNode: (nodeId: string) => void;
  moveNode: (fromIndex: number, toIndex: number) => void;
  duplicateNode: (nodeId: string) => void;

  // ---- Actions: node editing ----
  updateProperty: (nodeId: string, name: string, value: unknown) => void;
  setSelectedOutput: (nodeId: string, outputName: string) => void;
  setInputMapping: (nodeId: string, inputName: string) => void;
  toggleExpanded: (nodeId: string) => void;
  collapseAll: () => void;

  // ---- Actions: UI ----
  showNodePicker: (insertAt?: number) => void;
  hideNodePicker: () => void;

  // ---- Actions: workflow ----
  loadWorkflow: (workflow: Workflow, metadata: NodeMetadata[]) => void;
  toWorkflowGraph: () => ReturnType<typeof chainToGraph>;
  saveWorkflow: () => Promise<Workflow | null>;
  newWorkflow: (name?: string) => void;
  setWorkflowName: (name: string) => void;

  // ---- Derived helpers ----
  rebuildConnections: () => void;
}

// ── Store implementation ─────────────────────────────────────────────

export const useGraphEditorStore = create<GraphEditorState>((set, get) => ({
  // ---- Initial state ----
  allMetadata: [],
  metadataByType: new Map(),
  metadataLoading: false,
  metadataError: null,

  chain: [],
  connections: [],

  workflowId: null,
  workflowName: "Untitled Workflow",

  nodePickerVisible: false,
  insertAtIndex: -1,

  // ── Metadata ───────────────────────────────────────────────────────

  fetchMetadata: async () => {
    set({ metadataLoading: true, metadataError: null });
    try {
      const data = await apiService.getNodeMetadata();
      const byType = new Map<string, NodeMetadata>();
      for (const m of data) {
        byType.set(m.node_type, m);
      }
      set({ allMetadata: data, metadataByType: byType, metadataLoading: false });
    } catch (err) {
      set({
        metadataError: err instanceof Error ? err.message : "Failed to load node metadata",
        metadataLoading: false,
      });
    }
  },

  // ── Chain manipulation ─────────────────────────────────────────────

  addNode: (metadata, atIndex) => {
    const { chain } = get();
    // Input nodes always go to the top (after existing input nodes)
    // Output nodes always go to the bottom
    let idx: number;
    if (isInputNode(metadata.node_type)) {
      idx = chain.filter((n) => isInputNode(n.nodeType)).length;
    } else if (isOutputNode(metadata.node_type)) {
      idx = chain.length;
    } else {
      idx = atIndex !== undefined ? atIndex : chain.length;
      // Ensure non-input nodes don't go before input nodes
      const inputCount = chain.filter((n) => isInputNode(n.nodeType)).length;
      if (idx < inputCount) idx = inputCount;
    }

    const defaultOutput =
      metadata.outputs.length > 0 ? metadata.outputs[0].name : "";

    // Determine input mapping from previous node
    let inputMapping: string | null = null;
    if (idx > 0) {
      const prev = chain[idx - 1];
      const prevOutput = prev.metadata.outputs.find(
        (o) => o.name === prev.selectedOutput
      );
      if (prevOutput) {
        inputMapping = findBestInput(metadata, prevOutput.type);
      }
    }

    const newNode: ChainNode = {
      id: generateId(),
      nodeType: metadata.node_type,
      metadata,
      properties: defaultProperties(metadata),
      selectedOutput: defaultOutput,
      inputMapping,
      expanded: true,
    };

    const updated = [...chain];
    updated.splice(idx, 0, newNode);

    // Re-resolve the input mapping of the node *after* the insertion
    if (idx < updated.length - 1) {
      const next = updated[idx + 1];
      const newNodeOutput = metadata.outputs.find(
        (o) => o.name === newNode.selectedOutput
      );
      if (newNodeOutput) {
        next.inputMapping = findBestInput(next.metadata, newNodeOutput.type);
      }
    }

    set({ chain: updated, connections: buildConnections(updated) });
  },

  removeNode: (nodeId) => {
    const { chain } = get();
    const idx = chain.findIndex((n) => n.id === nodeId);
    if (idx === -1) return;

    const updated = chain.filter((n) => n.id !== nodeId);

    // Re-map the node that was after the removed one
    if (idx > 0 && idx < updated.length) {
      const prev = updated[idx - 1];
      const next = updated[idx];
      const prevOutput = prev.metadata.outputs.find(
        (o) => o.name === prev.selectedOutput
      );
      if (prevOutput) {
        next.inputMapping = findBestInput(next.metadata, prevOutput.type);
      } else {
        next.inputMapping = null;
      }
    }
    if (updated.length > 0 && idx === 0) {
      updated[0].inputMapping = null;
    }

    set({ chain: updated, connections: buildConnections(updated) });
  },

  moveNode: (fromIndex, toIndex) => {
    const { chain } = get();
    if (
      fromIndex < 0 ||
      fromIndex >= chain.length ||
      toIndex < 0 ||
      toIndex >= chain.length
    )
      return;

    const updated = [...chain];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    // Rebuild all input mappings
    for (let i = 0; i < updated.length; i++) {
      if (i === 0) {
        updated[i].inputMapping = null;
      } else {
        const prev = updated[i - 1];
        const prevOutput = prev.metadata.outputs.find(
          (o) => o.name === prev.selectedOutput
        );
        if (prevOutput) {
          updated[i].inputMapping = findBestInput(
            updated[i].metadata,
            prevOutput.type
          );
        } else {
          updated[i].inputMapping = null;
        }
      }
    }

    set({ chain: updated, connections: buildConnections(updated) });
  },

  duplicateNode: (nodeId) => {
    const { chain } = get();
    const idx = chain.findIndex((n) => n.id === nodeId);
    if (idx === -1) return;
    const original = chain[idx];
    const dup: ChainNode = {
      ...original,
      id: generateId(),
      properties: { ...original.properties },
      expanded: false,
    };
    const updated = [...chain];
    updated.splice(idx + 1, 0, dup);
    set({ chain: updated, connections: buildConnections(updated) });
  },

  // ── Node editing ───────────────────────────────────────────────────

  updateProperty: (nodeId, name, value) => {
    set((state) => {
      const chain = state.chain.map((n) =>
        n.id === nodeId
          ? { ...n, properties: { ...n.properties, [name]: value } }
          : n
      );
      return { chain };
    });
  },

  setSelectedOutput: (nodeId, outputName) => {
    const { chain } = get();
    const idx = chain.findIndex((n) => n.id === nodeId);
    if (idx === -1) return;

    const updated = chain.map((n, i) => {
      if (i !== idx) return n;
      return { ...n, selectedOutput: outputName };
    });

    // Update the next node's input mapping
    if (idx < updated.length - 1) {
      const source = updated[idx];
      const output = source.metadata.outputs.find(
        (o) => o.name === outputName
      );
      if (output) {
        updated[idx + 1] = {
          ...updated[idx + 1],
          inputMapping: findBestInput(updated[idx + 1].metadata, output.type),
        };
      }
    }

    set({ chain: updated, connections: buildConnections(updated) });
  },

  setInputMapping: (nodeId, inputName) => {
    set((state) => {
      const chain = state.chain.map((n) =>
        n.id === nodeId ? { ...n, inputMapping: inputName } : n
      );
      return { chain, connections: buildConnections(chain) };
    });
  },

  toggleExpanded: (nodeId) => {
    set((state) => ({
      chain: state.chain.map((n) =>
        n.id === nodeId ? { ...n, expanded: !n.expanded } : n
      ),
    }));
  },

  collapseAll: () => {
    set((state) => ({
      chain: state.chain.map((n) => ({ ...n, expanded: false })),
    }));
  },

  // ── UI ─────────────────────────────────────────────────────────────

  showNodePicker: (insertAt) => {
    set({ nodePickerVisible: true, insertAtIndex: insertAt ?? -1 });
  },

  hideNodePicker: () => {
    set({ nodePickerVisible: false });
  },

  // ── Workflow ───────────────────────────────────────────────────────

  loadWorkflow: (workflow, metadata) => {
    const byType = new Map<string, NodeMetadata>();
    for (const m of metadata) {
      byType.set(m.node_type, m);
    }

    // Build a lookup for edges: target -> { sourceHandle, source }
    const edgesByTarget = new Map<string, { source: string; sourceHandle: string; targetHandle: string }>();
    for (const e of workflow.graph.edges) {
      edgesByTarget.set(e.target, {
        source: e.source,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      });
    }

    // Topological order (simple: follow edges from roots)
    const nodeMap = new Map(workflow.graph.nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const ordered: typeof workflow.graph.nodes = [];

    // Find root nodes (no incoming data edges)
    const targets = new Set(workflow.graph.edges.map((e) => e.target));
    const roots = workflow.graph.nodes.filter((n) => !targets.has(n.id));

    function visit(nodeId: string) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (node) ordered.push(node);
      // Follow outgoing edges
      for (const e of workflow.graph.edges) {
        if (e.source === nodeId) {
          visit(e.target);
        }
      }
    }
    for (const r of roots) visit(r.id);
    // Add any remaining unvisited nodes
    for (const n of workflow.graph.nodes) {
      if (!visited.has(n.id)) ordered.push(n);
    }

    const chain: ChainNode[] = ordered
      .map((node) => {
        const meta = byType.get(node.type);
        if (!meta) return null;

        const edgeInfo = edgesByTarget.get(node.id);
        const inputMapping = edgeInfo ? edgeInfo.targetHandle : null;

        // Determine selected output: if this node is a source of an edge, use that sourceHandle
        const outgoingEdge = workflow.graph.edges.find(
          (e) => e.source === node.id
        );
        const selectedOutput =
          outgoingEdge?.sourceHandle ?? (meta.outputs[0]?.name ?? "");

        const chainNode: ChainNode = {
          id: node.id,
          nodeType: node.type,
          metadata: meta,
          properties: (node.data ?? {}) as Record<string, unknown>,
          selectedOutput,
          inputMapping,
          expanded: false,
        };
        return chainNode;
      })
      .filter((n): n is ChainNode => n !== null);

    // Sort: input nodes first, then regular nodes, then output nodes
    chain.sort((a, b) => {
      const aGroup = isInputNode(a.nodeType) ? 0 : isOutputNode(a.nodeType) ? 2 : 1;
      const bGroup = isInputNode(b.nodeType) ? 0 : isOutputNode(b.nodeType) ? 2 : 1;
      return aGroup - bGroup;
    });

    set({
      chain,
      connections: buildConnections(chain),
      workflowId: workflow.id,
      workflowName: workflow.name,
      metadataByType: byType,
      allMetadata: metadata,
    });
  },

  toWorkflowGraph: () => {
    const { chain, connections } = get();
    return chainToGraph(chain, connections);
  },

  saveWorkflow: async () => {
    const { workflowId, workflowName, chain, connections } = get();
    const graph = chainToGraph(chain, connections);

    try {
      if (workflowId) {
        const result = await apiService.saveWorkflow({
          id: workflowId,
          name: workflowName,
          description: "",
          graph: graph as unknown as { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> },
          access: "private",
        });
        return result as unknown as Workflow;
      } else {
        const result = await apiService.createWorkflow({
          name: workflowName,
          description: "",
          graph: graph as unknown as { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> },
          access: "private",
        });
        const newId = (result as unknown as Workflow).id;
        set({ workflowId: newId });
        return result as unknown as Workflow;
      }
    } catch (err) {
      console.error("Failed to save workflow:", err);
      return null;
    }
  },

  newWorkflow: (name) => {
    set({
      chain: [],
      connections: [],
      workflowId: null,
      workflowName: name ?? "Untitled Workflow",
    });
  },

  setWorkflowName: (name) => {
    set({ workflowName: name });
  },

  rebuildConnections: () => {
    const { chain } = get();
    set({ connections: buildConnections(chain) });
  },
}));
