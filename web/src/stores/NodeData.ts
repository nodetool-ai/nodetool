import { TypeMetadata } from "./ApiTypes";

export type NodeData = {
  properties: any;
  selectable: boolean | undefined;
  dynamic_properties: any;
  dynamic_outputs?: Record<string, TypeMetadata>;
  sync_mode?: string;
  workflow_id: string;
  title?: string;
  color?: string;
  collapsed?: boolean;
  bypassed?: boolean; // When true, node is bypassed and passes inputs through to outputs
  // Original node type from the workflow graph (useful when React Flow falls back to "default" type)
  originalType?: string;
  // User-added comment/annotation for documenting the node
  comment?: string;
  size?: {
    width: number;
    height: number;
  };
  positionAbsolute?: {
    x: number;
    y: number;
  };
};
