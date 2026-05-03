/**
 * Zustand store for the mobile chain-based graph editor.
 *
 * Manages:
 * - Available node metadata (fetched from API)
 * - The ordered chain of nodes
 * - Property values, output selection, input mappings
 * - Workflow conversion and persistence
 */

import { create } from "zustand";
import { apiService, type WorkflowGraphInput } from "../services/api";
import type { NodeMetadata, Workflow } from "../types/ApiTypes";
import type {
  ChainNode,
  ChainConnection,
  InputMappings,
  InputSource,
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
  /** Set a single input mapping: which source node+output feeds this input. */
  setInputMapping: (
    nodeId: string,
    inputName: string,
    source: InputSource | null
  ) => void;
  /** Clear all input mappings for a node. */
  clearInputMappings: (nodeId: string) => void;
  /** Add a dynamic input to a dynamic node (e.g. Code). */
  addDynamicInput: (nodeId: string, inputName: string) => void;
  /** Remove a dynamic input from a dynamic node. */
  removeDynamicInput: (nodeId: string, inputName: string) => void;
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
      set({
        allMetadata: data,
        metadataByType: byType,
        metadataLoading: false,
      });
    } catch (err) {
      set({
        metadataError:
          err instanceof Error ? err.message : "Failed to load node metadata",
        metadataLoading: false,
      });
    }
  },

  // ── Chain manipulation ─────────────────────────────────────────────

  addNode: (metadata, atIndex) => {
    const { chain } = get();
    let idx: number;
    if (isInputNode(metadata.node_type)) {
      idx = chain.filter((n) => isInputNode(n.nodeType)).length;
    } else if (isOutputNode(metadata.node_type)) {
      idx = chain.length;
    } else {
      idx = atIndex !== undefined ? atIndex : chain.length;
      const inputCount = chain.filter((n) => isInputNode(n.nodeType)).length;
      if (idx < inputCount) {idx = inputCount;}
    }

    const defaultOutput =
      metadata.outputs.length > 0 ? metadata.outputs[0].name : "";

    // Auto-map from previous node if compatible
    const inputMappings: InputMappings = {};
    if (idx > 0) {
      const prev = chain[idx - 1];
      const prevOutput = prev.metadata.outputs.find(
        (o) => o.name === prev.selectedOutput
      );
      if (prevOutput) {
        const bestInput = findBestInput(metadata, prevOutput.type);
        if (bestInput) {
          inputMappings[bestInput] = {
            sourceNodeId: prev.id,
            sourceOutput: prev.selectedOutput,
          };
        }
      }
    }

    const newNode: ChainNode = {
      id: generateId(),
      nodeType: metadata.node_type,
      metadata,
      properties: defaultProperties(metadata),
      dynamicProperties: {},
      selectedOutput: defaultOutput,
      inputMappings,
      expanded: true,
    };

    const updated = [...chain];
    updated.splice(idx, 0, newNode);

    set({ chain: updated, connections: buildConnections(updated) });
  },

  removeNode: (nodeId) => {
    const { chain } = get();
    const updated = chain.filter((n) => n.id !== nodeId);

    // Clean up any inputMappings referencing the removed node
    for (const node of updated) {
      const cleaned: InputMappings = {};
      for (const [inputName, source] of Object.entries(node.inputMappings)) {
        if (source.sourceNodeId !== nodeId) {
          cleaned[inputName] = source;
        }
      }
      node.inputMappings = cleaned;
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
      {return;}

    const updated = [...chain];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    // Validate all inputMappings: sources must come before targets
    const idToIndex = new Map(updated.map((n, i) => [n.id, i]));
    for (let i = 0; i < updated.length; i++) {
      const cleaned: InputMappings = {};
      for (const [inputName, source] of Object.entries(
        updated[i].inputMappings
      )) {
        const srcIdx = idToIndex.get(source.sourceNodeId);
        if (srcIdx !== undefined && srcIdx < i) {
          cleaned[inputName] = source;
        }
      }
      updated[i] = { ...updated[i], inputMappings: cleaned };
    }

    set({ chain: updated, connections: buildConnections(updated) });
  },

  duplicateNode: (nodeId) => {
    const { chain } = get();
    const idx = chain.findIndex((n) => n.id === nodeId);
    if (idx === -1) {return;}
    const original = chain[idx];
    const dup: ChainNode = {
      ...original,
      id: generateId(),
      properties: { ...original.properties },
      dynamicProperties: { ...original.dynamicProperties },
      inputMappings: { ...original.inputMappings },
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
    const updated = chain.map((n) => {
      if (n.id !== nodeId) {return n;}
      return { ...n, selectedOutput: outputName };
    });
    set({ chain: updated, connections: buildConnections(updated) });
  },

  setInputMapping: (nodeId, inputName, source) => {
    set((state) => {
      const chain = state.chain.map((n) => {
        if (n.id !== nodeId) {return n;}
        const mappings = { ...n.inputMappings };
        if (source) {
          mappings[inputName] = source;
        } else {
          delete mappings[inputName];
        }
        return { ...n, inputMappings: mappings };
      });
      return { chain, connections: buildConnections(chain) };
    });
  },

  clearInputMappings: (nodeId) => {
    set((state) => {
      const chain = state.chain.map((n) =>
        n.id === nodeId ? { ...n, inputMappings: {} } : n
      );
      return { chain, connections: buildConnections(chain) };
    });
  },

  addDynamicInput: (nodeId, inputName) => {
    set((state) => {
      const chain = state.chain.map((n) => {
        if (n.id !== nodeId || !n.metadata.is_dynamic) {return n;}
        return {
          ...n,
          dynamicProperties: { ...n.dynamicProperties, [inputName]: null },
        };
      });
      return { chain };
    });
  },

  removeDynamicInput: (nodeId, inputName) => {
    set((state) => {
      const chain = state.chain.map((n) => {
        if (n.id !== nodeId) {return n;}
        const dynamicProperties = { ...n.dynamicProperties };
        delete dynamicProperties[inputName];
        const inputMappings = { ...n.inputMappings };
        delete inputMappings[inputName];
        return { ...n, dynamicProperties, inputMappings };
      });
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

    // Build edge lookup: target → list of edges
    const edgesByTarget = new Map<
      string,
      Array<{
        source: string;
        sourceHandle: string;
        targetHandle: string;
      }>
    >();
    for (const e of workflow.graph.edges) {
      const existing = edgesByTarget.get(e.target) ?? [];
      existing.push({
        source: e.source,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      });
      edgesByTarget.set(e.target, existing);
    }

    // Topological sort
    const nodeMap = new Map(workflow.graph.nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const ordered: typeof workflow.graph.nodes = [];
    const targets = new Set(workflow.graph.edges.map((e) => e.target));
    const roots = workflow.graph.nodes.filter((n) => !targets.has(n.id));

    function visit(nodeId: string) {
      if (visited.has(nodeId)) {return;}
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (node) {ordered.push(node);}
      for (const e of workflow.graph.edges) {
        if (e.source === nodeId) {visit(e.target);}
      }
    }
    for (const r of roots) {visit(r.id);}
    for (const n of workflow.graph.nodes) {
      if (!visited.has(n.id)) {ordered.push(n);}
    }

    const chain: ChainNode[] = ordered
      .map((node) => {
        const meta = byType.get(node.type);
        if (!meta) {return null;}

        // Build inputMappings from all incoming edges
        const incomingEdges = edgesByTarget.get(node.id) ?? [];
        const inputMappings: InputMappings = {};
        for (const edge of incomingEdges) {
          inputMappings[edge.targetHandle] = {
            sourceNodeId: edge.source,
            sourceOutput: edge.sourceHandle,
          };
        }

        // Determine selected output from outgoing edges
        const outgoingEdge = workflow.graph.edges.find(
          (e) => e.source === node.id
        );
        const selectedOutput =
          outgoingEdge?.sourceHandle ?? (meta.outputs[0]?.name ?? "");

        return {
          id: node.id,
          nodeType: node.type,
          metadata: meta,
          properties: (node.data ?? {}) as Record<string, unknown>,
          dynamicProperties: (node.dynamic_properties ?? {}) as Record<string, unknown>,
          selectedOutput,
          inputMappings,
          expanded: false as boolean,
        } as ChainNode;
      })
      .filter((n): n is ChainNode => n !== null);

    // Sort: input nodes first, then regular, then output
    chain.sort((a, b) => {
      const aG = isInputNode(a.nodeType) ? 0 : isOutputNode(a.nodeType) ? 2 : 1;
      const bG = isInputNode(b.nodeType) ? 0 : isOutputNode(b.nodeType) ? 2 : 1;
      return aG - bG;
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
          graph: graph as unknown as WorkflowGraphInput,
          access: "private",
        });
        return result as unknown as Workflow;
      } else {
        const result = await apiService.createWorkflow({
          name: workflowName,
          description: "",
          graph: graph as unknown as WorkflowGraphInput,
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
