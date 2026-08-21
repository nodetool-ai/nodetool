/**
 * Zustand store for the web chain-based graph editor.
 */

import { create } from "zustand";
import useMetadataStore from "../../stores/MetadataStore";
import type { NodeMetadata, Workflow } from "../../stores/ApiTypes";
import type { ChainNode, ChainConnection, InputMappings, InputSource } from "./chainTypes";
import { areTypesCompatible, autoMapInputs, buildConnections, chainToGraph } from "./chainTypes";

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function defaultProperties(metadata: NodeMetadata) {
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

interface ChainEditorState {
  chain: ChainNode[];
  connections: ChainConnection[];
  workflowId: string | null;
  workflowName: string;
  nodePickerVisible: boolean;
  insertAtIndex: number;

  addNode: (metadata: NodeMetadata, atIndex?: number) => void;
  removeNode: (nodeId: string) => void;
  moveNode: (fromIndex: number, toIndex: number) => void;
  duplicateNode: (nodeId: string) => void;
  updateProperty: (nodeId: string, name: string, value: unknown) => void;
  setSelectedOutput: (nodeId: string, outputName: string) => void;
  /** Set a single input mapping: which source node+output feeds this input. */
  setInputMapping: (nodeId: string, inputName: string, source: InputSource | null) => void;
  /** Clear all input mappings for a node. */
  clearInputMappings: (nodeId: string) => void;
  toggleExpanded: (nodeId: string) => void;
  collapseAll: () => void;
  showNodePicker: (insertAt?: number) => void;
  hideNodePicker: () => void;
  loadWorkflow: (workflow: Workflow) => void;
  toWorkflowGraph: () => ReturnType<typeof chainToGraph>;
  newWorkflow: (name?: string) => void;
  setWorkflowName: (name: string) => void;
}

export const useChainEditorStore = create<ChainEditorState>((set, get) => ({
  chain: [],
  connections: [],
  workflowId: null,
  workflowName: "Untitled Workflow",
  nodePickerVisible: false,
  insertAtIndex: -1,

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

    // Auto-map from the nearest earlier node that produces a matching value.
    const inputMappings = autoMapInputs(metadata, chain, idx);

    const newNode: ChainNode = {
      id: generateId(),
      nodeType: metadata.node_type,
      metadata,
      properties: defaultProperties(metadata),
      selectedOutput: defaultOutput,
      inputMappings,
      expanded: true,
    };

    const updated = [...chain];
    updated.splice(idx, 0, newNode);

    // Inserting into the middle splices the new node into the flow: an input
    // on the following node that was fed by the node now above the new one
    // moves to the new node's output, when the types allow it.
    const follower = updated[idx + 1];
    const displacedSource = idx > 0 ? updated[idx - 1].id : null;
    const newOutput = metadata.outputs.find((o) => o.name === defaultOutput);
    if (follower && displacedSource && newOutput) {
      const remapped: InputMappings = {};
      for (const [inputName, source] of Object.entries(follower.inputMappings)) {
        const prop = follower.metadata.properties.find((p) => p.name === inputName);
        remapped[inputName] =
          source.sourceNodeId === displacedSource &&
          prop &&
          areTypesCompatible(newOutput.type, prop.type)
            ? { sourceNodeId: newNode.id, sourceOutput: defaultOutput }
            : source;
      }
      updated[idx + 1] = { ...follower, inputMappings: remapped };
    }

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
    if (fromIndex < 0 || fromIndex >= chain.length || toIndex < 0 || toIndex >= chain.length) return;

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
    if (idx === -1) return;
    const original = chain[idx];
    const dup: ChainNode = {
      ...original,
      id: generateId(),
      properties: { ...original.properties },
      inputMappings: { ...original.inputMappings },
      expanded: false,
    };
    const updated = [...chain];
    updated.splice(idx + 1, 0, dup);
    set({ chain: updated, connections: buildConnections(updated) });
  },

  updateProperty: (nodeId, name, value) => {
    set((state) => ({
      chain: state.chain.map((n) =>
        n.id === nodeId ? { ...n, properties: { ...n.properties, [name]: value } } : n
      ),
    }));
  },

  setSelectedOutput: (nodeId, outputName) => {
    const { chain } = get();
    const updated = chain.map((n) =>
      n.id === nodeId ? { ...n, selectedOutput: outputName } : n
    );
    set({ chain: updated, connections: buildConnections(updated) });
  },

  setInputMapping: (nodeId, inputName, source) => {
    set((state) => {
      const chain = state.chain.map((n) => {
        if (n.id !== nodeId) return n;
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

  toggleExpanded: (nodeId) => {
    set((state) => ({
      chain: state.chain.map((n) => (n.id === nodeId ? { ...n, expanded: !n.expanded } : n)),
    }));
  },

  collapseAll: () => {
    set((state) => ({ chain: state.chain.map((n) => ({ ...n, expanded: false })) }));
  },

  showNodePicker: (insertAt) => {
    set({ nodePickerVisible: true, insertAtIndex: insertAt ?? -1 });
  },

  hideNodePicker: () => {
    set({ nodePickerVisible: false });
  },

  loadWorkflow: (workflow) => {
    const metadataMap = useMetadataStore.getState().metadata;

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

    // Kept in graph order, so the first entry is what `edges.find` returned.
    // The DFS and the selected-output lookup below each used to scan the whole
    // edge list per node, making loadWorkflow O(N*E).
    const edgesBySource = new Map<string, typeof workflow.graph.edges>();
    for (const e of workflow.graph.edges) {
      const existing = edgesBySource.get(e.source);
      if (existing) {
        existing.push(e);
      } else {
        edgesBySource.set(e.source, [e]);
      }
    }

    const nodeMap = new Map(workflow.graph.nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const ordered: typeof workflow.graph.nodes = [];
    const targets = new Set(workflow.graph.edges.map((e) => e.target));
    const roots = workflow.graph.nodes.filter((n) => !targets.has(n.id));

    function visit(nodeId: string) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (node) ordered.push(node);
      for (const e of edgesBySource.get(nodeId) ?? []) {
        visit(e.target);
      }
    }
    for (const r of roots) visit(r.id);
    for (const n of workflow.graph.nodes) {
      if (!visited.has(n.id)) ordered.push(n);
    }

    const chain: ChainNode[] = [];
    for (const node of ordered) {
      const meta = metadataMap[node.type];
      if (!meta) continue;

      // Build inputMappings from all incoming edges
      const incomingEdges = edgesByTarget.get(node.id) ?? [];
      const inputMappings: InputMappings = {};
      for (const edge of incomingEdges) {
        inputMappings[edge.targetHandle] = {
          sourceNodeId: edge.source,
          sourceOutput: edge.sourceHandle,
        };
      }

      const outgoingEdge = edgesBySource.get(node.id)?.[0];
      const selectedOutput = outgoingEdge?.sourceHandle ?? (meta.outputs[0]?.name ?? "");

      chain.push({
        id: node.id,
        nodeType: node.type,
        metadata: meta,
        properties: (node.data ?? {}) as Record<string, unknown>,
        selectedOutput,
        inputMappings,
        expanded: false,
      });
    }

    // Sort: input nodes first, then regular nodes, then output nodes
    chain.sort((a, b) => {
      const aInput = isInputNode(a.nodeType) ? 0 : isOutputNode(a.nodeType) ? 2 : 1;
      const bInput = isInputNode(b.nodeType) ? 0 : isOutputNode(b.nodeType) ? 2 : 1;
      return aInput - bInput;
    });

    set({
      chain,
      connections: buildConnections(chain),
      workflowId: workflow.id,
      workflowName: workflow.name,
    });
  },

  toWorkflowGraph: () => {
    const { chain, connections } = get();
    return chainToGraph(chain, connections);
  },

  newWorkflow: (name) => {
    set({ chain: [], connections: [], workflowId: null, workflowName: name ?? "Untitled Workflow" });
  },

  setWorkflowName: (name) => {
    set({ workflowName: name });
  },
}));
