// Types for mini apps - adapted from web/src/components/miniapps/types.ts

export type MiniAppInputKind = "string" | "integer" | "float" | "boolean" | "image" | "audio" | "file_path";

export interface InputNodeData {
  name: string;
  label: string;
  description: string;
  min?: number;
  max?: number;
  value?: unknown;
}

export interface MiniAppInputDefinition {
  nodeId: string;
  nodeType: string;
  kind: MiniAppInputKind;
  data: InputNodeData;
  defaultValue?: unknown;
}

export interface MiniAppResult {
  id: string;
  nodeId: string;
  nodeName: string;
  outputName: string;
  outputType: string;
  value: unknown;
  metadata?: Record<string, unknown>;
  receivedAt: number;
}

export interface MiniAppProgress {
  current: number;
  total: number;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  graph?: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
}

export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}
