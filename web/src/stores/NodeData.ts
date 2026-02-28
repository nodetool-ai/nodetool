import { TypeMetadata } from "./ApiTypes";

export type NodeData = {
  properties: Record<string, unknown>;
  selectable: boolean | undefined;
  dynamic_properties: Record<string, unknown>;
  /** Schema-defined input types + descriptions (e.g. from FAL resolve); used for correct types and connection-only inputs */
  dynamic_inputs?: Record<
    string,
    TypeMetadata & { description?: string; min?: number; max?: number; default?: unknown }
  >;
  dynamic_outputs?: Record<string, TypeMetadata>;
  /** Resolved FAL model/endpoint id (e.g. fal-ai/flux-pro) when schema is loaded */
  endpoint_id?: string;
  /** Resolved Kie.ai model id when schema is loaded */
  model_id?: string;
  sync_mode?: string;
  workflow_id: string;
  title?: string;
  color?: string;
  collapsed?: boolean;
  bypassed?: boolean; // When true, node is bypassed and passes inputs through to outputs
  showResultPreference?: boolean; // User preference: true = show results after run, false/undefined = show inputs
  // Original node type from the workflow graph (useful when React Flow falls back to "default" type)
  originalType?: string;
  size?: {
    width: number;
    height: number;
  };
  positionAbsolute?: {
    x: number;
    y: number;
  };
};
