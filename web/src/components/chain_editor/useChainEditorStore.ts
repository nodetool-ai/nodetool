/**
 * Zustand store for the web chain-based graph editor.
 */

import { create } from "zustand";
import useMetadataStore from "../../stores/MetadataStore";
import type { NodeMetadata, Workflow } from "../../stores/ApiTypes";
import type { ChainNode, ChainConnection } from "./chainTypes";
import { buildConnections, chainToGraph, findBestInput } from "./chainTypes";

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
  setInputMapping: (nodeId: string, inputName: string) => void;
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
    if (fromIndex < 0 || fromIndex >= chain.length || toIndex < 0 || toIndex >= chain.length) return;

    const updated = [...chain];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    for (let i = 0; i < updated.length; i++) {
      if (i === 0) {
        updated[i].inputMapping = null;
      } else {
        const prev = updated[i - 1];
        const prevOutput = prev.metadata.outputs.find((o) => o.name === prev.selectedOutput);
        if (prevOutput) {
          updated[i].inputMapping = findBestInput(updated[i].metadata, prevOutput.type);
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

  updateProperty: (nodeId, name, value) => {
    set((state) => ({
      chain: state.chain.map((n) =>
        n.id === nodeId ? { ...n, properties: { ...n.properties, [name]: value } } : n
      ),
    }));
  },

  setSelectedOutput: (nodeId, outputName) => {
    const { chain } = get();
    const idx = chain.findIndex((n) => n.id === nodeId);
    if (idx === -1) return;

    const updated = chain.map((n, i) => (i === idx ? { ...n, selectedOutput: outputName } : n));

    if (idx < updated.length - 1) {
      const source = updated[idx];
      const output = source.metadata.outputs.find((o) => o.name === outputName);
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
      const chain = state.chain.map((n) => (n.id === nodeId ? { ...n, inputMapping: inputName } : n));
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

    const edgesByTarget = new Map<string, { source: string; sourceHandle: string; targetHandle: string }>();
    for (const e of workflow.graph.edges) {
      edgesByTarget.set(e.target, {
        source: e.source,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      });
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
      for (const e of workflow.graph.edges) {
        if (e.source === nodeId) visit(e.target);
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

      const edgeInfo = edgesByTarget.get(node.id);
      const inputMapping = edgeInfo ? edgeInfo.targetHandle : null;
      const outgoingEdge = workflow.graph.edges.find((e) => e.source === node.id);
      const selectedOutput = outgoingEdge?.sourceHandle ?? (meta.outputs[0]?.name ?? "");

      chain.push({
        id: node.id,
        nodeType: node.type,
        metadata: meta,
        properties: (node.data ?? {}) as Record<string, unknown>,
        selectedOutput,
        inputMapping,
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
