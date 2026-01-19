import type { Node, Edge } from '@xyflow/react';

export type NodeChangeType = 'added' | 'removed' | 'modified' | 'unchanged';
export type EdgeChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

export interface NodeDiff {
  nodeId: string;
  changeType: NodeChangeType;
  node?: Node;
  changes?: {
    position?: { old: { x: number; y: number }; new: { x: number; y: number } };
    data?: { old: Record<string, unknown>; new: Record<string, unknown> };
    label?: { old: string; new: string };
  };
}

export interface EdgeDiff {
  edgeId: string;
  changeType: EdgeChangeType;
  edge?: Edge;
  changes?: {
    source?: { old: string; new: string };
    target?: { old: string; new: string };
    label?: { old: string; new: string };
  };
}

export interface WorkflowDiff {
  addedNodes: NodeDiff[];
  removedNodes: NodeDiff[];
  modifiedNodes: NodeDiff[];
  unchangedNodes: NodeDiff[];
  addedEdges: EdgeDiff[];
  removedEdges: EdgeDiff[];
  modifiedEdges: EdgeDiff[];
  unchangedEdges: EdgeDiff[];
  summary: {
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    edgesAdded: number;
    edgesRemoved: number;
    edgesModified: number;
  };
}

export interface WorkflowDiffViewProps {
  oldVersion: {
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
    updatedAt: string;
  };
  newVersion: {
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
    updatedAt: string;
  };
  diff: WorkflowDiff;
  viewMode?: 'unified' | 'split';
  onNodeClick?: (nodeId: string) => void;
  onClose?: () => void;
}

export interface DiffNodeProps {
  node: Node;
  changeType: NodeChangeType;
  onClick?: () => void;
}
